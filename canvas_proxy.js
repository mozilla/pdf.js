// var ImageCanvasProxyCounter = 0;
// function ImageCanvasProxy(width, height) {
//     this.id = ImageCanvasProxyCounter++;
//     this.width = width;
//     this.height = height;
//
//     // Using `Uint8ClampedArray` seems to be the type of ImageData - at least
//     // Firebug tells me so.
//     this.imgData = {
//         data: Uint8ClampedArray(width * height * 4)
//     };
// }
//
// ImageCanvasProxy.prototype.putImageData = function(imgData) {
//     // this.ctx.putImageData(imgData, 0, 0);
// }
//
// ImageCanvasProxy.prototype.getCanvas = function() {
//     return this;
// }

var JpegStreamProxyCounter = 0;
// WebWorker Proxy for JpegStream.
var JpegStreamProxy = (function() {
    function constructor(bytes, dict) {
        this.id = JpegStreamProxyCounter++;
        this.dict = dict;

        // create DOM image.
        postMessage("jpeg_stream");
        postMessage({
            id:  this.id,
            str: bytesToString(bytes)
        });

        // var img = new Image();
        // img.src = "data:image/jpeg;base64," + window.btoa(bytesToString(bytes));
        // this.domImage = img;
    }

    constructor.prototype = {
        getImage: function() {
            return this;
            // return this.domImage;
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

    var stack = this.$stack = [];

    // Dummy context exposed.
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

    var ctxFunc = [
        "createRadialGradient",
        "arcTo",
        "arc",
        "fillText",
        "strokeText",
        // "drawImage",
        // "getImageData",
        // "putImageData",
        "createImageData",
        "drawWindow",
        "save",
        "restore",
        "scale",
        "rotate",
        "translate",
        "transform",
        "setTransform",
        // "createLinearGradient",
        // "createPattern",
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

        "$setCurrentX",
        "$addCurrentX",
        "$saveCurrentX",
        "$restoreCurrentX",
        "$showText"
    ];

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
        "mozImageSmoothingEnabled": "true",
        "DRAWWINDOW_DRAW_CARET": "1",
        "DRAWWINDOW_DO_NOT_FLUSH": "2",
        "DRAWWINDOW_DRAW_VIEW": "4",
        "DRAWWINDOW_USE_WIDGET_LAYERS": "8",
        "DRAWWINDOW_ASYNC_DECODE_IMAGES": "16",
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
