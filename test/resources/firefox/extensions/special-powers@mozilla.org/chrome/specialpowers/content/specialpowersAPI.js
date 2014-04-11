/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* This code is loaded in every child process that is started by mochitest in
 * order to be used as a replacement for UniversalXPConnect
 */

var Ci = Components.interfaces;
var Cc = Components.classes;
var Cu = Components.utils;

Cu.import("resource://specialpowers/MockFilePicker.jsm");
Cu.import("resource://specialpowers/MockColorPicker.jsm");
Cu.import("resource://specialpowers/MockPermissionPrompt.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/PrivateBrowsingUtils.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function SpecialPowersAPI() {
  this._consoleListeners = [];
  this._encounteredCrashDumpFiles = [];
  this._unexpectedCrashDumpFiles = { };
  this._crashDumpDir = null;
  this._mfl = null;
  this._prefEnvUndoStack = [];
  this._pendingPrefs = [];
  this._applyingPrefs = false;
  this._permissionsUndoStack = [];
  this._pendingPermissions = [];
  this._applyingPermissions = false;
  this._fm = null;
  this._cb = null;
}

function bindDOMWindowUtils(aWindow) {
  if (!aWindow)
    return

   var util = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                     .getInterface(Ci.nsIDOMWindowUtils);
   return wrapPrivileged(util);
}

function getRawComponents(aWindow) {
  // If we're running in automation that supports enablePrivilege, then we also
  // provided access to the privileged Components.
  try {
    let win = Cu.waiveXrays(aWindow);
    if (typeof win.netscape.security.PrivilegeManager == 'object')
      Cu.forcePrivilegedComponentsForScope(aWindow);
  } catch (e) {}
  return Cu.getComponentsForScope(aWindow);
}

function isWrappable(x) {
  if (typeof x === "object")
    return x !== null;
  return typeof x === "function";
};

function isWrapper(x) {
  return isWrappable(x) && (typeof x.SpecialPowers_wrappedObject !== "undefined");
};

function unwrapIfWrapped(x) {
  return isWrapper(x) ? unwrapPrivileged(x) : x;
};

function wrapIfUnwrapped(x) {
  return isWrapper(x) ? x : wrapPrivileged(x);
}

function isXrayWrapper(x) {
  return Cu.isXrayWrapper(x);
}

function callGetOwnPropertyDescriptor(obj, name) {
  // Quickstubbed getters and setters are propertyOps, and don't get reified
  // until someone calls __lookupGetter__ or __lookupSetter__ on them (note
  // that there are special version of those functions for quickstubs, so
  // apply()ing Object.prototype.__lookupGetter__ isn't good enough). Try to
  // trigger reification before calling Object.getOwnPropertyDescriptor.
  //
  // See bug 764315.
  try {
    obj.__lookupGetter__(name);
    obj.__lookupSetter__(name);
  } catch(e) { }
  return Object.getOwnPropertyDescriptor(obj, name);
}

// We can't call apply() directy on Xray-wrapped functions, so we have to be
// clever.
function doApply(fun, invocant, args) {
  return Function.prototype.apply.call(fun, invocant, args);
}

function wrapPrivileged(obj) {

  // Primitives pass straight through.
  if (!isWrappable(obj))
    return obj;

  // No double wrapping.
  if (isWrapper(obj))
    throw "Trying to double-wrap object!";

  // Make our core wrapper object.
  var handler = new SpecialPowersHandler(obj);

  // If the object is callable, make a function proxy.
  if (typeof obj === "function") {
    var callTrap = function() {
      // The invocant and arguments may or may not be wrappers. Unwrap them if necessary.
      var invocant = unwrapIfWrapped(this);
      var unwrappedArgs = Array.prototype.slice.call(arguments).map(unwrapIfWrapped);

      try {
        return wrapPrivileged(doApply(obj, invocant, unwrappedArgs));
      } catch (e) {
        // Wrap exceptions and re-throw them.
        throw wrapIfUnwrapped(e);
      }
    };
    var constructTrap = function() {
      // The arguments may or may not be wrappers. Unwrap them if necessary.
      var unwrappedArgs = Array.prototype.slice.call(arguments).map(unwrapIfWrapped);

      // We want to invoke "obj" as a constructor, but using unwrappedArgs as
      // the arguments.  Make sure to wrap and re-throw exceptions!
      try {
        return wrapPrivileged(new obj(...unwrappedArgs));
      } catch (e) {
        throw wrapIfUnwrapped(e);
      }
    };

    return Proxy.createFunction(handler, callTrap, constructTrap);
  }

  // Otherwise, just make a regular object proxy.
  return Proxy.create(handler);
};

function unwrapPrivileged(x) {

  // We don't wrap primitives, so sometimes we have a primitive where we'd
  // expect to have a wrapper. The proxy pretends to be the type that it's
  // emulating, so we can just as easily check isWrappable() on a proxy as
  // we can on an unwrapped object.
  if (!isWrappable(x))
    return x;

  // If we have a wrappable type, make sure it's wrapped.
  if (!isWrapper(x))
    throw "Trying to unwrap a non-wrapped object!";

  // Unwrap.
  return x.SpecialPowers_wrappedObject;
};

function crawlProtoChain(obj, fn) {
  var rv = fn(obj);
  if (rv !== undefined)
    return rv;
  if (Object.getPrototypeOf(obj))
    return crawlProtoChain(Object.getPrototypeOf(obj), fn);
};

/*
 * We want to waive the __exposedProps__ security check for SpecialPowers-wrapped
 * objects. We do this by creating a proxy singleton that just always returns 'rw'
 * for any property name.
 */
function ExposedPropsWaiverHandler() {
  // NB: XPConnect denies access if the relevant member of __exposedProps__ is not
  // enumerable.
  var _permit = { value: 'rw', writable: false, configurable: false, enumerable: true };
  return {
    getOwnPropertyDescriptor: function(name) { return _permit; },
    getPropertyDescriptor: function(name) { return _permit; },
    getOwnPropertyNames: function() { throw Error("Can't enumerate ExposedPropsWaiver"); },
    getPropertyNames: function() { throw Error("Can't enumerate ExposedPropsWaiver"); },
    enumerate: function() { throw Error("Can't enumerate ExposedPropsWaiver"); },
    defineProperty: function(name) { throw Error("Can't define props on ExposedPropsWaiver"); },
    delete: function(name) { throw Error("Can't delete props from ExposedPropsWaiver"); }
  };
};
ExposedPropsWaiver = Proxy.create(ExposedPropsWaiverHandler());

function SpecialPowersHandler(obj) {
  this.wrappedObject = obj;
};

