/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// simple and incomplete implementation of promises
function Promise() {}
Promise.prototype = {
  then: function (callback) {
    this.callback = callback;
    if ('result' in this) callback(this.result);
  },
  resolve: function (result) {
    if ('result' in this) return;
    this.result = result;
    if ('callback' in this) this.callback(result); 
  }
};

var isCanvasSupported = (function () {
  try {
    document.createElement('canvas').getContext('2d').fillStyle = '#FFFFFF';
    return true;
  } catch (e) {
    return false;
  }
})();

var tests = [
  {
    id: 'canvas',
    name: 'CANVAS element is present',
    run: function () {
      if (isCanvasSupported) {
        return { output: 'Success', emulated: '' };
      } else {
        return { output: 'Failed', emulated: 'No' };
      }
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'get-literal',
    name: 'get-literal properties',
    run: function () {
      try {
        var Test = eval('var Test =  { get t() { return {}; } }; Test');
        Test.t.test = true;
        return { output: 'Success', emulated: '' };
      } catch (e) {
        return { output: 'Failed', emulated: 'No' };
      }
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'addEventListener',
    name: 'addEventListener() is present',
    run: function () {
      var div = document.createElement('div');
      if (div.addEventListener)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Uint8Array',
    name: 'Uint8Array is present',
    run: function () {
      if (typeof Uint8Array !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Uint16Array',
    name: 'Uint16Array is present',
    run: function () {
      if (typeof Uint16Array !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Int32Array',
    name: 'Int32Array is present',
    run: function () {
      if (typeof Int32Array !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Float32Array',
    name: 'Float32Array is present',
    run: function () {
      if (typeof Float32Array !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Float64Array',
    name: 'Float64Array is present',
    run: function () {
      if (typeof Float64Array !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Object-create',
    name: 'Object.create() is present',
    run: function () {
      if (Object.create instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Object-defineProperty',
    name: 'Object.defineProperty() is present',
    run: function () {
      if (Object.defineProperty instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Object-defineProperty-DOM',
    name: 'Object.defineProperty() can be used on DOM objects',
    run: function () {
      if (!(Object.defineProperty instanceof Function))
        return { output: 'Skipped', emulated: '' };
      try {
        // some browsers (e.g. safari) cannot use defineProperty() on DOM objects
        // and thus the native version is not sufficient
        Object.defineProperty(new Image(), 'id', { value: 'test' });
        return { output: 'Success', emulated: '' };
      } catch (e) {
        return { output: 'Failed', emulated: 'Yes' };
      }
    },
    impact: 'Important',
    area: 'Viewer'
  },
  {
    id: 'get-literal-redefine',
    name: 'Defined via get-literal properties can be redefined',
    run: function () {
      if (!(Object.defineProperty instanceof Function))
        return { output: 'Skipped', emulated: '' };
      try {
        var TestGetter = eval('var Test = function () {}; Test.prototype = { get id() { } }; Test');
        Object.defineProperty(new TestGetter(), 'id',
        { value: '', configurable: true, enumerable: true, writable: false });
        return { output: 'Success', emulated: '' };
      } catch (e) {
        return { output: 'Failed', emulated: 'Yes' };
      }
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Object-keys',
    name: 'Object.keys() is present',
    run: function () {
      if (Object.keys instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'FileReader',
    name: 'FileReader is present',
    run: function () {
      if (typeof FileReader !== 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Normal',
    area: 'Demo'
  },
  {
    id: 'FileReader-readAsArrayBuffer',
    name: 'FileReader.prototype.readAsArrayBuffer() is present',
    run: function () {
      if (typeof FileReader === 'undefined')
        return { output: 'Skipped', emulated: '' };
      if (FileReader.prototype.readAsArrayBuffer instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Normal',
    area: 'Demo'
  },
  {
    id: 'XMLHttpRequest-overrideMimeType',
    name: 'XMLHttpRequest.prototype.overrideMimeType() is present',
    run: function () {
      if (XMLHttpRequest.prototype.overrideMimeType instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Important',
    area: 'Viewer'
  },
  {
    id: 'XMLHttpRequest-response',
    name: 'XMLHttpRequest.prototype.response is present',
    run: function () {
      var xhr = new XMLHttpRequest();
      if ('response' in xhr)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'bota',
    name: 'btoa() is present',
    run: function () {
      if ('btoa' in window)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'atob',
    name: 'atob() is present',
    run: function () {
      if ('atob' in window)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Function-bind',
    name: 'Function.prototype.bind is present',
    run: function () {
      if (Function.prototype.bind instanceof Function)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'dataset',
    name: 'dataset is present for HTML element',
    run: function () {
      var div = document.createElement('div');
      if ('dataset' in div)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Important',
    area: 'Viewer'
  },
  {
    id: 'classList',
    name: 'classList is present for HTML element',
    run: function () {
      var div = document.createElement('div');
      if ('classList' in div)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Important',
    area: 'Viewer'
  },
  {
    id: 'console',
    name: 'console object is present',
    run: function () {
      if ('console' in window)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'console-log-bind',
    name: 'console.log is a bind-able function',
    run: function () {
      if (!('console' in window))
        return { output: 'Skipped', emulated: '' };
      if ('bind' in console.log)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'navigator-language',
    name: 'navigator.language is present',
    run: function () {
      if ('language' in navigator)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'Yes' };
    },
    impact: 'Important',
    area: 'Viewer'
  },
  {
    id: 'fillRule-evenodd',
    name: 'evenodd fill rule is supported',
    run: function () {
      if (!isCanvasSupported)
        return { output: 'Skipped', emulated: '' };

      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      ctx.rect(1, 1, 50, 50);
      ctx.rect(5, 5, 41, 41);

      if ('mozFillRule' in ctx) {
        ctx.mozFillRule = 'evenodd';
        ctx.fill();
      } else {
        ctx.fill('evenodd');
      }

      var data = ctx.getImageData(0, 0, 50, 50).data;
      var isEvenOddFill = data[20 * 4 + 20 * 200 + 3] == 0 &&
                          data[2 * 4 + 2 * 200 + 3] != 0;

      if (isEvenOddFill)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'dash-array',
    name: 'dashed line style is supported',
    run: function () {
      if (!isCanvasSupported)
        return { output: 'Skipped', emulated: '' };

      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      ctx.moveTo(0,5);
      ctx.lineTo(50, 5);
      ctx.lineWidth = 10;

      if ('setLineDash' in ctx) {
        ctx.setLineDash([10, 10]);
        ctx.lineDashOffset = 0;
      } else {
        ctx.mozDash = [10, 10];
        ctx.mozDashOffset = 0;
      }
      ctx.stroke();

      var data = ctx.getImageData(0, 0, 50, 50).data;
      var isDashed = data[5 * 4 + 5 * 200 + 3] != 0 &&
                     data[15 * 4 + 5 * 200 + 3] == 0;

      if (isDashed)
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'font-face',
    name: '@font-face is supported/enabled',
    run: function () {
      if (!isCanvasSupported)
        return { output: 'Skipped', emulated: '' };
      var promise = new Promise();
      setTimeout(function() {
        if (checkCanvas('plus'))
          promise.resolve({ output: 'Success', emulated: '' });
        else
          promise.resolve({ output: 'Failed', emulated: 'No' });
      }, 2000);
      return promise;
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'font-face-sync',
    name: '@font-face loading completion detection',
    run: function () {
      if (!isCanvasSupported)
        return { output: 'Skipped', emulated: '' };

      // Add the font-face rule to the document
      var rule = '@font-face { font-family: \'plus-loaded\'; src: url(data:font/opentype;base64,AAEAAAAOAIAAAwBgRkZUTWNJJVkAAAZEAAAAHEdERUYANQAkAAAGHAAAAChPUy8yVkDi7gAAAWgAAABgY21hcPAZ92QAAAHcAAABUmN2dCAAIQJ5AAADMAAAAARnYXNw//8AAwAABhQAAAAIZ2x5Zk7Cd0UAAANEAAAA8GhlYWT8fgSnAAAA7AAAADZoaGVhBuoD7QAAASQAAAAkaG10eAwCALUAAAHIAAAAFGxvY2EA5gCyAAADNAAAAA5tYXhwAEoAPQAAAUgAAAAgbmFtZWDR73sAAAQ0AAABnnBvc3RBBJyBAAAF1AAAAD4AAQAAAAEAAPbZ2E5fDzz1AB8D6AAAAADM3+BPAAAAAMzf4E8AIQAAA2sDJAAAAAgAAgAAAAAAAAABAAADJAAAAFoD6AAAAAADawABAAAAAAAAAAAAAAAAAAAABAABAAAABgAMAAIAAAAAAAIAAAABAAEAAABAAC4AAAAAAAQD6AH0AAUAAAKKArwAAACMAooCvAAAAeAAMQECAAACAAYJAAAAAAAAAAAAARAAAAAAAAAAAAAAAFBmRWQAwABg8DADIP84AFoDJAAAgAAAAQAAAAAAAAAAAAAAIAABA+gAIQAAAAAD6AAAA+gASgBKAEoAAAADAAAAAwAAABwAAQAAAAAATAADAAEAAAAcAAQAMAAAAAgACAACAAAAYPAA8DD//wAAAGDwAPAw////oxAED9UAAQAAAAAAAAAAAAABBgAAAQAAAAAAAAABAgAAAAIAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACECeQAAACoAKgAqAEQAXgB4AAAAAgAhAAABKgKaAAMABwAusQEALzyyBwQA7TKxBgXcPLIDAgDtMgCxAwAvPLIFBADtMrIHBgH8PLIBAgDtMjMRIREnMxEjIQEJ6MfHApr9ZiECWAAAAQBKAAADawMkAAsAAAEzESEVBREjEQU1IQGakwE+/sKT/rABUAMk/qeHAv6+AUIBigAAAAEASgAAA2sDJAALAAABMxEhFQURIxEFNSEBmpMBPv7Ck/6wAVADJP6nhwL+vgFCAYoAAAABAEoAAANrAyQACwAAATMRIRUFESMRBTUhAZqTAT7+wpP+sAFQAyT+p4cC/r4BQgGKAAAAAAAOAK4AAQAAAAAAAAAHABAAAQAAAAAAAQAEACIAAQAAAAAAAgAGADUAAQAAAAAAAwAgAH4AAQAAAAAABAAEAKkAAQAAAAAABQAQANAAAQAAAAAABgAEAOsAAwABBAkAAAAOAAAAAwABBAkAAQAIABgAAwABBAkAAgAMACcAAwABBAkAAwBAADwAAwABBAkABAAIAJ8AAwABBAkABQAgAK4AAwABBAkABgAIAOEATQBvAHoAaQBsAGwAYQAATW96aWxsYQAAcABsAHUAcwAAcGx1cwAATQBlAGQAaQB1AG0AAE1lZGl1bQAARgBvAG4AdABGAG8AcgBnAGUAIAAyAC4AMAAgADoAIABwAGwAdQBzACAAOgAgADEALQAxADIALQAyADAAMQAyAABGb250Rm9yZ2UgMi4wIDogcGx1cyA6IDEtMTItMjAxMgAAcABsAHUAcwAAcGx1cwAAVgBlAHIAcwBpAG8AbgAgADAAMAAxAC4AMAAwADAAIAAAVmVyc2lvbiAwMDEuMDAwIAAAcABsAHUAcwAAcGx1cwAAAAACAAAAAAAA/4MAMgAAAAEAAAAAAAAAAAAAAAAAAAAAAAYAAAABAAIAQwECAQMHdW5pRjAwMAd1bmlGMDMwAAAAAAAB//8AAgABAAAADgAAABgAIAAAAAIAAQABAAUAAQAEAAAAAgAAAAEAAAABAAAAAAABAAAAAMmJbzEAAAAAzN/V8gAAAADM3+A1AA==); }';

      var styleElement = document.getElementById('fontFaces');
      var styleSheet = styleElement.sheet;
      styleSheet.insertRule(rule, styleSheet.cssRules.length);

      // checking if data urls are loaded synchronously
      if (checkCanvas('plus-loaded'))
        return { output: 'Success', emulated: '' };

      // TODO checking if data urls are loaded asynchronously

      var usageElement = document.createElement('div');
      usageElement.setAttribute('style', 'font-family: plus-loaded; visibility: hidden;');
      usageElement.textContent = '`';
      document.body.appendChild(usageElement);

      // verify is font is loaded
      var promise = new Promise();
      setTimeout(function() {
        if (checkCanvas('plus-loaded'))
          promise.resolve({ output: 'Failed', emulated: 'Yes' });
        else
          promise.resolve({ output: 'Failed', emulated: 'No' });
      }, 2000);
      return promise;
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'TextDecoder',
    name: 'TextDecoder is present',
    run: function () {
      if (typeof TextDecoder != 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Critical',
    area: 'Core'
  },
  {
    id: 'Worker',
    name: 'Worker is present',
    run: function () {
      if (typeof Worker != 'undefined')
        return { output: 'Success', emulated: '' };
      else
        return { output: 'Failed', emulated: 'No' };
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'Worker-Uint8Array',
    name: 'Worker can receive/send typed arrays',
    run: function () {
      if (typeof Worker == 'undefined')
        return { output: 'Skipped', emulated: '' };

     try {
        var worker = new Worker('worker-stub.js');

        var promise = new Promise();
        var timeout = setTimeout(function () {
          promise.resolve({ output: 'Failed', emulated: '?' });
        }, 5000);

        worker.addEventListener('message', function (e) {
          var data = e.data;
          if (data.action == 'test' && data.result)
            promise.resolve({ output: 'Success', emulated: '' });
          else
            promise.resolve({ output: 'Failed', emulated: 'Yes' });
        }, false);
        worker.postMessage({action: 'test',
                            data: new Uint8Array(60000000)}); // 60MB
        return promise;
      } catch (e) {
        return { output: 'Failed', emulated: 'Yes' };
      }
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'Worker-transfers',
    name: 'Worker can use transfers for postMessage',
    run: function () {
      if (typeof Worker == 'undefined')
        return { output: 'Skipped', emulated: '' };

      try {
        var worker = new Worker('worker-stub.js');

        var promise = new Promise();
        var timeout = setTimeout(function () {
          promise.resolve({ output: 'Failed', emulated: '?' });
        }, 5000);

        worker.addEventListener('message', function (e) {
          var data = e.data;
          if (data.action == 'test-transfers' && data.result)
            promise.resolve({ output: 'Success', emulated: '' });
          else
            promise.resolve({ output: 'Failed', emulated: 'Yes' });
        }, false);
        var testObj = new Uint8Array([255]);
        worker.postMessage({action: 'test-transfers',
          data: testObj}, [testObj.buffer]);
        return promise;
      } catch (e) {
        return { output: 'Failed', emulated: 'Yes' };
      }
    },
    impact: 'Normal',
    area: 'Core'
  },
  {
    id: 'Worker-xhr-response',
    name: 'XMLHttpRequest supports the reponse property in web workers',
    run: function () {
      if (typeof Worker == 'undefined')
        return { output: 'Skipped', emulated: '' };

     try {
        var worker = new Worker('worker-stub.js');

        var promise = new Promise();
        var timeout = setTimeout(function () {
          promise.resolve({ output: 'Failed', emulated: '?' });
        }, 5000);

        worker.addEventListener('message', function (e) {
          var data = e.data;
          if (data.action == 'xhr' && data.result)
            promise.resolve({ output: 'Success', emulated: '' });
          else
            promise.resolve({ output: 'Failed', emulated: 'Yes' });
        }, false);
        worker.postMessage({action: 'xhr'});
        return promise;
      } catch (e) {
        return { output: 'Failed', emulated: 'Yes' };
      }
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'Worker-TextDecoder',
    name: 'TextDecoder is present in web workers',
    run: function () {
      if (typeof Worker == 'undefined')
        return { output: 'Skipped', emulated: '' };

      var emulatable = typeof TextDecoder !== 'undefined';
      try {
        var worker = new Worker('worker-stub.js');

        var promise = new Promise();
        var timeout = setTimeout(function () {
          promise.resolve({ output: 'Failed',
                            emulated: emulatable ? '?' : 'No' });
        }, 5000);

        worker.addEventListener('message', function (e) {
          var data = e.data;
          if (data.action === 'TextDecoder') {
            if (data.result) {
              promise.resolve({ output: 'Success', emulated: '' });
            } else {
              promise.resolve({ output: 'Failed',
                                emulated: data.emulated ? 'Yes' : 'No' });
            }
          } else {
            promise.resolve({ output: 'Failed',
                              emulated: emulatable ? 'Yes' : 'No' });
          }
        }, false);
        worker.postMessage({action: 'TextDecoder'});
        return promise;
      } catch (e) {
        return { output: 'Failed', emulated: emulatable ? 'Yes' : 'No' };
      }
    },
    impact: 'Important',
    area: 'Core'
  },
  {
    id: 'Canvas Blend Mode',
    name: 'Canvas supports extended blend modes',
    run: function () {
      var fail = { output: 'Failed', emulated: 'No' };
      var ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = 1;
      ctx.canvas.height = 1;
      var mode = 'difference';
      ctx.globalCompositeOperation = mode;
      if (ctx.globalCompositeOperation !== mode) {
        return fail;
      }
      // Chrome supports setting the value, but it may not actually be
      // implemented, so we have to actually test the blend mode.
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = 'blue';
      ctx.fillRect(0, 0, 1, 1);
      var pix = ctx.getImageData(0, 0, 1, 1).data;
      if (pix[0] !== 255 || pix[1] !== 0 || pix[2] !== 255) {
        return fail;
      }
      return { output: 'Success', emulated: '' };
    },
    impact: 'Important',
    area: 'Core'
  }
];

function checkCanvas(font) {
  var canvas = document.createElement('canvas');
  var canvasHolder = document.getElementById('canvasHolder');
  canvasHolder.appendChild(canvas);
  var ctx = canvas.getContext('2d');
  ctx.font = '40px \'' + font + '\'';
  ctx.fillText('\u0060', 0, 40);
  var data = ctx.getImageData(0, 0, 40, 40).data;
  canvasHolder.removeChild(canvas);

  // detects plus figure
  var minx = 40, maxx = 0, miny = 40, maxy = 0;
  for (var y = 0; y < 40; y++) {
    for (var x = 0; x < 40; x++) {
      if (data[x * 4 + y * 160 + 3] == 0) continue; // no color
      minx = Math.min(minx, x); miny = Math.min(miny, y);
      maxx = Math.max(maxx, x); maxy = Math.max(maxy, y);
    }
  }

  var colors = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  var counts = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (var y = miny; y <= maxy; y++) {
    for (var x = minx; x <= maxx; x++) {
      var i = Math.floor((x - minx) * 3 / (maxx - minx + 1));
      var j = Math.floor((y - miny) * 3 / (maxy - miny + 1));
      counts[i][j]++;
      if (data[x * 4 + y * 160 + 3] != 0)
        colors[i][j]++;
    }
  }
  var isPlus =
    colors[0][0] * 3 < counts[0][0] &&
    colors[0][1] * 3 > counts[0][1] &&
    colors[0][2] * 3 < counts[0][2] &&
    colors[1][0] * 3 > counts[1][0] &&
    colors[1][1] * 3 > counts[1][1] &&
    colors[1][2] * 3 > counts[1][2] &&
    colors[2][0] * 3 < counts[2][0] &&
    colors[2][1] * 3 > counts[2][1] &&
    colors[2][2] * 3 < counts[2][2];
  return isPlus;
}

