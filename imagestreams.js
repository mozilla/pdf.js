/* -*- Mode: Java; tab-width: s; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=s tabstop=2 autoindent cindent expandtab: */

"use strict";

// A JpegStream can't be read directly. We use the platform to render the underlying
// JPEG data for us.
var JpegStream = (function() {
  function constructor(bytes, dict) {
    // TODO: per poppler, some images may have "junk" before that need to be removed
    this.dict = dict;

    // create DOM image
    var img = new Image();
    img.onload = (function() {
      this.loaded = true;
      if (this.onLoad)
        this.onLoad();
    }).bind(this);
    img.src = "data:image/jpeg;base64," + window.btoa(bytesToString(bytes));
    this.domImage = img;
  }

  constructor.prototype = {
    getImage: function() {
      return this.domImage;
    },
    getChar: function() {
      error("internal error: getChar is not valid on JpegStream");
    }
  };

  return constructor;
})();


// Simple object to track the loading images
// Initialy for every that is in loading call imageLoading()
// and, when images onload is fired, call imageLoaded()
// When all images are loaded, the onLoad event is fired.
var ImagesLoader = (function() {
  function constructor() {
    this.loading = 0;
    this.enabled = false;
  }

  constructor.prototype = {
    onLoad: function() {},
    imageLoading: function() {
      ++this.loading;
    },
    imageLoaded: function() {
      if (--this.loading == 0 && this.enabled)
        this.onLoad();
    },
    bind: function(jpegStream) {
      if (jpegStream.loaded)
        return;
      this.imageLoading();
      jpegStream.onLoad = this.imageLoaded.bind(this);
    },
    enableOnLoad: function() {
      this.enabled = true;
      if (this.loading == 0)
        this.onLoad();
    },
    disableOnLoad: function() {
      this.enabled = false;
    }
  };

  return constructor;
})();