// Allow us to transitively maintain the membrane by wrapping descriptors
// we return.
SpecialPowersHandler.prototype.doGetPropertyDescriptor = function(name, own) {

  // Handle our special API.
  if (name == "SpecialPowers_wrappedObject")
    return { value: this.wrappedObject, writeable: false, configurable: false, enumerable: false };

  // Handle __exposedProps__.
  if (name == "__exposedProps__")
    return { value: ExposedPropsWaiver, writable: false, configurable: false, enumerable: false };

  // In general, we want Xray wrappers for content DOM objects, because waiving
  // Xray gives us Xray waiver wrappers that clamp the principal when we cross
  // compartment boundaries. However, Xray adds some gunk to toString(), which
  // has the potential to confuse consumers that aren't expecting Xray wrappers.
  // Since toString() is a non-privileged method that returns only strings, we
  // can just waive Xray for that case.
  var obj = name == 'toString' ? XPCNativeWrapper.unwrap(this.wrappedObject)
                               : this.wrappedObject;

  //
  // Call through to the wrapped object.
  //
  // Note that we have several cases here, each of which requires special handling.
  //
  var desc;

  // Case 1: Own Properties.
  //
  // This one is easy, thanks to Object.getOwnPropertyDescriptor().
  if (own)
    desc = callGetOwnPropertyDescriptor(obj, name);

  // Case 2: Not own, not Xray-wrapped.
  //
  // Here, we can just crawl the prototype chain, calling
  // Object.getOwnPropertyDescriptor until we find what we want.
  //
  // NB: Make sure to check this.wrappedObject here, rather than obj, because
  // we may have waived Xray on obj above.
  else if (!isXrayWrapper(this.wrappedObject))
    desc = crawlProtoChain(obj, function(o) {return callGetOwnPropertyDescriptor(o, name);});

  // Case 3: Not own, Xray-wrapped.
  //
  // This one is harder, because we Xray wrappers are flattened and don't have
  // a prototype. Xray wrappers are proxies themselves, so we'd love to just call
  // through to XrayWrapper<Base>::getPropertyDescriptor(). Unfortunately though,
  // we don't have any way to do that. :-(
  //
  // So we first try with a call to getOwnPropertyDescriptor(). If that fails,
  // we make up a descriptor, using some assumptions about what kinds of things
  // tend to live on the prototypes of Xray-wrapped objects.
  else {
    desc = Object.getOwnPropertyDescriptor(obj, name);
    if (!desc) {
      var getter = Object.prototype.__lookupGetter__.call(obj, name);
      var setter = Object.prototype.__lookupSetter__.call(obj, name);
      if (getter || setter)
        desc = {get: getter, set: setter, configurable: true, enumerable: true};
      else if (name in obj)
        desc = {value: obj[name], writable: false, configurable: true, enumerable: true};
    }
  }

  // Bail if we've got nothing.
  if (typeof desc === 'undefined')
    return undefined;

  // When accessors are implemented as JSPropertyOps rather than JSNatives (ie,
  // QuickStubs), the js engine does the wrong thing and treats it as a value
  // descriptor rather than an accessor descriptor. Jorendorff suggested this
  // little hack to work around it. See bug 520882.
  if (desc && 'value' in desc && desc.value === undefined)
    desc.value = obj[name];

  // A trapping proxy's properties must always be configurable, but sometimes
  // this we get non-configurable properties from Object.getOwnPropertyDescriptor().
  // Tell a white lie.
  desc.configurable = true;

  // Transitively maintain the wrapper membrane.
  function wrapIfExists(key) { if (key in desc) desc[key] = wrapPrivileged(desc[key]); };
  wrapIfExists('value');
  wrapIfExists('get');
  wrapIfExists('set');

  return desc;
};

SpecialPowersHandler.prototype.getOwnPropertyDescriptor = function(name) {
  return this.doGetPropertyDescriptor(name, true);
};

SpecialPowersHandler.prototype.getPropertyDescriptor = function(name) {
  return this.doGetPropertyDescriptor(name, false);
};

function doGetOwnPropertyNames(obj, props) {

  // Insert our special API. It's not enumerable, but getPropertyNames()
  // includes non-enumerable properties.
  var specialAPI = 'SpecialPowers_wrappedObject';
  if (props.indexOf(specialAPI) == -1)
    props.push(specialAPI);

  // Do the normal thing.
  var flt = function(a) { return props.indexOf(a) == -1; };
  props = props.concat(Object.getOwnPropertyNames(obj).filter(flt));

  // If we've got an Xray wrapper, include the expandos as well.
  if ('wrappedJSObject' in obj)
    props = props.concat(Object.getOwnPropertyNames(obj.wrappedJSObject)
                         .filter(flt));

  return props;
}

SpecialPowersHandler.prototype.getOwnPropertyNames = function() {
  return doGetOwnPropertyNames(this.wrappedObject, []);
};

SpecialPowersHandler.prototype.getPropertyNames = function() {

  // Manually walk the prototype chain, making sure to add only property names
  // that haven't been overridden.
  //
  // There's some trickiness here with Xray wrappers. Xray wrappers don't have
  // a prototype, so we need to unwrap them if we want to get all of the names
  // with Object.getOwnPropertyNames(). But we don't really want to unwrap the
  // base object, because that will include expandos that are inaccessible via
  // our implementation of get{,Own}PropertyDescriptor(). So we unwrap just
  // before accessing the prototype. This ensures that we get Xray vision on
  // the base object, and no Xray vision for the rest of the way up.
  var obj = this.wrappedObject;
  var props = [];
  while (obj) {
    props = doGetOwnPropertyNames(obj, props);
    obj = Object.getPrototypeOf(XPCNativeWrapper.unwrap(obj));
  }
  return props;
};

SpecialPowersHandler.prototype.defineProperty = function(name, desc) {
  return Object.defineProperty(this.wrappedObject, name, desc);
};

SpecialPowersHandler.prototype.delete = function(name) {
  return delete this.wrappedObject[name];
};

SpecialPowersHandler.prototype.fix = function() { return undefined; /* Throws a TypeError. */ };

// Per the ES5 spec this is a derived trap, but it's fundamental in spidermonkey
// for some reason. See bug 665198.
SpecialPowersHandler.prototype.enumerate = function() {
  var t = this;
  var filt = function(name) { return t.getPropertyDescriptor(name).enumerable; };
  return this.getPropertyNames().filter(filt);
};

// SPConsoleListener reflects nsIConsoleMessage objects into JS in a
// tidy, XPCOM-hiding way.  Messages that are nsIScriptError objects
// have their properties exposed in detail.  It also auto-unregisters
// itself when it receives a "sentinel" message.
function SPConsoleListener(callback) {
  this.callback = callback;
}

SPConsoleListener.prototype = {
  observe: function(msg) {
    let m = { message: msg.message,
              errorMessage: null,
              sourceName: null,
              sourceLine: null,
              lineNumber: null,
              columnNumber: null,
              category: null,
              windowID: null,
              isScriptError: false,
              isWarning: false,
              isException: false,
              isStrict: false };
    if (msg instanceof Ci.nsIScriptError) {
      m.errorMessage  = msg.errorMessage;
      m.sourceName    = msg.sourceName;
      m.sourceLine    = msg.sourceLine;
      m.lineNumber    = msg.lineNumber;
      m.columnNumber  = msg.columnNumber;
      m.category      = msg.category;
      m.windowID      = msg.outerWindowID;
      m.isScriptError = true;
      m.isWarning     = ((msg.flags & Ci.nsIScriptError.warningFlag) === 1);
      m.isException   = ((msg.flags & Ci.nsIScriptError.exceptionFlag) === 1);
      m.isStrict      = ((msg.flags & Ci.nsIScriptError.strictFlag) === 1);
    }

    // expose all props of 'm' as read-only
    let expose = {};
    for (let prop in m)
      expose[prop] = 'r';
    m.__exposedProps__ = expose;
    Object.freeze(m);

    this.callback.call(undefined, m);

    if (!m.isScriptError && m.message === "SENTINEL")
      Services.console.unregisterListener(this);
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIConsoleListener])
};

function wrapCallback(cb) {
  return function SpecialPowersCallbackWrapper() {
    args = Array.prototype.map.call(arguments, wrapIfUnwrapped);
    return cb.apply(this, args);
  }
}

function wrapCallbackObject(obj) {
  wrapper = { __exposedProps__: ExposedPropsWaiver };
  for (var i in obj) {
    if (typeof obj[i] == 'function')
      wrapper[i] = wrapCallback(obj[i]);
    else
      wrapper[i] = obj[i];
  }
  return wrapper;
}

