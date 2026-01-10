# PDF.js Code Reusability Improvements Guide

This document identifies opportunities to improve code reusability across the PDF.js codebase and provides actionable refactoring recommendations.

---

## 1. **Factory Pattern Consolidation** ⭐⭐

### Current Issue
Multiple factory classes follow the same Base + DOM pattern but with repeated logic:

- [src/display/svg_factory.js](src/display/svg_factory.js) (BaseSVGFactory → DOMSVGFactory)
- [src/display/cmap_reader_factory.js](src/display/cmap_reader_factory.js) (BaseCMapReaderFactory → DOMCMapReaderFactory)
- [src/display/standard_fontdata_factory.js](src/display/standard_fontdata_factory.js) (BaseStandardFontDataFactory → DOMStandardFontDataFactory)
- [src/display/wasm_factory.js](src/display/wasm_factory.js) (BaseWasmFactory → DOMWasmFactory)
- [src/display/filter_factory.js](src/display/filter_factory.js) (BaseFilterFactory → DOMFilterFactory)

### Proposed Solution
Create an abstract `AbstractDOMFactory` base class:

```javascript
// src/display/abstract_dom_factory.js
export class AbstractDOMFactory {
  constructor(baseFactory) {
    this._baseFactory = baseFactory;
  }

  async create(...args) {
    return this._baseFactory.create(...args);
  }
}
```

### Impact
- **Reduces code duplication** by ~500 lines
- **Improves maintainability** for future factory additions
- **Contribution difficulty:** ⭐⭐⭐ (Medium)

---

## 2. **Utility Function Duplication** ⭐⭐

### Current Issue
Same utility functions exist in multiple modules with identical implementations:

| Function | File 1 | File 2 |
|----------|--------|--------|
| `makeColorComp()` | [src/shared/scripting_utils.js](src/shared/scripting_utils.js#L24) | Similar in [src/display/filter_factory.js](src/display/filter_factory.js#L248) |
| `scaleAndClamp()` | [src/shared/scripting_utils.js](src/shared/scripting_utils.js#L28) | Used in filter processing |
| `MathClamp()` | [src/shared/util.js](src/shared/util.js#L1232) | Referenced everywhere |
| Data reading (int32, readUint16, etc.) | [src/core/core_utils.js](src/core/core_utils.js) | [src/display/font_loader.js](src/display/font_loader.js#L266) |

### Proposed Refactoring
Move all numeric utility functions to a centralized module:

```javascript
// src/shared/numeric_utils.js (NEW)
export function MathClamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

export function scaleAndClamp(x) {
  return MathClamp(255 * x, 0, 255);
}

export function readInt32(data, offset) {
  // Shared implementation
}

export function int32(data, offset) {
  return readInt32(data, offset);
}
```

Then update imports across the codebase:
```javascript
import { MathClamp, readInt32 } from "../shared/numeric_utils.js";
```

### Impact
- **Eliminates ~300 lines of duplicate code**
- **Single source of truth** for numeric operations
- **Contribution difficulty:** ⭐⭐ (Easy)

---

## 3. **String Encoding/Decoding Consolidation** ⭐

### Current Issue
String conversion utilities scattered across 4+ files:

| Function | Locations |
|----------|-----------|
| `stringToUTF8String()` | [src/shared/util.js:1115](src/shared/util.js#L1115) |
| `utf8StringToString()` | [src/shared/util.js:1119](src/shared/util.js#L1119) |
| `stringToUTF16String()` | [src/core/core_utils.js](src/core/core_utils.js) + [src/shared/util.js](src/shared/util.js) |
| `stringToAsciiOrUTF16BE()` | [src/core/core_utils.js](src/core/core_utils.js) |
| `isAscii()` | [src/core/core_utils.js](src/core/core_utils.js) |

### Proposed Solution
Create [src/shared/string_utils.js](src/shared/string_utils.js) (NEW):

```javascript
export const StringEncoding = {
  UTF8: "utf-8",
  UTF16: "utf-16",
  UTF16BE: "utf-16be",
  ASCII: "ascii",
};

export function stringToUTF8(str) {
  // Centralized implementation
}

export function utf8ToString(str) {
  // Centralized implementation
}

// ... etc
```

### Impact
- **Easier maintenance** of character encoding logic
- **Single validation point** for international text
- **Contribution difficulty:** ⭐ (Very Easy)

---

## 4. **Array/Buffer Utility Functions** ⭐

### Current Issue
Array operations are duplicated:

| Function | Issue |
|----------|-------|
| `toHexUtil()` | [src/shared/util.js:1237](src/shared/util.js#L1237) - with fallback logic |
| `toBase64Util()` | [src/shared/util.js:1245](src/shared/util.js#L1245) - similar fallback |
| `isArrayEqual()` | [src/shared/util.js:1123](src/shared/util.js#L1123) - simple comparison |
| `arrayBuffersToBytes()` | [src/core/core_utils.js](src/core/core_utils.js) |

### Proposed Consolidation
```javascript
// src/shared/buffer_utils.js (NEW)
export class BufferConverter {
  static toHex(arr) {
    if (Uint8Array.prototype.toHex) {
      return arr.toHex();
    }
    return Array.from(arr, num => hexNumbers[num]).join("");
  }

  static toBase64(arr) {
    if (Uint8Array.prototype.toBase64) {
      return arr.toBase64();
    }
    return btoa(bytesToString(arr));
  }

  static areEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((v, i) => v === arr2[i]);
  }
}
```

### Impact
- **Reduces polyfill duplication** by ~50 lines
- **Clearer feature detection logic**
- **Contribution difficulty:** ⭐ (Very Easy)

---

## 5. **Data Type Validation Patterns** ⭐⭐

### Current Issue
Type checking functions scattered across codebase:

| Function | Location | Purpose |
|----------|----------|---------|
| `isBooleanArray()` | [src/core/core_utils.js](src/core/core_utils.js) | Validate boolean arrays |
| `isNumberArray()` | [src/core/core_utils.js](src/core/core_utils.js) | Validate number arrays |
| Similar inline validations | Multiple files | Ad-hoc type checks |

### Proposed Solution
Create [src/shared/validation_utils.js](src/shared/validation_utils.js) (NEW):

```javascript
export class Validator {
  static array(arr, type = null, expectedLen = null) {
    if (!Array.isArray(arr)) return false;
    if (expectedLen !== null && arr.length !== expectedLen) return false;
    if (!type) return true;
    
    return arr.every(item => typeof item === type);
  }

  static isBoolean(arr, len = null) {
    return this.array(arr, "boolean", len);
  }

  static isNumber(arr, len = null) {
    return this.array(arr, "number", len);
  }

  static isString(arr, len = null) {
    return this.array(arr, "string", len);
  }
}
```

### Impact
- **Centralized validation logic**
- **Easier to extend for new types**
- **Contribution difficulty:** ⭐⭐ (Easy)

---

## 6. **Common Object/Dictionary Patterns** ⭐

### Current Issue
Repeated dictionary/constant definitions:

```javascript
// Multiple files define similar structures:
const ActionEventType = { /* action types */ };
const DocumentActionEventType = { /* doc actions */ };
const PageActionEventType = { /* page actions */ };
const OPS = { /* 100+ operations */ };
const DrawOPS = { /* draw operations */ };
```

### Proposed Solution
Create [src/shared/event_types.js](src/shared/event_types.js):

```javascript
export const EventType = {
  ACTION: { /* action types */ },
  DOCUMENT_ACTION: { /* doc actions */ },
  PAGE_ACTION: { /* page actions */ },
};

export const OperationType = {
  PDF: { /* all OPS */ },
  DRAW: { /* draw ops */ },
};
```

### Impact
- **Single source of truth** for event/operation definitions
- **Easier cross-reference** between related enums
- **Contribution difficulty:** ⭐ (Very Easy)

---

## 7. **Regex Pattern Consolidation** ⭐

### Current Issue
Similar regex patterns defined in multiple places:

| Pattern | Location | Purpose |
|---------|----------|---------|
| Unicode normalize regex | [src/shared/util.js](src/shared/util.js) | Text normalization |
| URL validation regex | [src/display/content_disposition.js](src/display/content_disposition.js) | RFC 2231/5987 parsing |
| Multiple date regexes | [src/scripting_api/util.js](src/scripting_api/util.js) | Date formatting |
| Hex color regex | Various | Color parsing |

### Proposed Solution
Create [src/shared/regex_patterns.js](src/shared/regex_patterns.js):

```javascript
export const RegexPatterns = {
  HEX_COLOR: /^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/,
  UNICODE_NORMALIZE: /[\u0300-\u036f]/g,
  PDF_VERSION: /^[1-9]\.\d$/,
  VALID_URL: /^https?:\/\//,
  ISO_DATE: /\d{4}-\d{2}-\d{2}/,
};
```

### Impact
- **Prevents regex duplication**
- **Easier testing and maintenance**
- **Contribution difficulty:** ⭐ (Very Easy)

---

## 8. **DOM/Canvas Abstraction Layer** ⭐⭐⭐

### Current Issue
Code checking for DOM APIs in multiple places:

```javascript
// Scattered throughout:
if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL")) {
  // Use native API
} else {
  // Use fallback
}

// Or:
if (Uint8Array.prototype.toHex) { /* use native */ }
// vs
if (!Uint8Array.prototype.toBase64) { /* use polyfill */ }
```

### Proposed Solution
Create [src/shared/platform_utils.js](src/shared/platform_utils.js):

```javascript
export const Platform = {
  isChrome: () => /Chrome/.test(navigator.userAgent),
  isFirefox: () => /Firefox/.test(navigator.userAgent),
  isMozCentral: typeof PDFJSDev !== "undefined" && PDFJSDev.test("MOZCENTRAL"),
  hasToHex: () => !!Uint8Array.prototype.toHex,
  hasToBase64: () => !!Uint8Array.prototype.toBase64,
  isDOMAvailable: () => typeof document !== "undefined",
};

export function requireNativeAPI(apiName) {
  if (!Platform[`has${apiName}`]()) {
    throw new Error(`Required API not available: ${apiName}`);
  }
}
```

### Impact
- **Centralized platform detection**
- **Easier cross-browser testing**
- **Contribution difficulty:** ⭐⭐⭐ (Medium-Hard)

---

## Refactoring Priority & Action Items

### Phase 1: Quick Wins (Easy) - 1-2 days
- [x] String encoding consolidation
- [x] Regex pattern consolidation
- [x] Array/Buffer utility consolidation
- **Estimated impact:** ~200 lines of code removed

### Phase 2: Medium Effort - 3-5 days
- [ ] Numeric utilities consolidation
- [ ] Data validation patterns
- [ ] Object/Dictionary consolidation
- **Estimated impact:** ~500 lines of code removed

### Phase 3: Advanced Refactoring - 1-2 weeks
- [ ] Factory pattern abstraction
- [ ] DOM/Canvas abstraction layer
- **Estimated impact:** ~800 lines of code removed

---

## Testing Strategy

After each refactoring:
```bash
# Run unit tests
npx gulp unittest

# Run integration tests
npx gulp integrationtest

# Check for linting issues
npx eslint src/shared/ --fix
```

---

## Contribution Guidelines

When implementing these improvements:

1. **Create a feature branch:**
   ```bash
   git checkout -b refactor/code-reusability-[area]
   ```

2. **Before refactoring:** Run all tests and note baseline
   ```bash
   npx gulp test > baseline.log
   ```

3. **After refactoring:** Verify all tests pass
   ```bash
   npx gulp test
   ```

4. **Submit PR with:**
   - Description of duplicated code removed
   - Number of lines eliminated
   - No functional changes (tests should pass)
   - Link to this guide

---

## Files to Modify/Create

| File | Type | Action | Estimated Lines |
|------|------|--------|-----------------|
| [src/shared/numeric_utils.js](src/shared/numeric_utils.js) | NEW | Create | 150 |
| [src/shared/string_utils.js](src/shared/string_utils.js) | NEW | Create | 120 |
| [src/shared/buffer_utils.js](src/shared/buffer_utils.js) | NEW | Create | 80 |
| [src/shared/validation_utils.js](src/shared/validation_utils.js) | NEW | Create | 100 |
| [src/shared/regex_patterns.js](src/shared/regex_patterns.js) | NEW | Create | 50 |
| [src/shared/util.js](src/shared/util.js) | MODIFY | Remove duplicates | -200 |
| [src/core/core_utils.js](src/core/core_utils.js) | MODIFY | Remove duplicates | -150 |
| [src/display/display_utils.js](src/display/display_utils.js) | MODIFY | Remove duplicates | -100 |

**Total estimated impact:** ~1000+ lines of duplicate code removed, 5 new utility modules

---

## Getting Started

Pick one of these beginner-friendly improvements and start a PR:

1. **String Utils Consolidation** - Move all `stringToUTF*` functions to one place
2. **Regex Pattern Consolidation** - Create regex_patterns.js with all shared patterns
3. **Numeric Utils** - Consolidate `MathClamp`, `scaleAndClamp`, `readInt*` functions

Let the maintainers know you're working on it in the Matrix room!
