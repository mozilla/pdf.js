function CanvasProxy(width, height) {
    var stack = this.$stack = [];

    // Expose only the minimum of the canvas object - there is no dom to do
    // more here.
    this.canvas = {
        width: width,
        height: height
    }

    var ctxFunc = [
        "createRadialGradient",
        "arcTo",
        "arc",
        "fillText",
        "strokeText",
        "drawImage",
        "getImageData",
        "putImageData",
        "createImageData",
        "drawWindow",
        "save",
        "restore",
        "scale",
        "rotate",
        "translate",
        "transform",
        "setTransform",
        "createLinearGradient",
        "createPattern",
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
        "isPointInPath"
    ];
    function buildFuncCall(name) {
        return function() {
            console.log("funcCall", name)
            stack.push([name, Array.prototype.slice.call(arguments)]);
        }
    }
    var name;
    for (var i = 0; i < ctxFunc.length; i++) {
        name = ctxFunc[i];
        this[name] = buildFuncCall(name);
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
            return this["$" + name];
        }
    }

    function buildSetter(name) {
        return function(value) {
            stack.push(["$", name, value]);
            return this["$" + name] = value;
        }
    }

    for (var name in ctxProp) {
        this["$" + name] = ctxProp[name];
        this.__defineGetter__(name, buildGetter(name));
        this.__defineSetter__(name, buildSetter(name));
    }
}

CanvasProxy.prototype.flush = function() {
    postMessage("canvas_proxy_stack");
    postMessage(JSON.stringify(this.$stack));
    this.$stack.length = 0;
}
