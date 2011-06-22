
var JpegStreamProxyCounter = 0;
// WebWorker Proxy for JpegStream.
var JpegStreamProxy = (function() {
  function constructor(bytes, dict) {
    this.id = JpegStreamProxyCounter++;
    this.dict = dict;

    // Tell the main thread to create an image.
    postMessage("jpeg_stream");
    postMessage({
      id:  this.id,
      str: bytesToString(bytes)
    });
  }

  constructor.prototype = {
    getImage: function() {
      return this;
    },
    getChar: function() {
      error("internal error: getChar is not valid on JpegStream");
    }
  };

  return constructor;
})();

// Really simple GradientProxy. There is currently only one active gradient at
// the time, meaning you can't create a gradient, create a second one and then
// use the first one again. As this isn't used in pdf.js right now, it's okay.
function GradientProxy(stack, x0, y0, x1, y1) {
  stack.push(["$createLinearGradient", [x0, y0, x1, y1]]);
  this.addColorStop = function(i, rgba) {
    stack.push(["$addColorStop", [i, rgba]]);
  }
}

// Really simple PatternProxy.
var patternProxyCounter = 0;
function PatternProxy(stack, object, kind) {
  this.id = patternProxyCounter++;

  if (!(object instanceof CanvasProxy) ) {
    throw "unkown type to createPattern";
  }

  // Flush the object here to ensure it's available on the main thread.
  // TODO: Make some kind of dependency management, such that the object
  // gets flushed only if needed.
  object.flush();
  stack.push(["$createPatternFromCanvas", [this.id, object.id, kind]]);
}

var canvasProxyCounter = 0;
function CanvasProxy(width, height) {
  this.id = canvasProxyCounter++;

  // The `stack` holds the rendering calls and gets flushed to the main thead.
  var stack = this.$stack = [];

  // Dummy context that gets exposed.
  var ctx = {};
  this.getContext = function(type) {
    if (type != "2d") {
      throw "CanvasProxy can only provide a 2d context.";
    }
    return ctx;
  }

  // Expose only the minimum of the canvas object - there is no dom to do
  // more here.
  this.width = width;
  this.height = height;
  ctx.canvas = this;

  // Setup function calls to `ctx`.
  var ctxFunc = [
  "createRadialGradient",
  "arcTo",
  "arc",
  "fillText",
  "strokeText",
  "createImageData",
  "drawWindow",
  "save",
  "restore",
  "scale",
  "rotate",
  "translate",
  "transform",
  "setTransform",
  "clearRect",
  "fillRect",
  "strokeRect",
  "beginPath",
  "closePath",
  "moveTo",
  "lineTo",
  "quadraticCurveTo",
  "bezierCurveTo",
  "rect",
  "fill",
  "stroke",
  "clip",
  "measureText",
  "isPointInPath",

  // These functions are necessary to track the rendering currentX state.
  // The exact values can be computed on the main thread only, as the
  // worker has no idea about text width.
  "$setCurrentX",
  "$addCurrentX",
  "$saveCurrentX",
  "$restoreCurrentX",
  "$showText"
  ];

  function buildFuncCall(name) {
    return function() {
      // console.log("funcCall", name)
      stack.push([name, Array.prototype.slice.call(arguments)]);
    }
  }
  var name;
  for (var i = 0; i < ctxFunc.length; i++) {
    name = ctxFunc[i];
    ctx[name] = buildFuncCall(name);
  }

  // Some function calls that need more work.

  ctx.createPattern = function(object, kind) {
    return new PatternProxy(stack, object, kind);
  }

  ctx.createLinearGradient = function(x0, y0, x1, y1) {
    return new GradientProxy(stack, x0, y0, x1, y1);
  }

  ctx.getImageData = function(x, y, w, h) {
    return {
      width: w,
      height: h,
      data: Uint8ClampedArray(w * h * 4)
    };
  }

  ctx.putImageData = function(data, x, y, width, height) {
    stack.push(["$putImageData", [data, x, y, width, height]]);
  }

  ctx.drawImage = function(image, x, y, width, height, sx, sy, swidth, sheight) {
    if (image instanceof CanvasProxy) {
      // Send the image/CanvasProxy to the main thread.
      image.flush();
      stack.push(["$drawCanvas", [image.id, x, y, sx, sy, swidth, sheight]]);
    } else if(image instanceof JpegStreamProxy) {
      stack.push(["$drawImage", [image.id, x, y, sx, sy, swidth, sheight]])
    } else {
      throw "unkown type to drawImage";
    }
  }

  // Setup property access to `ctx`.
  var ctxProp = {
    // "canvas"
    "globalAlpha": "1",
    "globalCompositeOperation": "source-over",
    "strokeStyle": "#000000",
    "fillStyle": "#000000",
    "lineWidth": "1",
    "lineCap": "butt",
    "lineJoin": "miter",
    "miterLimit": "10",
    "shadowOffsetX": "0",
    "shadowOffsetY": "0",
    "shadowBlur": "0",
    "shadowColor": "rgba(0, 0, 0, 0)",
    "font": "10px sans-serif",
    "textAlign": "start",
    "textBaseline": "alphabetic",
    "mozTextStyle": "10px sans-serif",
    "mozImageSmoothingEnabled": "true"
  }

  function buildGetter(name) {
    return function() {
      return ctx["$" + name];
    }
  }

  function buildSetter(name) {
    return function(value) {
      stack.push(["$", name, value]);
      return ctx["$" + name] = value;
    }
  }

  for (var name in ctxProp) {
    ctx["$" + name] = ctxProp[name];
    ctx.__defineGetter__(name, buildGetter(name));

    // Special treatment for `fillStyle` and `strokeStyle`: The passed style
    // might be a gradient. Need to check for that.
    if (name == "fillStyle" || name == "strokeStyle") {
      function buildSetterStyle(name) {
        return function(value) {
          if (value instanceof GradientProxy) {
            stack.push(["$" + name + "Gradient"]);
          } else if (value instanceof PatternProxy) {
            stack.push(["$" + name + "Pattern", [value.id]]);
          } else {
            stack.push(["$", name, value]);
            return ctx["$" + name] = value;
          }
        }
      }
      ctx.__defineSetter__(name, buildSetterStyle(name));
    } else {
      ctx.__defineSetter__(name, buildSetter(name));
    }
  }
}

/**
* Sends the current stack of the CanvasProxy over to the main thread and
* resets the stack.
*/
CanvasProxy.prototype.flush = function() {
  postMessage("canvas_proxy_stack");
  postMessage({
    id:     this.id,
    stack:  this.$stack,
    width:  this.width,
    height: this.height
  });
  this.$stack.length = 0;
}
