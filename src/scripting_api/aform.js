/* Copyright 2020 Mozilla Foundation
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

import { GlobalConstants } from "./constants.js";

class AForm {
  constructor(document, app, util, color) {
    this._document = document;
    this._app = app;
    this._util = util;
    this._color = color;
    this._dateFormats = [
      "m/d",
      "m/d/yy",
      "mm/dd/yy",
      "mm/yy",
      "d-mmm",
      "d-mmm-yy",
      "dd-mmm-yy",
      "yy-mm-dd",
      "mmm-yy",
      "mmmm-yy",
      "mmm d, yyyy",
      "mmmm d, yyyy",
      "m/d/yy h:MM tt",
      "m/d/yy HH:MM",
    ];
    this._timeFormats = ["HH:MM", "h:MM tt", "HH:MM:ss", "h:MM:ss tt"];
    this._dateActionsCache = new Map();

    // The e-mail address regex below originates from:
    // https://html.spec.whatwg.org/multipage/input.html#valid-e-mail-address
    this._emailRegex = new RegExp(
      "^[a-zA-Z0-9.!#$%&'*+\\/=?^_`{|}~-]+" +
        "@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?" +
        "(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
    );
  }

  _mkTargetName(event) {
    return event.target ? `[ ${event.target.name} ]` : "";
  }

  _tryToGuessDate(cFormat, cDate) {
    // We use the format to know the order of day, month, year, ...

    let actions = this._dateActionsCache.get(cFormat);
    if (!actions) {
      actions = [];
      this._dateActionsCache.set(cFormat, actions);
      cFormat.replaceAll(
        /(d+)|(m+)|(y+)|(H+)|(M+)|(s+)/g,
        function (match, d, m, y, H, M, s) {
          if (d) {
            actions.push((n, date) => {
              if (n >= 1 && n <= 31) {
                date.setDate(n);
                return true;
              }
              return false;
            });
          } else if (m) {
            actions.push((n, date) => {
              if (n >= 1 && n <= 12) {
                date.setMonth(n - 1);
                return true;
              }
              return false;
            });
          } else if (y) {
            actions.push((n, date) => {
              if (n < 50) {
                n += 2000;
              } else if (n < 100) {
                n += 1900;
              }
              date.setYear(n);
              return true;
            });
          } else if (H) {
            actions.push((n, date) => {
              if (n >= 0 && n <= 23) {
                date.setHours(n);
                return true;
              }
              return false;
            });
          } else if (M) {
            actions.push((n, date) => {
              if (n >= 0 && n <= 59) {
                date.setMinutes(n);
                return true;
              }
              return false;
            });
          } else if (s) {
            actions.push((n, date) => {
              if (n >= 0 && n <= 59) {
                date.setSeconds(n);
                return true;
              }
              return false;
            });
          }
          return "";
        }
      );
    }

    const number = /\d+/g;
    let i = 0;
    let array;
    const date = new Date();
    while ((array = number.exec(cDate)) !== null) {
      if (i < actions.length) {
        if (!actions[i++](parseInt(array[0]), date)) {
          return null;
        }
      } else {
        break;
      }
    }

    if (i === 0) {
      return null;
    }

    return date;
  }

  _parseDate(cFormat, cDate, strict = false) {
    let date = null;
    try {
      date = this._util.scand(cFormat, cDate);
    } catch {}
    if (!date) {
      if (strict) {
        return null;
      }
      let format = cFormat;
      if (/mm(?!m)/.test(format)) {
        format = format.replace("mm", "m");
      }
      if (/dd(?!d)/.test(format)) {
        format = format.replace("dd", "d");
      }
      try {
        date = this._util.scand(format, cDate);
      } catch {}
    }
    if (!date) {
      date = Date.parse(cDate);
      date = isNaN(date)
        ? this._tryToGuessDate(cFormat, cDate)
        : new Date(date);
    }
    return date;
  }

  AFMergeChange(event = globalThis.event) {
    if (event.willCommit) {
      return event.value.toString();
    }

    return this._app._eventDispatcher.mergeChange(event);
  }

  AFParseDateEx(cString, cOrder) {
    return this._parseDate(cOrder, cString);
  }

  AFExtractNums(str) {
    if (typeof str === "number") {
      return [str];
    }
    if (!str || typeof str !== "string") {
      return null;
    }

    const first = str.charAt(0);
    if (first === "." || first === ",") {
      str = `0${str}`;
    }

    const numbers = str.match(/(\d+)/g);
    if (numbers.length === 0) {
      return null;
    }

    return numbers;
  }

  AFMakeNumber(str) {
    if (typeof str === "number") {
      return str;
    }
    if (typeof str !== "string") {
      return null;
    }

    str = str.trim().replace(",", ".");
    const number = parseFloat(str);
    if (isNaN(number) || !isFinite(number)) {
      return null;
    }

    return number;
  }

  AFMakeArrayFromList(string) {
    if (typeof string === "string") {
      return string.split(/, ?/g);
    }
    return string;
  }

  AFNumber_Format(
    nDec,
    sepStyle,
    negStyle,
    currStyle /* unused */,
    strCurrency,
    bCurrencyPrepend
  ) {
    const event = globalThis.event;
    let value = this.AFMakeNumber(event.value);
    if (value === null) {
      event.value = "";
      return;
    }

    const sign = Math.sign(value);
    const buf = [];
    let hasParen = false;

    if (sign === -1 && bCurrencyPrepend && negStyle === 0) {
      buf.push("-");
    }

    if ((negStyle === 2 || negStyle === 3) && sign === -1) {
      buf.push("(");
      hasParen = true;
    }

    if (bCurrencyPrepend) {
      buf.push(strCurrency);
    }

    // sepStyle is an integer in [0;4]
    sepStyle = Math.min(Math.max(0, Math.floor(sepStyle)), 4);

    buf.push("%,", sepStyle, ".", nDec.toString(), "f");

    if (!bCurrencyPrepend) {
      buf.push(strCurrency);
    }

    if (hasParen) {
      buf.push(")");
    }

    if (negStyle === 1 || negStyle === 3) {
      event.target.textColor = sign === 1 ? this._color.black : this._color.red;
    }

    if ((negStyle !== 0 || bCurrencyPrepend) && sign === -1) {
      value = -value;
    }

    const formatStr = buf.join("");
    event.value = this._util.printf(formatStr, value);
  }

  AFNumber_Keystroke(
    nDec /* unused */,
    sepStyle,
    negStyle /* unused */,
    currStyle /* unused */,
    strCurrency /* unused */,
    bCurrencyPrepend /* unused */
  ) {
    const event = globalThis.event;
    let value = this.AFMergeChange(event);
    if (!value) {
      return;
    }
    value = value.trim();

    let pattern;
    if (sepStyle > 1) {
      // comma sep
      pattern = event.willCommit
        ? /^[+-]?(\d+(,\d*)?|,\d+)$/
        : /^[+-]?\d*,?\d*$/;
    } else {
      // dot sep
      pattern = event.willCommit
        ? /^[+-]?(\d+(\.\d*)?|\.\d+)$/
        : /^[+-]?\d*\.?\d*$/;
    }

    if (!pattern.test(value)) {
      if (event.willCommit) {
        const err = `${GlobalConstants.IDS_INVALID_VALUE} ${this._mkTargetName(
          event
        )}`;
        this._app.alert(err);
      }
      event.rc = false;
    }

    if (event.willCommit && sepStyle > 1) {
      event.value = parseFloat(value.replace(",", "."));
    }
  }

  AFPercent_Format(nDec, sepStyle, percentPrepend = false) {
    if (typeof nDec !== "number") {
      return;
    }
    if (typeof sepStyle !== "number") {
      return;
    }
    if (nDec < 0) {
      throw new Error("Invalid nDec value in AFPercent_Format");
    }

    const event = globalThis.event;
    if (nDec > 512) {
      event.value = "%";
      return;
    }

    nDec = Math.floor(nDec);

    // sepStyle is an integer in [0;4]
    sepStyle = Math.min(Math.max(0, Math.floor(sepStyle)), 4);

    let value = this.AFMakeNumber(event.value);
    if (value === null) {
      event.value = "%";
      return;
    }

    const formatStr = `%,${sepStyle}.${nDec}f`;
    value = this._util.printf(formatStr, value * 100);

    event.value = percentPrepend ? `%${value}` : `${value}%`;
  }

  AFPercent_Keystroke(nDec, sepStyle) {
    this.AFNumber_Keystroke(nDec, sepStyle, 0, 0, "", true);
  }

  AFDate_FormatEx(cFormat) {
    const event = globalThis.event;
    const value = event.value;
    if (!value) {
      return;
    }

    const date = this._parseDate(cFormat, value);
    if (date !== null) {
      event.value = this._util.printd(cFormat, date);
    }
  }

  AFDate_Format(pdf) {
    if (pdf >= 0 && pdf < this._dateFormats.length) {
      this.AFDate_FormatEx(this._dateFormats[pdf]);
    }
  }

  AFDate_KeystrokeEx(cFormat) {
    const event = globalThis.event;
    if (!event.willCommit) {
      return;
    }

    const value = this.AFMergeChange(event);
    if (!value) {
      return;
    }

    if (this._parseDate(cFormat, value, /* strict = */ true) === null) {
      const invalid = GlobalConstants.IDS_INVALID_DATE;
      const invalid2 = GlobalConstants.IDS_INVALID_DATE2;
      const err = `${invalid} ${this._mkTargetName(
        event
      )}${invalid2}${cFormat}`;
      this._app.alert(err);
      event.rc = false;
    }
  }

  AFDate_Keystroke(pdf) {
    if (pdf >= 0 && pdf < this._dateFormats.length) {
      this.AFDate_KeystrokeEx(this._dateFormats[pdf]);
    }
  }

  AFRange_Validate(bGreaterThan, nGreaterThan, bLessThan, nLessThan) {
    const event = globalThis.event;
    if (!event.value) {
      return;
    }

    const value = this.AFMakeNumber(event.value);
    if (value === null) {
      return;
    }

    bGreaterThan = !!bGreaterThan;
    bLessThan = !!bLessThan;

    if (bGreaterThan) {
      nGreaterThan = this.AFMakeNumber(nGreaterThan);
      if (nGreaterThan === null) {
        return;
      }
    }

    if (bLessThan) {
      nLessThan = this.AFMakeNumber(nLessThan);
      if (nLessThan === null) {
        return;
      }
    }

    let err = "";
    if (bGreaterThan && bLessThan) {
      if (value < nGreaterThan || value > nLessThan) {
        err = this._util.printf(
          GlobalConstants.IDS_GT_AND_LT,
          nGreaterThan,
          nLessThan
        );
      }
    } else if (bGreaterThan) {
      if (value < nGreaterThan) {
        err = this._util.printf(GlobalConstants.IDS_GREATER_THAN, nGreaterThan);
      }
    } else if (value > nLessThan) {
      err = this._util.printf(GlobalConstants.IDS_LESS_THAN, nLessThan);
    }
    if (err) {
      this._app.alert(err);
      event.rc = false;
    }
  }

  AFSimple(cFunction, nValue1, nValue2) {
    const value1 = this.AFMakeNumber(nValue1);
    if (value1 === null) {
      throw new Error("Invalid nValue1 in AFSimple");
    }

    const value2 = this.AFMakeNumber(nValue2);
    if (value2 === null) {
      throw new Error("Invalid nValue2 in AFSimple");
    }

    switch (cFunction) {
      case "AVG":
        return (value1 + value2) / 2;
      case "SUM":
        return value1 + value2;
      case "PRD":
        return value1 * value2;
      case "MIN":
        return Math.min(value1, value2);
      case "MAX":
        return Math.max(value1, value2);
    }

    throw new Error("Invalid cFunction in AFSimple");
  }

  AFSimple_Calculate(cFunction, cFields) {
    const actions = {
      AVG: args => args.reduce((acc, value) => acc + value, 0) / args.length,
      SUM: args => args.reduce((acc, value) => acc + value, 0),
      PRD: args => args.reduce((acc, value) => acc * value, 1),
      MIN: args =>
        args.reduce((acc, value) => Math.min(acc, value), Number.MAX_VALUE),
      MAX: args =>
        args.reduce((acc, value) => Math.max(acc, value), Number.MIN_VALUE),
    };

    if (!(cFunction in actions)) {
      throw new TypeError("Invalid function in AFSimple_Calculate");
    }

    const event = globalThis.event;
    const values = [];

    cFields = this.AFMakeArrayFromList(cFields);
    for (const cField of cFields) {
      const field = this._document.getField(cField);
      if (!field) {
        continue;
      }
      for (const child of field.getArray()) {
        const number = this.AFMakeNumber(child.value);
        values.push(number ?? 0);
      }
    }

    if (values.length === 0) {
      event.value = 0;
      return;
    }

    const res = actions[cFunction](values);
    event.value = Math.round(1e6 * res) / 1e6;
  }

  AFSpecial_Format(psf) {
    const event = globalThis.event;
    if (!event.value) {
      return;
    }

    psf = this.AFMakeNumber(psf);

    let formatStr;
    switch (psf) {
      case 0:
        formatStr = "99999";
        break;
      case 1:
        formatStr = "99999-9999";
        break;
      case 2:
        formatStr =
          this._util.printx("9999999999", event.value).length >= 10
            ? "(999) 999-9999"
            : "999-9999";
        break;
      case 3:
        formatStr = "999-99-9999";
        break;
      default:
        throw new Error("Invalid psf in AFSpecial_Format");
    }

    event.value = this._util.printx(formatStr, event.value);
  }

  AFSpecial_KeystrokeEx(cMask) {
    const event = globalThis.event;

    // Simplify the format string by removing all characters that are not
    // specific to the format because the user could enter 1234567 when the
    // format is 999-9999.
    const simplifiedFormatStr = cMask.replaceAll(/[^9AOX]/g, "");
    this.#AFSpecial_KeystrokeEx_helper(simplifiedFormatStr, false);
    if (event.rc) {
      return;
    }

    event.rc = true;
    this.#AFSpecial_KeystrokeEx_helper(cMask, true);
  }

  #AFSpecial_KeystrokeEx_helper(cMask, warn) {
    if (!cMask) {
      return;
    }

    const event = globalThis.event;
    const value = this.AFMergeChange(event);
    if (!value) {
      return;
    }

    const checkers = new Map([
      ["9", char => char >= "0" && char <= "9"],
      [
        "A",
        char => ("a" <= char && char <= "z") || ("A" <= char && char <= "Z"),
      ],
      [
        "O",
        char =>
          ("a" <= char && char <= "z") ||
          ("A" <= char && char <= "Z") ||
          ("0" <= char && char <= "9"),
      ],
      ["X", char => true],
    ]);

    function _checkValidity(_value, _cMask) {
      for (let i = 0, ii = _value.length; i < ii; i++) {
        const mask = _cMask.charAt(i);
        const char = _value.charAt(i);
        const checker = checkers.get(mask);
        if (checker) {
          if (!checker(char)) {
            return false;
          }
        } else if (mask !== char) {
          return false;
        }
      }
      return true;
    }

    const err = `${GlobalConstants.IDS_INVALID_VALUE} = "${cMask}"`;

    if (value.length > cMask.length) {
      if (warn) {
        this._app.alert(err);
      }
      event.rc = false;
      return;
    }

    if (event.willCommit) {
      if (value.length < cMask.length) {
        if (warn) {
          this._app.alert(err);
        }
        event.rc = false;
        return;
      }

      if (!_checkValidity(value, cMask)) {
        if (warn) {
          this._app.alert(err);
        }
        event.rc = false;
        return;
      }
      event.value += cMask.substring(value.length);
      return;
    }

    if (value.length < cMask.length) {
      cMask = cMask.substring(0, value.length);
    }

    if (!_checkValidity(value, cMask)) {
      if (warn) {
        this._app.alert(err);
      }
      event.rc = false;
    }
  }

  AFSpecial_Keystroke(psf) {
    const event = globalThis.event;
    psf = this.AFMakeNumber(psf);

    let formatStr;
    switch (psf) {
      case 0:
        formatStr = "99999";
        break;
      case 1:
        formatStr = "99999-9999";
        break;
      case 2:
        const value = this.AFMergeChange(event);
        formatStr =
          value.startsWith("(") || (value.length > 7 && /^\p{N}+$/.test(value))
            ? "(999) 999-9999"
            : "999-9999";
        break;
      case 3:
        formatStr = "999-99-9999";
        break;
      default:
        throw new Error("Invalid psf in AFSpecial_Keystroke");
    }

    this.AFSpecial_KeystrokeEx(formatStr);
  }

  AFTime_FormatEx(cFormat) {
    this.AFDate_FormatEx(cFormat);
  }

  AFTime_Format(pdf) {
    if (pdf >= 0 && pdf < this._timeFormats.length) {
      this.AFDate_FormatEx(this._timeFormats[pdf]);
    }
  }

  AFTime_KeystrokeEx(cFormat) {
    this.AFDate_KeystrokeEx(cFormat);
  }

  AFTime_Keystroke(pdf) {
    if (pdf >= 0 && pdf < this._timeFormats.length) {
      this.AFDate_KeystrokeEx(this._timeFormats[pdf]);
    }
  }

  eMailValidate(str) {
    return this._emailRegex.test(str);
  }

  AFExactMatch(rePatterns, str) {
    if (rePatterns instanceof RegExp) {
      return str.match(rePatterns)?.[0] === str || 0;
    }

    return rePatterns.findIndex(re => str.match(re)?.[0] === str) + 1;
  }
}

export { AForm };
