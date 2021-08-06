import {
  FormatError,
  isBool,
  isNum,
  isString,
  stringToPDFString,
  UnknownErrorException,
  warn,
} from "../shared/util.js";
import { isName } from "./primitives.js";

/**
 * Serialize and validate a vp dictionary as specified
 * in PDF iso 32000 specification and the later supplement.
 *
 * @param {Dict} dict A vp dictionary object
 * @returns {Object} A validated and serialized object.
 *  returns undefined if dict is not valid.
 */
function serializeGeoVP(dict) {
  return (
    validateStructureWithCatch(dict, GeoBluePrint) ||
    validateStructureWithCatch(dict, RectiLinearBluePrint)
  );
}

function validateStructureWithCatch(structIn, bluePrintIn) {
  try {
    const result = _validateStructure(structIn, bluePrintIn);
    return result;
  } catch (err) {
    if (err.constructor === FormatError) {
      warn(err);
    } else {
      // pass other errors through
      throw err;
    }
  }
  return undefined;
}

/**
 * This is the blue print for a valid geo VP object.
 *   It is compared against the input.
 *   Most of the values in the blue print are curried functions,
 *     with the exception of isNum, isString, and isName.
 *   The specification is from section 8.8.1 of the pdf 32000 supplement.
 */
const GeoBluePrint = {
  Type: isExactly("Viewport"),
  BBox: required(ArrayObj(isNum, 4)),
  Name: isString,
  Measure: parseStructure({
    Type: isExactly("Measure"),
    Subtype: required(isExactly("GEO")),
    Bounds: required(ArrayObj(isNum)),
    GCS: required(
      parseStructure({
        // required
        Type: required(or([isExactly("PROJCS"), isExactly("GEOGCS")])),
        EPSG: isNum,
        WKT: isString,
      })
    ),
    DCS: parseStructure({
      Type: required(or([isExactly("PROJCS"), isExactly("GEOGCS")])),
      EPSG: isNum,
      WKT: isString,
    }),
    PDU: ArrayObj(isName, 3),
    GPTS: required(ArrayObj(isNum)),
    LPTS: ArrayObj(isNum),
    PtData: optional(
      parseStructure({
        Type: required(isExactly("PtData")),
        SubType: required(isExactly("Cloud")),
        Names: required(ArrayObj(isName)),
        XPTS: required(ArrayObj(ArrayObj)),
      })
    ),
  }),
};

/**
 * Number format blueprint for Rectilinear measurements
 */
const RectiLinearNumberFormatBluePrint = {
  Type: isExactly("NumberFormat"),
  U: required(isString),
  C: required(isNum),
  F: isName,
  D: isNum,
  FD: isBool,
  RT: isString,
  RD: isString,
  PS: isString,
  SS: isString,
  O: isName,
};

/**
 * Blue print for the Rectilinear measurement specification.
 * This is specified in section 12.9 of the the 2008 pdf specification.
 */
const RectiLinearBluePrint = {
  Type: isExactly("Viewport"),
  BBox: required(ArrayObj(isNum, 4)),
  Name: isString,
  Measure: parseStructure({
    Type: required(isExactly("Measure")),
    SubType: isExactly("RL"),
    R: required(isString),
    X: required(ArrayObj(numberFormatDictionary)),
    Y: ArrayObj(numberFormatDictionary),
    D: required(ArrayObj(numberFormatDictionary)),
    A: required(ArrayObj(numberFormatDictionary)),
    T: ArrayObj(numberFormatDictionary),
    S: ArrayObj(numberFormatDictionary),
    O: ArrayObj(isNum, 2),
    CYX: isNum,
  }),
};

function parseStructure(bluePrint) {
  return function (structIn) {
    return _validateStructure(structIn, bluePrint);
  };
}

function callValidator(validator, value, optionalKey) {
  const response = validator(value, optionalKey);
  let result = response;
  if (response === true) {
    // primitive like isNum, isBool, isString which returns true/false.
    // IsDict is not supported
    result = value;
    if (isString(response)) {
      result = stringToPDFString(response);
    }
  }
  return result;
}

function _validateStructure(structIn, bluePrintIn) {
  if (!structIn) {
    return undefined;
  }
  const result = {};
  Object.keys(bluePrintIn).forEach(key => {
    const validator = bluePrintIn[key];
    const val = structIn.get(key);
    if (typeof validator === "function") {
      const response = callValidator(validator, val, key);
      if (response !== undefined) {
        result[key] = response;
      }
    } else {
      // This should only happen during developement if blueprint is changed.
      throw new UnknownErrorException(`Unknown blue print value`);
    }
  });
  return result;
}

// ////
// Helpers for the blue prints
// ////

function numberFormatDictionary(dict) {
  const retVal = _validateStructure(dict, RectiLinearNumberFormatBluePrint);
  console.log(retVal);
  return retVal;
}

function or(functionArray) {
  return function (val) {
    for (const f of functionArray) {
      const response = callValidator(f, val); // f(val)
      if (response !== undefined) {
        return response;
      }
    }
    return undefined;
  };
}

function ArrayObj(validator, length) {
  return function (arrayIn) {
    if (Array.isArray(arrayIn)) {
      if (length === undefined || arrayIn.length === length) {
        const converted = arrayIn.map(x => {
          const response = callValidator(validator, x);
          return response;
        });
        const isNotValid = converted.reduce((acc, cur) => {
          return acc || cur === undefined;
        }, false);
        if (!isNotValid) {
          return converted;
        }
      }
    }
    return undefined;
  };
}

function isExactly(bluePrintVal) {
  return function (val) {
    if (isName(val) && isName(val, bluePrintVal)) {
      return val.name;
    }
    if (val === bluePrintVal) {
      return val;
    }
    return undefined;
  };
}

/**
 * Throws a FormatError when it encounters a missing or invalid value.
 * @param {function} validator
 * @returns
 */
function required(validator) {
  return function (value, key) {
    if (!value) {
      throw new FormatError(`Required param is undefined for ${key}`);
    }
    const result = callValidator(validator, value, key); // validator(value);
    if (result !== undefined) {
      return result;
    }
    throw new FormatError(`Required parameter is not valid ${key}`);
  };
}

function optional(validator) {
  return function (value, key) {
    try {
      return callValidator(validator, value, key); // validator(value);
    } catch (err) {
      if (err.constructor !== FormatError) {
        // pass other errors through
        throw err;
      }
    }
    return undefined;
  };
}

export { serializeGeoVP };
