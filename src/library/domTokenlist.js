/*! DOMTokenlist shim | Copyright 2016 Jonathan Wilsson and Bogdan Chadkin. */
;typeof window !== 'undefined' && (function (window) {
    'use strict';

    if (!window.DOMTokenList) {
        return;
    }

    var el = document.createElement('a').classList;
    var dtp = DOMTokenList.prototype;
    var add = dtp.add;
    var remove = dtp.remove;
    var toggle = dtp.toggle;

    el.add('c1', 'c2');

    // Older versions of the HTMLElement.classList spec didn't allow multiple
    // arguments, easy to test for
    var iterateArg = function (fn) {
        return function () {
            var tokens = arguments;
            var i;

            for (i = 0; i < tokens.length; i += 1) {
                fn.call(this, tokens[i]);
            }
        };
    };

    if (!el.contains('c2')) {
        dtp.add = iterateArg(add);
        dtp.remove = iterateArg(remove);
    }

    // Older versions of the spec didn't have a forcedState argument for
    // `toggle` either, test by checking the return value after forcing
    if (!el.toggle('c1', true)) {
        dtp.toggle = function (cls, force) {
            if (force === undefined) {
                return toggle.call(this, cls);
            }

            (force ? add : remove).call(this, cls);
            return !!force;
        };
    }
}(window));

;typeof window !== 'undefined' && (function (window) {
    'use strict';

    var arr = [];

    var inArray = function (array, value) {
        var i;

        if (arr.indexOf) {
            return arr.indexOf.call(array, value);
        }

        for (i = 0; i < array.length; i++) {
            if (array[i] === value) {
                return i;
            }
        }

        return -1;
    };

    var validateToken = function (token) {
        var whitespace = /[\u0009\u000A\u000C\u000D\u0020]/;

        if (token === '' || whitespace.test(token)) {
            throw new Error('Token must not be empty or contain whitespace.');
        }
    };

    var DOMTokenList = function (element, prop) {
        var inst = this;
        var i;
        var values = [];

        if (element && prop) {
            inst.element = element;
            inst.prop = prop;

            if (element[prop]) {
                values = element[prop].replace(/^\s+|\s+$/g, '').split(/\s+/);

                for (i = 0; i < values.length; i++) {
                    inst[i] = values[i];
                }
            }
        }

        inst.length = values.length;
    };

    DOMTokenList.prototype = {
        add: function () {
            var inst = this;
            var i;
            var tokens = arguments;

            for (i = 0; i < tokens.length; i++) {
                validateToken(tokens[i]);

                if (!inst.contains(tokens[i])) {
                    arr.push.call(inst, tokens[i]);
                }
            }

            if (inst.element) {
                inst.element[inst.prop] = inst;
            }
        },

        contains: function (token) {
            validateToken(token);

            return inArray(this, token) !== -1;
        },

        item: function (index) {
            return this[index] || null;
        },

        remove: function () {
            var tokens = arguments;
            var inst = this;
            var key;
            var i;

            for (i = 0; i < tokens.length; i++) {
                validateToken(tokens[i]);

                key = inArray(inst, tokens[i]);

                if (key !== -1) {
                    arr.splice.call(inst, key, 1);
                }
            }

            if (inst.element) {
                inst.element[inst.prop] = inst;
            }
        },

        toggle: function (token, force) {
            var inst = this;

            if (inst.contains(token)) {
                if (force) {
                    return true;
                }

                inst.remove(token);

                return false;
            } else {
                if (force === false) {
                    return false;
                }

                inst.add(token);

                return true;
            }
        },

        toString: function () {
            return arr.join.call(this, ' ');
        }
    };

    window.DOMTokenList = DOMTokenList;
}(window));