"use strict";

// Small subset of the webL10n API by Fabien Cazenave for PDF.js extension.
(function (window) {
  let gL10nData = null;
  let gLanguage = "";
  let gExternalLocalizerServices = null;
  let gReadyState = "loading";

  // fetch an l10n objects
  function getL10nData(key) {
    gL10nData ||= gExternalLocalizerServices.getStrings();

    const data = gL10nData?.[key];
    if (!data) {
      console.warn("[l10n] #" + key + " missing for [" + gLanguage + "]");
    }
    return data;
  }

  // replace {{arguments}} with their values
  function substArguments(text, args) {
    if (!args) {
      return text;
    }
    return text.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, function (all, name) {
      return name in args ? args[name] : "{{" + name + "}}";
    });
  }

  // translate a string
  function translateString(key, args, fallback) {
    const i = key.lastIndexOf(".");
    let name, property;
    if (i >= 0) {
      name = key.substring(0, i);
      property = key.substring(i + 1);
    } else {
      name = key;
      property = "textContent";
    }
    const data = getL10nData(name);
    const value = data?.[property] || fallback;
    if (!value) {
      return "{{" + key + "}}";
    }
    return substArguments(value, args);
  }

  // translate an HTML element
  function translateElement(element) {
    if (!element?.dataset) {
      return;
    }

    // get the related l10n object
    const key = element.dataset.l10nId;
    const data = getL10nData(key);
    if (!data) {
      return;
    }

    // get arguments (if any)
    // TODO: more flexible parser?
    let args;
    if (element.dataset.l10nArgs) {
      try {
        args = JSON.parse(element.dataset.l10nArgs);
      } catch {
        console.warn("[l10n] could not parse arguments for #" + key + "");
      }
    }

    // translate element
    // TODO: security check?
    for (const k in data) {
      element[k] = substArguments(data[k], args);
    }
  }

  // translate an HTML subtree
  function translateFragment(element) {
    element ||= document.querySelector("html");

    // check all translatable children (= w/ a `data-l10n-id' attribute)
    const children = element.querySelectorAll("*[data-l10n-id]");
    const elementCount = children.length;
    for (let i = 0; i < elementCount; i++) {
      translateElement(children[i]);
    }

    // translate element itself if necessary
    if (element.dataset.l10nId) {
      translateElement(element);
    }
  }

  // Public API
  document.mozL10n = {
    // get a localized string
    get: translateString,

    // get the document language
    getLanguage() {
      return gLanguage;
    },

    // get the direction (ltr|rtl) of the current language
    getDirection() {
      // http://www.w3.org/International/questions/qa-scripts
      // Arabic, Hebrew, Farsi, Pashto, Urdu
      const rtlList = ["ar", "he", "fa", "ps", "ur"];

      // use the short language code for "full" codes like 'ar-sa' (issue 5440)
      const shortCode = gLanguage.split("-")[0];

      return rtlList.includes(shortCode) ? "rtl" : "ltr";
    },

    getReadyState() {
      return gReadyState;
    },

    setExternalLocalizerServices(externalLocalizerServices) {
      gExternalLocalizerServices = externalLocalizerServices;
      gLanguage = gExternalLocalizerServices.getLocale();
      gReadyState = "complete";
    },

    // translate an element or document fragment
    translate: translateFragment,
  };
})(this);
