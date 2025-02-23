import globals from "globals";

import import_ from "eslint-plugin-import";
import jasmine from "eslint-plugin-jasmine";
import json from "eslint-plugin-json";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import perfectionist from "eslint-plugin-perfectionist";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import unicorn from "eslint-plugin-unicorn";

const jsFiles = folder => {
  const prefix = folder === "." ? "" : folder + "/";
  return [prefix + "**/*.js", prefix + "**/*.jsm", prefix + "**/*.mjs"];
};

// Include all files referenced in extensions/chromium/background.js
const chromiumExtensionServiceWorkerFiles = [
  "extensions/chromium/extension-router.js",
  "extensions/chromium/options/migration.js",
  "extensions/chromium/pdfHandler.js",
  "extensions/chromium/preserve-referer.js",
  "extensions/chromium/suppress-update.js",
  "extensions/chromium/telemetry.js",
];

export default [
  {
    ignores: [
      "**/build/",
      "**/l10n/",
      "**/docs/",
      "**/node_modules/",
      "external/bcmaps/",
      "external/builder/fixtures/",
      "external/builder/fixtures_babel/",
      "external/quickjs/",
      "external/openjpeg/",
      "test/stats/results/",
      "test/tmp/",
      "test/pdfs/",
      "web/locale/",
      "web/wasm/",
      "**/*~/",
    ],
  },

  /* ======================================================================== *\
                             Base configuration
  \* ======================================================================== */

  prettierRecommended,
  {
    files: ["**/*.json"],
    ...json.configs.recommended,
  },
  {
    files: jsFiles("."),
    ignores: chromiumExtensionServiceWorkerFiles,
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: jsFiles("."),

    plugins: {
      import: import_.flatConfigs.recommended.plugins.import,
      json,
      "no-unsanitized": noUnsanitized,
      perfectionist,
      unicorn,
    },

    languageOptions: {
      globals: {
        ...globals.worker,
        PDFJSDev: "readonly",
        __non_webpack_import__: "readonly",
      },

      ecmaVersion: 2025,
      sourceType: "module",
    },

    rules: {
      "import/export": "error",
      "import/exports-last": "error",
      "import/extensions": ["error", "always", { ignorePackages: true }],
      "import/first": "error",
      "import/named": "error",
      "import/no-cycle": "error",
      "import/no-empty-named-blocks": "error",
      "import/no-commonjs": "error",
      "import/no-mutable-exports": "error",
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./web",
              from: "./src",
            },
          ],
        },
      ],
      "import/no-self-import": "error",
      "import/no-unresolved": [
        "error",
        {
          ignore: [
            "display",
            "pdfjs",
            "pdfjs-lib",
            "pdfjs-web",
            "web",
            "fluent-bundle",
            "fluent-dom",
            // See https://github.com/firebase/firebase-admin-node/discussions/1359.
            "eslint-plugin-perfectionist",
          ],
        },
      ],
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
      "perfectionist/sort-exports": "error",
      "perfectionist/sort-named-exports": "error",
      "unicorn/no-abusive-eslint-disable": "error",
      "unicorn/no-array-push-push": "error",
      "unicorn/no-console-spaces": "error",
      "unicorn/no-instanceof-builtins": "error",
      "unicorn/no-invalid-remove-event-listener": "error",
      "unicorn/no-new-buffer": "error",
      "unicorn/no-single-promise-in-promise-methods": "error",
      "unicorn/no-typeof-undefined": ["error", { checkGlobalVariables: false }],
      "unicorn/no-useless-promise-resolve-reject": "error",
      "unicorn/no-useless-spread": "error",
      "unicorn/prefer-array-find": "error",
      "unicorn/prefer-array-flat": "error",
      "unicorn/prefer-array-flat-map": "error",
      "unicorn/prefer-array-index-of": "error",
      "unicorn/prefer-array-some": "error",
      "unicorn/prefer-at": "error",
      "unicorn/prefer-date-now": "error",
      "unicorn/prefer-dom-node-append": "error",
      "unicorn/prefer-dom-node-remove": "error",
      "unicorn/prefer-includes": "error",
      "unicorn/prefer-logical-operator-over-ternary": "error",
      "unicorn/prefer-modern-dom-apis": "error",
      "unicorn/prefer-modern-math-apis": "error",
      "unicorn/prefer-negative-index": "error",
      "unicorn/prefer-optional-catch-binding": "error",
      "unicorn/prefer-regexp-test": "error",
      "unicorn/prefer-string-replace-all": "error",
      "unicorn/prefer-string-starts-ends-with": "error",
      "unicorn/prefer-ternary": ["error", "only-single-line"],
      "unicorn/throw-new-error": "error",

      // Possible errors
      "for-direction": "error",
      "getter-return": "error",
      "no-async-promise-executor": "error",
      "no-cond-assign": ["error", "except-parens"],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-debugger": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-empty-character-class": "error",
      "no-ex-assign": "error",
      "no-extra-boolean-cast": "error",
      "no-func-assign": "error",
      "no-inner-declarations": ["error", "functions"],
      "no-invalid-regexp": "error",
      "no-irregular-whitespace": "error",
      "no-loss-of-precision": "error",
      "no-obj-calls": "error",
      "no-promise-executor-return": "error",
      "no-regex-spaces": "error",
      "no-setter-return": "error",
      "no-sparse-arrays": "error",
      "no-template-curly-in-string": "error",
      "no-unexpected-multiline": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "no-unsafe-negation": "error",
      "no-unsafe-optional-chaining": [
        "error",
        { disallowArithmeticOperators: true },
      ],
      "no-unused-private-class-members": "error",
      "use-isnan": ["error", { enforceForIndexOf: true }],
      "valid-typeof": ["error", { requireStringLiterals: true }],

      // Best Practices
      "accessor-pairs": [
        "error",
        { setWithoutGet: true, enforceForClassMembers: true },
      ],
      "consistent-return": "error",
      curly: ["error", "all"],
      "default-case-last": "error",
      "dot-notation": "error",
      eqeqeq: ["error", "always"],
      "grouped-accessor-pairs": ["error", "getBeforeSet"],
      "no-alert": "error",
      "no-caller": "error",
      "no-else-return": "error",
      "no-empty-pattern": "error",
      "no-eval": "error",
      "no-extend-native": "error",
      "no-extra-bind": "error",
      "no-extra-label": "error",
      "no-fallthrough": "error",
      "no-floating-decimal": "error",
      "no-global-assign": "error",
      "no-implied-eval": "error",
      "no-iterator": "error",
      "no-lone-blocks": "error",
      "no-lonely-if": "error",
      "no-multi-str": "error",
      "no-new": "error",
      "no-new-func": "error",
      "no-new-symbol": "error",
      "no-new-wrappers": "error",
      "no-octal-escape": "error",
      "no-octal": "error",
      "no-redeclare": "error",
      "no-return-await": "error",
      "no-self-assign": "error",
      "no-self-compare": "error",
      "no-throw-literal": "error",
      "no-unused-expressions": "error",
      "no-unused-labels": "error",
      "no-useless-call": "error",
      "no-useless-catch": "error",
      "no-useless-concat": "error",
      "no-useless-escape": "error",
      "no-useless-return": "error",
      "prefer-promise-reject-errors": "error",
      "prefer-spread": "error",
      "wrap-iife": ["error", "any"],
      yoda: ["error", "never", { exceptRange: true }],

      // Strict Mode
      strict: ["off", "global"],

      // Variables
      "no-delete-var": "error",
      "no-label-var": "error",
      "no-shadow": "error",
      "no-shadow-restricted-names": "error",
      "no-undef-init": "error",
      "no-undef": ["error", { typeof: true }],
      "no-unused-vars": ["error", { vars: "all", args: "none" }],
      "no-use-before-define": [
        "error",
        { functions: false, classes: false, variables: false },
      ],

      // Stylistic Issues
      "lines-between-class-members": ["error", "always"],
      "max-len": ["error", { code: 1000, comments: 80, ignoreUrls: true }],
      "new-cap": ["error", { newIsCap: true, capIsNew: false }],
      "no-array-constructor": "error",
      "no-multiple-empty-lines": ["error", { max: 1, maxEOF: 0, maxBOF: 1 }],
      "no-nested-ternary": "error",
      "no-new-object": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "BinaryExpression[operator='instanceof'][right.name='Object']",
          message: "Use `typeof` rather than `instanceof Object`.",
        },
        {
          selector: "CallExpression[callee.name='assert'][arguments.length!=2]",
          message: "`assert()` must always be invoked with two arguments.",
        },
        {
          selector: "CallExpression[callee.name='isCmd'][arguments.length<2]",
          message:
            "Use `instanceof Cmd` rather than `isCmd()` with one argument.",
        },
        {
          selector: "CallExpression[callee.name='isDict'][arguments.length<2]",
          message:
            "Use `instanceof Dict` rather than `isDict()` with one argument.",
        },
        {
          selector: "CallExpression[callee.name='isName'][arguments.length<2]",
          message:
            "Use `instanceof Name` rather than `isName()` with one argument.",
        },
        {
          selector: "NewExpression[callee.name='Cmd']",
          message: "Use `Cmd.get()` rather than `new Cmd()`.",
        },
        {
          selector: "NewExpression[callee.name='Name']",
          message: "Use `Name.get()` rather than `new Name()`.",
        },
        {
          selector: "NewExpression[callee.name='Ref']",
          message: "Use `Ref.get()` rather than `new Ref()`.",
        },
      ],
      "no-unneeded-ternary": "error",
      "operator-assignment": "error",
      "prefer-exponentiation-operator": "error",
      "spaced-comment": ["error", "always", { block: { balanced: true } }],

      // ECMAScript 6
      "arrow-body-style": ["error", "as-needed"],
      "constructor-super": "error",
      "no-class-assign": "error",
      "no-const-assign": "error",
      "no-dupe-class-members": "error",
      "no-duplicate-imports": "error",
      "no-this-before-super": "error",
      "no-useless-computed-key": "error",
      "no-useless-constructor": "error",
      "no-useless-rename": "error",
      "no-var": "error",
      "object-shorthand": ["error", "always", { avoidQuotes: true }],
      "prefer-const": "error",
      "require-yield": "error",
      "sort-imports": ["error", { ignoreCase: true }],
      "template-curly-spacing": ["error", "never"],
    },
  },
  {
    files: jsFiles("src"),
    rules: {
      "no-console": "error",
    },
  },

  /* ======================================================================== *\
                            Test-specific rules
  \* ======================================================================== */

  {
    files: jsFiles("test"),

    plugins: { jasmine },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jasmine,
      },
    },
    rules: {
      ...jasmine.configs.recommended.rules,
      "jasmine/new-line-before-expect": "off",
      "jasmine/new-line-between-declarations": "off",
      "jasmine/no-focused-tests": "error",
      "jasmine/no-pending-tests": "off",
      "jasmine/no-spec-dupes": ["error", "branch"],
      "jasmine/no-suite-dupes": ["error", "branch"],
      "jasmine/prefer-jasmine-matcher": "off",
      "jasmine/prefer-toHaveBeenCalledWith": "off",
    },
  },
  {
    files: jsFiles("test/unit"),
    rules: {
      "import/no-unresolved": ["error", { ignore: ["pdfjs/"] }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: jsFiles("test/integration"),
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='waitForTimeout']",
          message:
            "`waitForTimeout` can cause intermittent failures and should not be used (see issue #17656 for replacements).",
        },
      ],
    },
  },

  /* ======================================================================== *\
                            External libraries
  \* ======================================================================== */

  {
    files: jsFiles("external"),

    languageOptions: { globals: globals.node },
  },

  /* ======================================================================== *\
                             Examples
  \* ======================================================================== */

  {
    files: jsFiles("examples"),

    languageOptions: {
      globals: {
        pdfjsImageDecoders: false,
        pdfjsLib: false,
        pdfjsViewer: false,
      },
    },
  },
  {
    files: [...jsFiles("examples/node"), ...jsFiles("examples/webpack")],

    languageOptions: { globals: globals.node },
  },

  /* ======================================================================== *\
                            Chromium extension
  \* ======================================================================== */

  {
    files: jsFiles("extensions/chromium"),

    languageOptions: {
      globals: globals.webextensions,
      sourceType: "script",
    },

    rules: {
      "no-var": "off",
    },
  },
  {
    files: chromiumExtensionServiceWorkerFiles,

    languageOptions: {
      globals: globals.serviceworker,
      sourceType: "script",
    },
  },

  /* ======================================================================== *\
                                Other
  \* ======================================================================== */
  {
    files: ["gulpfile.mjs"],
    languageOptions: { globals: globals.node },
  },
];
