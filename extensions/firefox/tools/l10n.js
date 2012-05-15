/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

// Small subset of the webL10n API by Fabien Cazenave for pdf.js extension.
(function(window) {
  var gLanguage = '';

  // fetch an l10n objects
  function getL10nData(key) {
    var response = FirefoxCom.request('getStrings', key);
    var data = JSON.parse(response);
    if (!data)
      console.warn('[l10n] #' + key + ' missing for [' + gLanguage + ']');
    return data;
  }

  // replace {{arguments}} with their values
  function substArguments(text, args) {
    if (!args)
      return text;

    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, function(all, name) {
      return name in args ? args[name] : '{{' + name + '}}';
    });
  }

  // translate a string
  function translateString(key, args, fallback) {
    var data = getL10nData(key);
    if (!data && fallback)
      data = {textContent: fallback};
    if (!data)
      return '{{' + key + '}}';
    return substArguments(data.textContent, args);
  }

  // translate an HTML element
  function translateElement(element) {
    if (!element || !element.dataset)
      return;

    // get the related l10n object
    var data = getL10nData(element.dataset.l10nId);
    if (!data)
      return;

    // get arguments (if any)
    // TODO: more flexible parser?
    var args;
    if (element.dataset.l10nArgs) try {
      args = JSON.parse(element.dataset.l10nArgs);
    } catch (e) {
      console.warn('[l10n] could not parse arguments for #' + key + '');
    }

    // translate element
    // TODO: security check?
    for (var k in data)
      element[k] = substArguments(data[k], args);
  }


  // translate an HTML subtree
  function translateFragment(element) {
    element = element || document.querySelector('html');

    // check all translatable children (= w/ a `data-l10n-id' attribute)
    var children = element.querySelectorAll('*[data-l10n-id]');
    var elementCount = children.length;
    for (var i = 0; i < elementCount; i++)
      translateElement(children[i]);

    // translate element itself if necessary
    if (element.dataset.l10nId)
      translateElement(element);
  }

  window.addEventListener('DOMContentLoaded', function() {
    gLanguage = FirefoxCom.request('getLocale', null);

    translateFragment();

    // fire a 'localized' DOM event
    var evtObject = document.createEvent('Event');
    evtObject.initEvent('localized', false, false);
    evtObject.language = gLanguage;
    window.dispatchEvent(evtObject);
  });

  // Public API
  document.mozL10n = {
    // get a localized string
    get: translateString,

    // get|set the document language and direction
    get language() {
      return {
        // get|set the document language (ISO-639-1)
        get code() { return gLanguage; },

        // get the direction (ltr|rtl) of the current language
        get direction() {
          // http://www.w3.org/International/questions/qa-scripts
          // Arabic, Hebrew, Farsi, Pashto, Urdu
          var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];
          return (rtlList.indexOf(gLanguage) >= 0) ? 'rtl' : 'ltr';
        }
      };
    }
  };
})(this);