SpecialPowersAPI.prototype = {

  /*
   * Privileged object wrapping API
   *
   * Usage:
   *   var wrapper = SpecialPowers.wrap(obj);
   *   wrapper.privilegedMethod(); wrapper.privilegedProperty;
   *   obj === SpecialPowers.unwrap(wrapper);
   *
   * These functions provide transparent access to privileged objects using
   * various pieces of deep SpiderMagic. Conceptually, a wrapper is just an
   * object containing a reference to the underlying object, where all method
   * calls and property accesses are transparently performed with the System
   * Principal. Moreover, objects obtained from the wrapper (including properties
   * and method return values) are wrapped automatically. Thus, after a single
   * call to SpecialPowers.wrap(), the wrapper layer is transitively maintained.
   *
   * Known Issues:
   *
   *  - The wrapping function does not preserve identity, so
   *    SpecialPowers.wrap(foo) !== SpecialPowers.wrap(foo). See bug 718543.
   *
   *  - The wrapper cannot see expando properties on unprivileged DOM objects.
   *    That is to say, the wrapper uses Xray delegation.
   *
   *  - The wrapper sometimes guesses certain ES5 attributes for returned
   *    properties. This is explained in a comment in the wrapper code above,
   *    and shouldn't be a problem.
   */
  wrap: wrapIfUnwrapped,
  unwrap: unwrapIfWrapped,
  isWrapper: isWrapper,

  /*
   * When content needs to pass a callback or a callback object to an API
   * accessed over SpecialPowers, that API may sometimes receive arguments for
   * whom it is forbidden to create a wrapper in content scopes. As such, we
   * need a layer to wrap the values in SpecialPowers wrappers before they ever
   * reach content.
   */
  wrapCallback: wrapCallback,
  wrapCallbackObject: wrapCallbackObject,

  /*
   * Create blank privileged objects to use as out-params for privileged functions.
   */
  createBlankObject: function () {
    var obj = new Object;
    obj.__exposedProps__ = ExposedPropsWaiver;
    return obj;
  },

  /*
   * Because SpecialPowers wrappers don't preserve identity, comparing with ==
   * can be hazardous. Sometimes we can just unwrap to compare, but sometimes
   * wrapping the underlying object into a content scope is forbidden. This
   * function strips any wrappers if they exist and compare the underlying
   * values.
   */
  compare: function(a, b) {
    return unwrapIfWrapped(a) === unwrapIfWrapped(b);
  },

  get MockFilePicker() {
    return MockFilePicker
  },

  get MockColorPicker() {
    return MockColorPicker
  },

  get MockPermissionPrompt() {
    return MockPermissionPrompt
  },

  loadChromeScript: function (url) {
    // Create a unique id for this chrome script
    let uuidGenerator = Cc["@mozilla.org/uuid-generator;1"]
                          .getService(Ci.nsIUUIDGenerator);
    let id = uuidGenerator.generateUUID().toString();

    // Tells chrome code to evaluate this chrome script
    this._sendSyncMessage("SPLoadChromeScript",
                          { url: url, id: id });

    // Returns a MessageManager like API in order to be
    // able to communicate with this chrome script
    let listeners = [];
    let chromeScript = {
      addMessageListener: (name, listener) => {
        listeners.push({ name: name, listener: listener });
      },

      removeMessageListener: (name, listener) => {
        listeners = listeners.filter(
          o => (o.name != name || o.listener != listener)
        );
      },

      sendAsyncMessage: (name, message) => {
        this._sendSyncMessage("SPChromeScriptMessage",
                              { id: id, name: name, message: message });
      },

      destroy: () => {
        listeners = [];
        this._removeMessageListener("SPChromeScriptMessage", chromeScript);
        this._removeMessageListener("SPChromeScriptAssert", chromeScript);
      },

      receiveMessage: (aMessage) => {
        let messageId = aMessage.json.id;
        let name = aMessage.json.name;
        let message = aMessage.json.message;
        // Ignore message from other chrome script
        if (messageId != id)
          return;

        if (aMessage.name == "SPChromeScriptMessage") {
          listeners.filter(o => (o.name == name))
                   .forEach(o => o.listener(this.wrap(message)));
        } else if (aMessage.name == "SPChromeScriptAssert") {
          assert(aMessage.json);
        }
      }
    };
    this._addMessageListener("SPChromeScriptMessage", chromeScript);
    this._addMessageListener("SPChromeScriptAssert", chromeScript);

    let assert = json => {
      // An assertion has been done in a mochitest chrome script
      let {url, err, message, stack} = json;

      // Try to fetch a test runner from the mochitest
      // in order to properly log these assertions and notify
      // all usefull log observers
      let window = this.window.get();
      let parentRunner, repr = function (o) o;
      if (window) {
        window = window.wrappedJSObject;
        parentRunner = window.TestRunner;
        if (window.repr) {
          repr = window.repr;
        }
      }

      // Craft a mochitest-like report string
      var resultString = err ? "TEST-UNEXPECTED-FAIL" : "TEST-PASS";
      var diagnostic =
        message ? message :
                  ("assertion @ " + stack.filename + ":" + stack.lineNumber);
      if (err) {
        diagnostic +=
          " - got " + repr(err.actual) +
          ", expected " + repr(err.expected) +
          " (operator " + err.operator + ")";
      }
      var msg = [resultString, url, diagnostic].join(" | ");
      if (parentRunner) {
        if (err) {
          parentRunner.addFailedTest(url);
          parentRunner.error(msg);
        } else {
          parentRunner.log(msg);
        }
      } else {
        // When we are running only a single mochitest, there is no test runner
        dump(msg + "\n");
      }
    };

    return this.wrap(chromeScript);
  },

  get Services() {
    return wrapPrivileged(Services);
  },

  /*
   * In general, any Components object created for unprivileged scopes is
   * neutered (it implements nsIXPCComponentsBase, but not nsIXPCComponents).
   * We override this in certain legacy automation configurations (see the
   * implementation of getRawComponents() above), but don't want to support
   * it in cases where it isn't already required.
   *
   * In scopes with neutered Components, we don't have a natural referent for
   * things like SpecialPowers.Cc. So in those cases, we fall back to the
   * Components object from the SpecialPowers scope. This doesn't quite behave
   * the same way (in particular, SpecialPowers.Cc[foo].createInstance() will
   * create an instance in the SpecialPowers scope), but SpecialPowers wrapping
   * is already a YMMV / Whatever-It-Takes-To-Get-TBPL-Green sort of thing.
   *
   * It probably wouldn't be too much work to just make SpecialPowers.Components
   * unconditionally point to the Components object in the SpecialPowers scope.
   * Try will tell what needs to be fixed up.
   */
  getFullComponents: function() {
    return typeof this.Components.classes == 'object' ? this.Components
                                                      : Components;
  },

  /*
   * Convenient shortcuts to the standard Components abbreviations. Note that
   * we don't SpecialPowers-wrap Components.interfaces, because it's available
   * to untrusted content, and wrapping it confuses QI and identity checks.
   */
  get Cc() { return wrapPrivileged(this.getFullComponents()).classes; },
  get Ci() { return this.Components.interfaces; },
  get Cu() { return wrapPrivileged(this.getFullComponents()).utils; },
  get Cr() { return wrapPrivileged(this.Components).results; },

  /*
   * SpecialPowers.getRawComponents() allows content to get a reference to a
   * naked (and, in certain automation configurations, privileged) Components
   * object for its scope.
   *
   * SpecialPowers.getRawComponents(window) is defined as the global property
   * window.SpecialPowers.Components for convenience.
   */
  getRawComponents: getRawComponents,

  getDOMWindowUtils: function(aWindow) {
    if (aWindow == this.window.get() && this.DOMWindowUtils != null)
      return this.DOMWindowUtils;

    return bindDOMWindowUtils(aWindow);
  },

  removeExpectedCrashDumpFiles: function(aExpectingProcessCrash) {
    var success = true;
    if (aExpectingProcessCrash) {
      var message = {
        op: "delete-crash-dump-files",
        filenames: this._encounteredCrashDumpFiles
      };
      if (!this._sendSyncMessage("SPProcessCrashService", message)[0]) {
        success = false;
      }
    }
    this._encounteredCrashDumpFiles.length = 0;
    return success;
  },

  findUnexpectedCrashDumpFiles: function() {
    var self = this;
    var message = {
      op: "find-crash-dump-files",
      crashDumpFilesToIgnore: this._unexpectedCrashDumpFiles
    };
    var crashDumpFiles = this._sendSyncMessage("SPProcessCrashService", message)[0];
    crashDumpFiles.forEach(function(aFilename) {
      self._unexpectedCrashDumpFiles[aFilename] = true;
    });
    return crashDumpFiles;
  },

  _delayCallbackTwice: function(callback) {
    function delayedCallback() {
      function delayAgain() {
	content.window.setTimeout(callback, 0);
      }
      content.window.setTimeout(delayAgain, 0);
    }
    return delayedCallback;
  },

  /* apply permissions to the system and when the test case is finished (SimpleTest.finish())
     we will revert the permission back to the original.

     inPermissions is an array of objects where each object has a type, action, context, ex:
     [{'type': 'SystemXHR', 'allow': 1, 'context': document}, 
      {'type': 'SystemXHR', 'allow': Ci.nsIPermissionManager.PROMPT_ACTION, 'context': document}]

     Allow can be a boolean value of true/false or ALLOW_ACTION/DENY_ACTION/PROMPT_ACTION/UNKNOWN_ACTION
  */
  pushPermissions: function(inPermissions, callback) {
    var pendingPermissions = [];
    var cleanupPermissions = [];

    for (var p in inPermissions) {
        var permission = inPermissions[p];
        var originalValue = Ci.nsIPermissionManager.UNKNOWN_ACTION;
        if (this.testPermission(permission.type, Ci.nsIPermissionManager.ALLOW_ACTION, permission.context)) {
          originalValue = Ci.nsIPermissionManager.ALLOW_ACTION;
        } else if (this.testPermission(permission.type, Ci.nsIPermissionManager.DENY_ACTION, permission.context)) {
          originalValue = Ci.nsIPermissionManager.DENY_ACTION;
        } else if (this.testPermission(permission.type, Ci.nsIPermissionManager.PROMPT_ACTION, permission.context)) {
          originalValue = Ci.nsIPermissionManager.PROMPT_ACTION;
        } else if (this.testPermission(permission.type, Ci.nsICookiePermission.ACCESS_SESSION, permission.context)) {
          originalValue = Ci.nsICookiePermission.ACCESS_SESSION;
        } else if (this.testPermission(permission.type, Ci.nsICookiePermission.ACCESS_ALLOW_FIRST_PARTY_ONLY, permission.context)) {
          originalValue = Ci.nsICookiePermission.ACCESS_ALLOW_FIRST_PARTY_ONLY;
        } else if (this.testPermission(permission.type, Ci.nsICookiePermission.ACCESS_LIMIT_THIRD_PARTY, permission.context)) {
          originalValue = Ci.nsICookiePermission.ACCESS_LIMIT_THIRD_PARTY;
        }

        let [url, appId, isInBrowserElement] = this._getInfoFromPermissionArg(permission.context);

        let perm;
        if (typeof permission.allow !== 'boolean') {
          perm = permission.allow;
        } else {
          perm = permission.allow ? Ci.nsIPermissionManager.ALLOW_ACTION
                             : Ci.nsIPermissionManager.DENY_ACTION;
        }

        if (permission.remove == true)
          perm = Ci.nsIPermissionManager.UNKNOWN_ACTION;

        if (originalValue == perm) {
          continue;
        }

        var todo = {'op': 'add', 'type': permission.type, 'permission': perm, 'value': perm, 'url': url, 'appId': appId, 'isInBrowserElement': isInBrowserElement};
        if (permission.remove == true)
          todo.op = 'remove';

        pendingPermissions.push(todo);

        /* Push original permissions value or clear into cleanup array */
        var cleanupTodo = {'op': 'add', 'type': permission.type, 'permission': perm, 'value': perm, 'url': url, 'appId': appId, 'isInBrowserElement': isInBrowserElement};
        if (originalValue == Ci.nsIPermissionManager.UNKNOWN_ACTION) {
          cleanupTodo.op = 'remove';
        } else {
          cleanupTodo.value = originalValue;
          cleanupTodo.permission = originalValue;
        }
        cleanupPermissions.push(cleanupTodo);
    }

    if (pendingPermissions.length > 0) {
      // The callback needs to be delayed twice. One delay is because the pref
      // service doesn't guarantee the order it calls its observers in, so it
      // may notify the observer holding the callback before the other
      // observers have been notified and given a chance to make the changes
      // that the callback checks for. The second delay is because pref
      // observers often defer making their changes by posting an event to the
      // event loop.
      this._permissionsUndoStack.push(cleanupPermissions);
      this._pendingPermissions.push([pendingPermissions,
				     this._delayCallbackTwice(callback)]);
      this._applyPermissions();
    } else {
      content.window.setTimeout(callback, 0);
    }
  },

  popPermissions: function(callback) {
    if (this._permissionsUndoStack.length > 0) {
      // See pushPermissions comment regarding delay.
      let cb = callback ? this._delayCallbackTwice(callback) : null;
      /* Each pop from the stack will yield an object {op/type/permission/value/url/appid/isInBrowserElement} or null */
      this._pendingPermissions.push([this._permissionsUndoStack.pop(), cb]);
      this._applyPermissions();
    } else {
      content.window.setTimeout(callback, 0);
    }
  },

  flushPermissions: function(callback) {
    while (this._permissionsUndoStack.length > 1)
      this.popPermissions(null);

    this.popPermissions(callback);
  },


  _permissionObserver: {
    _lastPermission: {},
    _callBack: null,
    _nextCallback: null,

    observe: function (aSubject, aTopic, aData)
    {
      if (aTopic == "perm-changed") {
        var permission = aSubject.QueryInterface(Ci.nsIPermission);
        if (permission.type == this._lastPermission.type) {
          var os = Components.classes["@mozilla.org/observer-service;1"]
                             .getService(Components.interfaces.nsIObserverService);
          os.removeObserver(this, "perm-changed");
          content.window.setTimeout(this._callback, 0);
          content.window.setTimeout(this._nextCallback, 0);
        }
      }
    }
  },

  /*
    Iterate through one atomic set of permissions actions and perform allow/deny as appropriate.
    All actions performed must modify the relevant permission.
  */
  _applyPermissions: function() {
    if (this._applyingPermissions || this._pendingPermissions.length <= 0) {
      return;
    }

    /* Set lock and get prefs from the _pendingPrefs queue */
    this._applyingPermissions = true;
    var transaction = this._pendingPermissions.shift();
    var pendingActions = transaction[0];
    var callback = transaction[1];
    var lastPermission = pendingActions[pendingActions.length-1];

    var self = this;
    var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    this._permissionObserver._lastPermission = lastPermission;
    this._permissionObserver._callback = callback;
    this._permissionObserver._nextCallback = function () {
        self._applyingPermissions = false;
        // Now apply any permissions that may have been queued while we were applying
        self._applyPermissions();
    }

    os.addObserver(this._permissionObserver, "perm-changed", false);

    for (var idx in pendingActions) {
      var perm = pendingActions[idx];
      this._sendSyncMessage('SPPermissionManager', perm)[0];
    }
  },

  /*
   * Take in a list of pref changes to make, and invoke |callback| once those
   * changes have taken effect.  When the test finishes, these changes are
   * reverted.
   *
   * |inPrefs| must be an object with up to two properties: "set" and "clear".
   * pushPrefEnv will set prefs as indicated in |inPrefs.set| and will unset
   * the prefs indicated in |inPrefs.clear|.
   *
   * For example, you might pass |inPrefs| as:
   *
   *  inPrefs = {'set': [['foo.bar', 2], ['magic.pref', 'baz']],
   *             'clear': [['clear.this'], ['also.this']] };
   *
   * Notice that |set| and |clear| are both an array of arrays.  In |set|, each
   * of the inner arrays must have the form [pref_name, value] or [pref_name,
   * value, iid].  (The latter form is used for prefs with "complex" values.)
   *
   * In |clear|, each inner array should have the form [pref_name].
   *
   * If you set the same pref more than once (or both set and clear a pref),
   * the behavior of this method is undefined.
   *
   * (Implementation note: _prefEnvUndoStack is a stack of values to revert to,
   * not values which have been set!)
   *
   * TODO: complex values for original cleanup?
   *
   */
  pushPrefEnv: function(inPrefs, callback) {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].
                           getService(Components.interfaces.nsIPrefBranch);

    var pref_string = [];
    pref_string[prefs.PREF_INT] = "INT";
    pref_string[prefs.PREF_BOOL] = "BOOL";
    pref_string[prefs.PREF_STRING] = "CHAR";

    var pendingActions = [];
    var cleanupActions = [];

    for (var action in inPrefs) { /* set|clear */
      for (var idx in inPrefs[action]) {
        var aPref = inPrefs[action][idx];
        var prefName = aPref[0];
        var prefValue = null;
        var prefIid = null;
        var prefType = prefs.PREF_INVALID;
        var originalValue = null;

        if (aPref.length == 3) {
          prefValue = aPref[1];
          prefIid = aPref[2];
        } else if (aPref.length == 2) {
          prefValue = aPref[1];
        }

        /* If pref is not found or invalid it doesn't exist. */
        if (prefs.getPrefType(prefName) != prefs.PREF_INVALID) {
          prefType = pref_string[prefs.getPrefType(prefName)];
          if ((prefs.prefHasUserValue(prefName) && action == 'clear') ||
              (action == 'set'))
            originalValue = this._getPref(prefName, prefType);
        } else if (action == 'set') {
          /* prefName doesn't exist, so 'clear' is pointless */
          if (aPref.length == 3) {
            prefType = "COMPLEX";
          } else if (aPref.length == 2) {
            if (typeof(prefValue) == "boolean")
              prefType = "BOOL";
            else if (typeof(prefValue) == "number")
              prefType = "INT";
            else if (typeof(prefValue) == "string")
              prefType = "CHAR";
          }
        }

        /* PREF_INVALID: A non existing pref which we are clearing or invalid values for a set */
        if (prefType == prefs.PREF_INVALID)
          continue;

        /* We are not going to set a pref if the value is the same */
        if (originalValue == prefValue)
          continue;

        pendingActions.push({'action': action, 'type': prefType, 'name': prefName, 'value': prefValue, 'Iid': prefIid});

        /* Push original preference value or clear into cleanup array */
        var cleanupTodo = {'action': action, 'type': prefType, 'name': prefName, 'value': originalValue, 'Iid': prefIid};
        if (originalValue == null) {
          cleanupTodo.action = 'clear';
        } else {
          cleanupTodo.action = 'set';
        }
        cleanupActions.push(cleanupTodo);
      }
    }

    if (pendingActions.length > 0) {
      // The callback needs to be delayed twice. One delay is because the pref
      // service doesn't guarantee the order it calls its observers in, so it
      // may notify the observer holding the callback before the other
      // observers have been notified and given a chance to make the changes
      // that the callback checks for. The second delay is because pref
      // observers often defer making their changes by posting an event to the
      // event loop.
      this._prefEnvUndoStack.push(cleanupActions);
      this._pendingPrefs.push([pendingActions,
			       this._delayCallbackTwice(callback)]);
      this._applyPrefs();
    } else {
      content.window.setTimeout(callback, 0);
    }
  },

  popPrefEnv: function(callback) {
    if (this._prefEnvUndoStack.length > 0) {
      // See pushPrefEnv comment regarding delay.
      let cb = callback ? this._delayCallbackTwice(callback) : null;
      /* Each pop will have a valid block of preferences */
      this._pendingPrefs.push([this._prefEnvUndoStack.pop(), cb]);
      this._applyPrefs();
    } else {
      content.window.setTimeout(callback, 0);
    }
  },

  flushPrefEnv: function(callback) {
    while (this._prefEnvUndoStack.length > 1)
      this.popPrefEnv(null);

    this.popPrefEnv(callback);
  },

  /*
    Iterate through one atomic set of pref actions and perform sets/clears as appropriate.
    All actions performed must modify the relevant pref.
  */
  _applyPrefs: function() {
    if (this._applyingPrefs || this._pendingPrefs.length <= 0) {
      return;
    }

    /* Set lock and get prefs from the _pendingPrefs queue */
    this._applyingPrefs = true;
    var transaction = this._pendingPrefs.shift();
    var pendingActions = transaction[0];
    var callback = transaction[1];

    var lastPref = pendingActions[pendingActions.length-1];

    var pb = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
    var self = this;
    pb.addObserver(lastPref.name, function prefObs(subject, topic, data) {
      pb.removeObserver(lastPref.name, prefObs);

      content.window.setTimeout(callback, 0);
      content.window.setTimeout(function () {
        self._applyingPrefs = false;
        // Now apply any prefs that may have been queued while we were applying
        self._applyPrefs();
      }, 0);
    }, false);

    for (var idx in pendingActions) {
      var pref = pendingActions[idx];
      if (pref.action == 'set') {
        this._setPref(pref.name, pref.type, pref.value, pref.Iid);
      } else if (pref.action == 'clear') {
        this.clearUserPref(pref.name);
      }
    }
  },

  // Disables the app install prompt for the duration of this test. There is
  // no need to re-enable the prompt at the end of the test.
  //
  // The provided callback is invoked once the prompt is disabled.
  autoConfirmAppInstall: function(cb) {
    this.pushPrefEnv({set: [['dom.mozApps.auto_confirm_install', true]]}, cb);
  },

  // Allow tests to disable the per platform app validity checks so we can
  // test higher level WebApp functionality without full platform support.
  setAllAppsLaunchable: function(launchable) {
    var message = {
      op: "set-launchable",
      launchable: launchable
    };
    return this._sendSyncMessage("SPWebAppService", message);
  },

  _proxiedObservers: {
    "specialpowers-http-notify-request": function(aMessage) {
      let uri = aMessage.json.uri;
      Services.obs.notifyObservers(null, "specialpowers-http-notify-request", uri);
    },
  },

  _addObserverProxy: function(notification) {
    if (notification in this._proxiedObservers) {
      this._addMessageListener(notification, this._proxiedObservers[notification]);
    }
  },

  _removeObserverProxy: function(notification) {
    if (notification in this._proxiedObservers) {
      this._removeMessageListener(notification, this._proxiedObservers[notification]);
    }
  },

  addObserver: function(obs, notification, weak) {
    this._addObserverProxy(notification);
    if (typeof obs == 'object' && obs.observe.name != 'SpecialPowersCallbackWrapper')
      obs.observe = wrapCallback(obs.observe);
    var obsvc = Cc['@mozilla.org/observer-service;1']
                   .getService(Ci.nsIObserverService);
    obsvc.addObserver(obs, notification, weak);
  },
  removeObserver: function(obs, notification) {
    this._removeObserverProxy(notification);
    var obsvc = Cc['@mozilla.org/observer-service;1']
                   .getService(Ci.nsIObserverService);
    obsvc.removeObserver(obs, notification);
  },
  notifyObservers: function(subject, topic, data) {
    var obsvc = Cc['@mozilla.org/observer-service;1']
                   .getService(Ci.nsIObserverService);
    obsvc.notifyObservers(subject, topic, data);
  },

  can_QI: function(obj) {
    return obj.QueryInterface !== undefined;
  },
  do_QueryInterface: function(obj, iface) {
    return obj.QueryInterface(Ci[iface]);
  },

  call_Instanceof: function (obj1, obj2) {
     obj1=unwrapIfWrapped(obj1);
     obj2=unwrapIfWrapped(obj2);
     return obj1 instanceof obj2;
  },

  // Returns a privileged getter from an object. GetOwnPropertyDescriptor does
  // not work here because xray wrappers don't properly implement it.
  //
  // This terribleness is used by content/base/test/test_object.html because
  // <object> and <embed> tags will spawn plugins if their prototype is touched,
  // so we need to get and cache the getter of |hasRunningPlugin| if we want to
  // call it without paradoxically spawning the plugin.
  do_lookupGetter: function(obj, name) {
    return Object.prototype.__lookupGetter__.call(obj, name);
  },

  // Mimic the get*Pref API
  getBoolPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'BOOL'));
  },
  getIntPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'INT'));
  },
  getCharPref: function(aPrefName) {
    return (this._getPref(aPrefName, 'CHAR'));
  },
  getComplexValue: function(aPrefName, aIid) {
    return (this._getPref(aPrefName, 'COMPLEX', aIid));
  },

  // Mimic the set*Pref API
  setBoolPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'BOOL', aValue));
  },
  setIntPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'INT', aValue));
  },
  setCharPref: function(aPrefName, aValue) {
    return (this._setPref(aPrefName, 'CHAR', aValue));
  },
  setComplexValue: function(aPrefName, aIid, aValue) {
    return (this._setPref(aPrefName, 'COMPLEX', aValue, aIid));
  },

  // Mimic the clearUserPref API
  clearUserPref: function(aPrefName) {
    var msg = {'op':'clear', 'prefName': aPrefName, 'prefType': ""};
    this._sendSyncMessage('SPPrefService', msg);
  },

  // Private pref functions to communicate to chrome
  _getPref: function(aPrefName, aPrefType, aIid) {
    var msg = {};
    if (aIid) {
      // Overloading prefValue to handle complex prefs
      msg = {'op':'get', 'prefName': aPrefName, 'prefType':aPrefType, 'prefValue':[aIid]};
    } else {
      msg = {'op':'get', 'prefName': aPrefName,'prefType': aPrefType};
    }
    var val = this._sendSyncMessage('SPPrefService', msg);

    if (val == null || val[0] == null)
      throw "Error getting pref";
    return val[0];
  },
  _setPref: function(aPrefName, aPrefType, aValue, aIid) {
    var msg = {};
    if (aIid) {
      msg = {'op':'set','prefName':aPrefName, 'prefType': aPrefType, 'prefValue': [aIid,aValue]};
    } else {
      msg = {'op':'set', 'prefName': aPrefName, 'prefType': aPrefType, 'prefValue': aValue};
    }
    return(this._sendSyncMessage('SPPrefService', msg)[0]);
  },

  _getDocShell: function(window) {
    return window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShell);
  },
  _getMUDV: function(window) {
    return this._getDocShell(window).contentViewer
               .QueryInterface(Ci.nsIMarkupDocumentViewer);
  },
  //XXX: these APIs really ought to be removed, they're not e10s-safe.
  // (also they're pretty Firefox-specific)
  _getTopChromeWindow: function(window) {
    return window.QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIWebNavigation)
                 .QueryInterface(Ci.nsIDocShellTreeItem)
                 .rootTreeItem
                 .QueryInterface(Ci.nsIInterfaceRequestor)
                 .getInterface(Ci.nsIDOMWindow)
                 .QueryInterface(Ci.nsIDOMChromeWindow);
  },
  _getAutoCompletePopup: function(window) {
    return this._getTopChromeWindow(window).document
                                           .getElementById("PopupAutoComplete");
  },
  addAutoCompletePopupEventListener: function(window, eventname, listener) {
    this._getAutoCompletePopup(window).addEventListener(eventname,
                                                        listener,
                                                        false);
  },
  removeAutoCompletePopupEventListener: function(window, eventname, listener) {
    this._getAutoCompletePopup(window).removeEventListener(eventname,
                                                           listener,
                                                           false);
  },
  get formHistory() {
    let tmp = {};
    Cu.import("resource://gre/modules/FormHistory.jsm", tmp);
    return wrapPrivileged(tmp.FormHistory);
  },
  getFormFillController: function(window) {
    return Components.classes["@mozilla.org/satchel/form-fill-controller;1"]
                     .getService(Components.interfaces.nsIFormFillController);
  },
  attachFormFillControllerTo: function(window) {
    this.getFormFillController()
        .attachToBrowser(this._getDocShell(window),
                         this._getAutoCompletePopup(window));
  },
  detachFormFillControllerFrom: function(window) {
    this.getFormFillController().detachFromBrowser(this._getDocShell(window));
  },
  isBackButtonEnabled: function(window) {
    return !this._getTopChromeWindow(window).document
                                      .getElementById("Browser:Back")
                                      .hasAttribute("disabled");
  },
  //XXX end of problematic APIs

  addChromeEventListener: function(type, listener, capture, allowUntrusted) {
    addEventListener(type, listener, capture, allowUntrusted);
  },
  removeChromeEventListener: function(type, listener, capture) {
    removeEventListener(type, listener, capture);
  },

  // Note: each call to registerConsoleListener MUST be paired with a
  // call to postConsoleSentinel; when the callback receives the
  // sentinel it will unregister itself (_after_ calling the
  // callback).  SimpleTest.expectConsoleMessages does this for you.
  // If you register more than one console listener, a call to
  // postConsoleSentinel will zap all of them.
  registerConsoleListener: function(callback) {
    let listener = new SPConsoleListener(callback);
    Services.console.registerListener(listener);
  },
  postConsoleSentinel: function() {
    Services.console.logStringMessage("SENTINEL");
  },
  resetConsole: function() {
    Services.console.reset();
  },

  getMaxLineBoxWidth: function(window) {
    return this._getMUDV(window).maxLineBoxWidth;
  },

  setMaxLineBoxWidth: function(window, width) {
    this._getMUDV(window).changeMaxLineBoxWidth(width);
  },

  getFullZoom: function(window) {
    return this._getMUDV(window).fullZoom;
  },
  setFullZoom: function(window, zoom) {
    this._getMUDV(window).fullZoom = zoom;
  },
  getTextZoom: function(window) {
    return this._getMUDV(window).textZoom;
  },
  setTextZoom: function(window, zoom) {
    this._getMUDV(window).textZoom = zoom;
  },

  emulateMedium: function(window, mediaType) {
    this._getMUDV(window).emulateMedium(mediaType);
  },
  stopEmulatingMedium: function(window) {
    this._getMUDV(window).stopEmulatingMedium();
  },

  snapshotWindowWithOptions: function (win, rect, bgcolor, options) {
    var el = this.window.get().document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    if (rect === undefined) {
      rect = { top: win.scrollY, left: win.scrollX,
               width: win.innerWidth, height: win.innerHeight };
    }
    if (bgcolor === undefined) {
      bgcolor = "rgb(255,255,255)";
    }
    if (options === undefined) {
      options = { };
    }

    el.width = rect.width;
    el.height = rect.height;
    var ctx = el.getContext("2d");
    var flags = 0;

    for (var option in options) {
      flags |= options[option] && ctx[option];
    }

    ctx.drawWindow(win,
                   rect.left, rect.top, rect.width, rect.height,
                   bgcolor,
                   flags);
    return el;
  },

  snapshotWindow: function (win, withCaret, rect, bgcolor) {
    return this.snapshotWindowWithOptions(win, rect, bgcolor,
                                          { DRAWWINDOW_DRAW_CARET: withCaret });
  },

  snapshotRect: function (win, rect, bgcolor) {
    return this.snapshotWindowWithOptions(win, rect, bgcolor);
  },

  gc: function() {
    this.DOMWindowUtils.garbageCollect();
  },

  forceGC: function() {
    Cu.forceGC();
  },

  forceCC: function() {
    Cu.forceCC();
  },

  // Due to various dependencies between JS objects and C++ objects, an ordinary
  // forceGC doesn't necessarily clear all unused objects, thus the GC and CC
  // needs to run several times and when no other JS is running.
  // The current number of iterations has been determined according to massive
  // cross platform testing.
  exactGC: function(win, callback) {
    var self = this;
    let count = 0;

    function doPreciseGCandCC() {
      function scheduledGCCallback() {
        self.getDOMWindowUtils(win).cycleCollect();

        if (++count < 2) {
          doPreciseGCandCC();
        } else {
          callback();
        }
      }

      Cu.schedulePreciseGC(scheduledGCCallback);
    }

    doPreciseGCandCC();
  },

  setGCZeal: function(zeal) {
    Cu.setGCZeal(zeal);
  },

  isMainProcess: function() {
    try {
      return Cc["@mozilla.org/xre/app-info;1"].
               getService(Ci.nsIXULRuntime).
               processType == Ci.nsIXULRuntime.PROCESS_TYPE_DEFAULT;
    } catch (e) { }
    return true;
  },

  _xpcomabi: null,

  get XPCOMABI() {
    if (this._xpcomabi != null)
      return this._xpcomabi;

    var xulRuntime = Cc["@mozilla.org/xre/app-info;1"]
                        .getService(Components.interfaces.nsIXULAppInfo)
                        .QueryInterface(Components.interfaces.nsIXULRuntime);

    this._xpcomabi = xulRuntime.XPCOMABI;
    return this._xpcomabi;
  },

  // The optional aWin parameter allows the caller to specify a given window in
  // whose scope the runnable should be dispatched. If aFun throws, the
  // exception will be reported to aWin.
  executeSoon: function(aFun, aWin) {
    // Create the runnable in the scope of aWin to avoid running into COWs.
    var runnable = {};
    if (aWin)
        runnable = Cu.createObjectIn(aWin);
    runnable.run = aFun;
    Cu.dispatch(runnable, aWin);
  },

  _os: null,

  get OS() {
    if (this._os != null)
      return this._os;

    var xulRuntime = Cc["@mozilla.org/xre/app-info;1"]
                        .getService(Components.interfaces.nsIXULAppInfo)
                        .QueryInterface(Components.interfaces.nsIXULRuntime);

    this._os = xulRuntime.OS;
    return this._os;
  },

  addSystemEventListener: function(target, type, listener, useCapture) {
    Cc["@mozilla.org/eventlistenerservice;1"].
      getService(Ci.nsIEventListenerService).
      addSystemEventListener(target, type, listener, useCapture);
  },
  removeSystemEventListener: function(target, type, listener, useCapture) {
    Cc["@mozilla.org/eventlistenerservice;1"].
      getService(Ci.nsIEventListenerService).
      removeSystemEventListener(target, type, listener, useCapture);
  },

  getDOMRequestService: function() {
    var serv = Cc["@mozilla.org/dom/dom-request-service;1"].
      getService(Ci.nsIDOMRequestService);
    var res = { __exposedProps__: {} };
    var props = ["createRequest", "createCursor", "fireError", "fireSuccess",
                 "fireDone", "fireDetailedError"];
    for (i in props) {
      let prop = props[i];
      res[prop] = function() { return serv[prop].apply(serv, arguments) };
      res.__exposedProps__[prop] = "r";
    }
    return res;
  },

  setLogFile: function(path) {
    this._mfl = new MozillaFileLogger(path);
  },

  log: function(data) {
    this._mfl.log(data);
  },

  closeLogFile: function() {
    this._mfl.close();
  },

  addCategoryEntry: function(category, entry, value, persists, replace) {
    Components.classes["@mozilla.org/categorymanager;1"].
      getService(Components.interfaces.nsICategoryManager).
      addCategoryEntry(category, entry, value, persists, replace);
  },

  deleteCategoryEntry: function(category, entry, persists) {
    Components.classes["@mozilla.org/categorymanager;1"].
      getService(Components.interfaces.nsICategoryManager).
      deleteCategoryEntry(category, entry, persists);
  },

  copyString: function(str, doc) {
    Components.classes["@mozilla.org/widget/clipboardhelper;1"].
      getService(Components.interfaces.nsIClipboardHelper).
      copyString(str, doc);
  },

  openDialog: function(win, args) {
    return win.openDialog.apply(win, args);
  },

  // :jdm gets credit for this.  ex: getPrivilegedProps(window, 'location.href');
  getPrivilegedProps: function(obj, props) {
    var parts = props.split('.');

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (obj[p]) {
        obj = obj[p];
      } else {
        return null;
      }
    }
    return obj;
  },

  get focusManager() {
    if (this._fm != null)
      return this._fm;

    this._fm = Components.classes["@mozilla.org/focus-manager;1"].
                        getService(Components.interfaces.nsIFocusManager);

    return this._fm;
  },

  getFocusedElementForWindow: function(targetWindow, aDeep, childTargetWindow) {
    return this.focusManager.getFocusedElementForWindow(targetWindow, aDeep, childTargetWindow);
  },

  activeWindow: function() {
    return this.focusManager.activeWindow;
  },

  focusedWindow: function() {
    return this.focusManager.focusedWindow;
  },

  focus: function(aWindow) {
    // This is called inside TestRunner._makeIframe without aWindow, because of assertions in oop mochitests
    // With aWindow, it is called in SimpleTest.waitForFocus to allow popup window opener focus switching
    if (aWindow)
      aWindow.focus();
    sendAsyncMessage("SpecialPowers.Focus", {});
  },

  getClipboardData: function(flavor, whichClipboard) {
    if (this._cb == null)
      this._cb = Components.classes["@mozilla.org/widget/clipboard;1"].
                            getService(Components.interfaces.nsIClipboard);
    if (whichClipboard === undefined)
      whichClipboard = this._cb.kGlobalClipboard;

    var xferable = Components.classes["@mozilla.org/widget/transferable;1"].
                   createInstance(Components.interfaces.nsITransferable);
    xferable.init(this._getDocShell(content.window)
                      .QueryInterface(Components.interfaces.nsILoadContext));
    xferable.addDataFlavor(flavor);
    this._cb.getData(xferable, whichClipboard);
    var data = {};
    try {
      xferable.getTransferData(flavor, data, {});
    } catch (e) {}
    data = data.value || null;
    if (data == null)
      return "";

    return data.QueryInterface(Components.interfaces.nsISupportsString).data;
  },

  clipboardCopyString: function(preExpectedVal, doc) {
    var cbHelperSvc = Components.classes["@mozilla.org/widget/clipboardhelper;1"].
                      getService(Components.interfaces.nsIClipboardHelper);
    cbHelperSvc.copyString(preExpectedVal, doc);
  },

  supportsSelectionClipboard: function() {
    if (this._cb == null) {
      this._cb = Components.classes["@mozilla.org/widget/clipboard;1"].
                            getService(Components.interfaces.nsIClipboard);
    }
    return this._cb.supportsSelectionClipboard();
  },

  swapFactoryRegistration: function(cid, contractID, newFactory, oldFactory) {
    var componentRegistrar = Components.manager.QueryInterface(Components.interfaces.nsIComponentRegistrar);

    var unregisterFactory = newFactory;
    var registerFactory = oldFactory;

    if (cid == null) {
      if (contractID != null) {
        cid = componentRegistrar.contractIDToCID(contractID);
        oldFactory = Components.manager.getClassObject(Components.classes[contractID],
                                                            Components.interfaces.nsIFactory);
      } else {
        return {'error': "trying to register a new contract ID: Missing contractID"};
      }

      unregisterFactory = oldFactory;
      registerFactory = newFactory;
    }
    componentRegistrar.unregisterFactory(cid,
                                         unregisterFactory);

    // Restore the original factory.
    componentRegistrar.registerFactory(cid,
                                       "",
                                       contractID,
                                       registerFactory);
    return {'cid':cid, 'originalFactory':oldFactory};
  },

  _getElement: function(aWindow, id) {
    return ((typeof(id) == "string") ?
        aWindow.document.getElementById(id) : id);
  },

  dispatchEvent: function(aWindow, target, event) {
    var el = this._getElement(aWindow, target);
    return el.dispatchEvent(event);
  },

  get isDebugBuild() {
    delete this.isDebugBuild;
    var debug = Cc["@mozilla.org/xpcom/debug;1"].getService(Ci.nsIDebug2);
    return this.isDebugBuild = debug.isDebugBuild;
  },
  assertionCount: function() {
    var debugsvc = Cc['@mozilla.org/xpcom/debug;1'].getService(Ci.nsIDebug2);
    return debugsvc.assertionCount;
  },

  /**
   * Get the message manager associated with an <iframe mozbrowser>.
   */
  getBrowserFrameMessageManager: function(aFrameElement) {
    return this.wrap(aFrameElement.QueryInterface(Ci.nsIFrameLoaderOwner)
                                  .frameLoader
                                  .messageManager);
  },

  setFullscreenAllowed: function(document) {
    var pm = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
    pm.addFromPrincipal(document.nodePrincipal, "fullscreen", Ci.nsIPermissionManager.ALLOW_ACTION);
    var obsvc = Cc['@mozilla.org/observer-service;1']
                   .getService(Ci.nsIObserverService);
    obsvc.notifyObservers(document, "fullscreen-approved", null);
  },

  removeFullscreenAllowed: function(document) {
    var pm = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
    pm.removeFromPrincipal(document.nodePrincipal, "fullscreen");
  },

  _getInfoFromPermissionArg: function(arg) {
    let url = "";
    let appId = Ci.nsIScriptSecurityManager.NO_APP_ID;
    let isInBrowserElement = false;

    if (typeof(arg) == "string") {
      // It's an URL.
      url = Cc["@mozilla.org/network/io-service;1"]
              .getService(Ci.nsIIOService)
              .newURI(arg, null, null)
              .spec;
    } else if (arg.manifestURL) {
      // It's a thing representing an app.
      let appsSvc = Cc["@mozilla.org/AppsService;1"]
                      .getService(Ci.nsIAppsService)
      let app = appsSvc.getAppByManifestURL(arg.manifestURL);

      if (!app) {
        throw "No app for this manifest!";
      }

      appId = appsSvc.getAppLocalIdByManifestURL(arg.manifestURL);
      url = app.origin;
      isInBrowserElement = arg.isInBrowserElement || false;
    } else if (arg.nodePrincipal) {
      // It's a document.
      url = arg.nodePrincipal.URI.spec;
      appId = arg.nodePrincipal.appId;
      isInBrowserElement = arg.nodePrincipal.isInBrowserElement;
    } else {
      url = arg.url;
      appId = arg.appId;
      isInBrowserElement = arg.isInBrowserElement;
    }

    return [ url, appId, isInBrowserElement ];
  },

  addPermission: function(type, allow, arg) {
    let [url, appId, isInBrowserElement] = this._getInfoFromPermissionArg(arg);

    let permission;
    if (typeof allow !== 'boolean') {
      permission = allow;
    } else {
      permission = allow ? Ci.nsIPermissionManager.ALLOW_ACTION
                         : Ci.nsIPermissionManager.DENY_ACTION;
    }

    var msg = {
      'op': 'add',
      'type': type,
      'permission': permission,
      'url': url,
      'appId': appId,
      'isInBrowserElement': isInBrowserElement
    };

    this._sendSyncMessage('SPPermissionManager', msg);
  },

  removePermission: function(type, arg) {
    let [url, appId, isInBrowserElement] = this._getInfoFromPermissionArg(arg);

    var msg = {
      'op': 'remove',
      'type': type,
      'url': url,
      'appId': appId,
      'isInBrowserElement': isInBrowserElement
    };

    this._sendSyncMessage('SPPermissionManager', msg);
  },

  hasPermission: function (type, arg) {
   let [url, appId, isInBrowserElement] = this._getInfoFromPermissionArg(arg);

    var msg = {
      'op': 'has',
      'type': type,
      'url': url,
      'appId': appId,
      'isInBrowserElement': isInBrowserElement
    };

    return this._sendSyncMessage('SPPermissionManager', msg)[0];
  },
  testPermission: function (type, value, arg) {
   let [url, appId, isInBrowserElement] = this._getInfoFromPermissionArg(arg);

    var msg = {
      'op': 'test',
      'type': type,
      'value': value, 
      'url': url,
      'appId': appId,
      'isInBrowserElement': isInBrowserElement
    };
    return this._sendSyncMessage('SPPermissionManager', msg)[0];
  },

  getMozFullPath: function(file) {
    return file.mozFullPath;
  },

  isWindowPrivate: function(win) {
    return PrivateBrowsingUtils.isWindowPrivate(win);
  },

  notifyObserversInParentProcess: function(subject, topic, data) {
    if (subject) {
      throw new Error("Can't send subject to another process!");
    }
    if (this.isMainProcess()) {
      this.notifyObservers(subject, topic, data);
      return;
    }
    var msg = {
      'op': 'notify',
      'observerTopic': topic,
      'observerData': data
    };
    this._sendSyncMessage('SPObserverService', msg);
  },
};

this.SpecialPowersAPI = SpecialPowersAPI;
this.bindDOMWindowUtils = bindDOMWindowUtils;
this.getRawComponents = getRawComponents;
