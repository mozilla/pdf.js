let Cc = Components.classes;
let Ci = Components.interfaces;
let Cm = Components.manager;
let Cu = Components.utils;

Cu.import("resource://gre/modules/Services.jsm");

function log(str) {
  dump(str + "\n");
};

function startup(aData, aReason) {
  let manifestPath = "chrome.manifest";
  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
  try {
    file.initWithPath(aData.installPath.path);
    file.append(manifestPath);
    Cm.QueryInterface(Ci.nsIComponentRegistrar).autoRegister(file);
  } catch(e) {
    log(e);
  }
};

function shutdown(aData, aReason) {
};

function install(aData, aReason) {
  let url = "chrome://pdf.js/content/web/viewer.html?file=%s";
  Services.prefs.setCharPref("extensions.pdf.js.url", url);
};

