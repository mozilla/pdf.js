/* Copyright 2021 Mozilla Foundation
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

import { $buildXFAObject, NamespaceIds } from "./namespaces.js";
import {
  ContentObject,
  StringObject,
  XFAObject,
  XFAObjectArray,
} from "./xfa_object.js";
import { getInteger, getStringOption } from "./utils.js";

const LOCALE_SET_NS_ID = NamespaceIds.localeSet.id;

class CalendarSymbols extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "calendarSymbols", /* hasChildren = */ true);
    this.name = "gregorian";
    this.dayNames = new XFAObjectArray(2);
    this.eraNames = null;
    this.meridiemNames = null;
    this.monthNames = new XFAObjectArray(2);
  }
}

class CurrencySymbol extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "currencySymbol");
    this.name = getStringOption(attributes.name, [
      "symbol",
      "isoname",
      "decimal",
    ]);
  }
}

class CurrencySymbols extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "currencySymbols", /* hasChildren = */ true);
    this.currencySymbol = new XFAObjectArray(3);
  }
}

class DatePattern extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "datePattern");
    this.name = getStringOption(attributes.name, [
      "full",
      "long",
      "med",
      "short",
    ]);
  }
}

class DatePatterns extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "datePatterns", /* hasChildren = */ true);
    this.datePattern = new XFAObjectArray(4);
  }
}

class DateTimeSymbols extends ContentObject {
  // TODO: spec unclear about the format of the array.

  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "dateTimeSymbols");
  }
}

class Day extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "day");
  }
}

class DayNames extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "dayNames", /* hasChildren = */ true);
    this.abbr = getInteger({
      data: attributes.abbr,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.day = new XFAObjectArray(7);
  }
}

class Era extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "era");
  }
}

class EraNames extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "eraNames", /* hasChildren = */ true);
    this.era = new XFAObjectArray(2);
  }
}

class Locale extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "locale", /* hasChildren = */ true);
    this.desc = attributes.desc || "";
    this.name = "isoname";
    this.calendarSymbols = null;
    this.currencySymbols = null;
    this.datePatterns = null;
    this.dateTimeSymbols = null;
    this.numberPatterns = null;
    this.numberSymbols = null;
    this.timePatterns = null;
    this.typeFaces = null;
  }
}

class LocaleSet extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "localeSet", /* hasChildren = */ true);
    this.locale = new XFAObjectArray();
  }
}

class Meridiem extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "meridiem");
  }
}

class MeridiemNames extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "meridiemNames", /* hasChildren = */ true);
    this.meridiem = new XFAObjectArray(2);
  }
}

class Month extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "month");
  }
}

class MonthNames extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "monthNames", /* hasChildren = */ true);
    this.abbr = getInteger({
      data: attributes.abbr,
      defaultValue: 0,
      validate: x => x === 1,
    });
    this.month = new XFAObjectArray(12);
  }
}

class NumberPattern extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberPattern");
    this.name = getStringOption(attributes.name, [
      "full",
      "long",
      "med",
      "short",
    ]);
  }
}

class NumberPatterns extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberPatterns", /* hasChildren = */ true);
    this.numberPattern = new XFAObjectArray(4);
  }
}

class NumberSymbol extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberSymbol");
    this.name = getStringOption(attributes.name, [
      "decimal",
      "grouping",
      "percent",
      "minus",
      "zero",
    ]);
  }
}

class NumberSymbols extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "numberSymbols", /* hasChildren = */ true);
    this.numberSymbol = new XFAObjectArray(5);
  }
}

class TimePattern extends StringObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "timePattern");
    this.name = getStringOption(attributes.name, [
      "full",
      "long",
      "med",
      "short",
    ]);
  }
}

class TimePatterns extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "timePatterns", /* hasChildren = */ true);
    this.timePattern = new XFAObjectArray(4);
  }
}

class TypeFace extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "typeFace", /* hasChildren = */ true);
    this.name = attributes.name | "";
  }
}

class TypeFaces extends XFAObject {
  constructor(attributes) {
    super(LOCALE_SET_NS_ID, "typeFaces", /* hasChildren = */ true);
    this.typeFace = new XFAObjectArray();
  }
}

class LocaleSetNamespace {
  static [$buildXFAObject](name, attributes) {
    if (LocaleSetNamespace.hasOwnProperty(name)) {
      return LocaleSetNamespace[name](attributes);
    }
    return undefined;
  }

  static calendarSymbols(attrs) {
    return new CalendarSymbols(attrs);
  }

  static currencySymbol(attrs) {
    return new CurrencySymbol(attrs);
  }

  static currencySymbols(attrs) {
    return new CurrencySymbols(attrs);
  }

  static datePattern(attrs) {
    return new DatePattern(attrs);
  }

  static datePatterns(attrs) {
    return new DatePatterns(attrs);
  }

  static dateTimeSymbols(attrs) {
    return new DateTimeSymbols(attrs);
  }

  static day(attrs) {
    return new Day(attrs);
  }

  static dayNames(attrs) {
    return new DayNames(attrs);
  }

  static era(attrs) {
    return new Era(attrs);
  }

  static eraNames(attrs) {
    return new EraNames(attrs);
  }

  static locale(attrs) {
    return new Locale(attrs);
  }

  static localeSet(attrs) {
    return new LocaleSet(attrs);
  }

  static meridiem(attrs) {
    return new Meridiem(attrs);
  }

  static meridiemNames(attrs) {
    return new MeridiemNames(attrs);
  }

  static month(attrs) {
    return new Month(attrs);
  }

  static monthNames(attrs) {
    return new MonthNames(attrs);
  }

  static numberPattern(attrs) {
    return new NumberPattern(attrs);
  }

  static numberPatterns(attrs) {
    return new NumberPatterns(attrs);
  }

  static numberSymbol(attrs) {
    return new NumberSymbol(attrs);
  }

  static numberSymbols(attrs) {
    return new NumberSymbols(attrs);
  }

  static timePattern(attrs) {
    return new TimePattern(attrs);
  }

  static timePatterns(attrs) {
    return new TimePatterns(attrs);
  }

  static typeFace(attrs) {
    return new TypeFace(attrs);
  }

  static typeFaces(attrs) {
    return new TypeFaces(attrs);
  }
}

export { LocaleSetNamespace };
