import fs from "fs";
import path from "path";
import vm from "vm";

const AllWhitespaceRegexp = /^\s+$/g;

/**
 * A simple preprocessor that is based on the Firefox preprocessor
 * (https://dxr.mozilla.org/mozilla-central/source/build/docs/preprocessor.rst).
 * The main difference is that this supports a subset of the commands and it
 * supports preprocessor commands in HTML-style comments.
 *
 * Currently supported commands:
 * - if
 * - elif
 * - else
 * - endif
 * - include
 * - expand
 * - error
 *
 * Every #if must be closed with an #endif. Nested conditions are supported.
 *
 * Within an #if or #else block, one level of comment tokens is stripped. This
 * allows us to write code that can run even without preprocessing. For example:
 *
 * //#if SOME_RARE_CONDITION
 * // // Decrement by one
 * // --i;
 * //#else
 * // // Increment by one.
 * ++i;
 * //#endif
 */
function preprocess(inFilename, outFilename, defines) {
  let lineNumber = 0;
  function loc() {
    return fs.realpathSync(inFilename) + ":" + lineNumber;
  }

  function expandCssImports(content, baseUrl) {
    return content.replaceAll(
      /^\s*@import\s+url\(([^)]+)\);\s*$/gm,
      function (all, url) {
        if (defines.GECKOVIEW) {
          switch (url) {
            case "annotation_editor_layer_builder.css":
              return "";
          }
        }
        const file = path.join(path.dirname(baseUrl), url);
        const imported = fs.readFileSync(file, "utf8").toString();
        return expandCssImports(imported, file);
      }
    );
  }

  // TODO make this really read line by line.
  let content = fs.readFileSync(inFilename, "utf8").toString();
  // Handle CSS-imports first, when necessary.
  if (/\.css$/i.test(inFilename)) {
    content = expandCssImports(content, inFilename);
  }
  const lines = content.split("\n"),
    totalLines = lines.length;
  const out = [];
  let i = 0;
  function readLine() {
    if (i < totalLines) {
      return lines[i++];
    }
    return null;
  }
  const writeLine =
    typeof outFilename === "function"
      ? outFilename
      : function (line) {
          if (!line || AllWhitespaceRegexp.test(line)) {
            const prevLine = out.at(-1);
            if (!prevLine || AllWhitespaceRegexp.test(prevLine)) {
              return; // Avoid adding consecutive blank lines.
            }
          }
          out.push(line);
        };
  function evaluateCondition(code) {
    if (!code?.trim()) {
      throw new Error("No JavaScript expression given at " + loc());
    }
    try {
      return vm.runInNewContext(code, defines, { displayErrors: false });
    } catch (e) {
      throw new Error(
        'Could not evaluate "' +
          code +
          '" at ' +
          loc() +
          "\n" +
          e.name +
          ": " +
          e.message
      );
    }
  }
  function include(file) {
    const realPath = fs.realpathSync(inFilename);
    const dir = path.dirname(realPath);
    try {
      let fullpath;
      if (file.indexOf("$ROOT/") === 0) {
        fullpath = path.join(
          __dirname,
          "../..",
          file.substring("$ROOT/".length)
        );
      } else {
        fullpath = path.join(dir, file);
      }
      preprocess(fullpath, writeLine, defines);
    } catch (e) {
      if (e.code === "ENOENT") {
        throw new Error('Failed to include "' + file + '" at ' + loc());
      }
      throw e; // Some other error
    }
  }
  function expand(line) {
    line = line.replaceAll(/__[\w]+__/g, function (variable) {
      variable = variable.substring(2, variable.length - 2);
      if (variable in defines) {
        return defines[variable];
      }
      return "";
    });
    writeLine(line);
  }

  // not inside if or else (process lines)
  const STATE_NONE = 0;
  // inside if, condition false (ignore until #else or #endif)
  const STATE_IF_FALSE = 1;
  // inside else, #if was false, so #else is true (process lines until #endif)
  const STATE_ELSE_TRUE = 2;
  // inside if, condition true (process lines until #else or #endif)
  const STATE_IF_TRUE = 3;
  // inside else or elif, #if/#elif was true, so following #else or #elif is
  // false (ignore lines until #endif)
  const STATE_ELSE_FALSE = 4;

  let line;
  let state = STATE_NONE;
  const stack = [];
  const control =
    /^(?:\/\/|\s*\/\*|<!--)\s*#(if|elif|else|endif|expand|include|error)\b(?:\s+(.*?)(?:\*\/|-->)?$)?/;

  while ((line = readLine()) !== null) {
    ++lineNumber;
    const m = control.exec(line);
    if (m) {
      switch (m[1]) {
        case "if":
          stack.push(state);
          state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          break;
        case "elif":
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = evaluateCondition(m[2]) ? STATE_IF_TRUE : STATE_IF_FALSE;
          } else if (state === STATE_ELSE_TRUE) {
            throw new Error("Found #elif after #else at " + loc());
          } else {
            throw new Error("Found #elif without matching #if at " + loc());
          }
          break;
        case "else":
          if (state === STATE_IF_TRUE || state === STATE_ELSE_FALSE) {
            state = STATE_ELSE_FALSE;
          } else if (state === STATE_IF_FALSE) {
            state = STATE_ELSE_TRUE;
          } else {
            throw new Error("Found #else without matching #if at " + loc());
          }
          break;
        case "endif":
          if (state === STATE_NONE) {
            throw new Error("Found #endif without #if at " + loc());
          }
          state = stack.pop();
          break;
        case "expand":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            expand(m[2]);
          }
          break;
        case "include":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            include(m[2]);
          }
          break;
        case "error":
          if (state !== STATE_IF_FALSE && state !== STATE_ELSE_FALSE) {
            throw new Error("Found #error " + m[2] + " at " + loc());
          }
          break;
      }
    } else if (state === STATE_NONE) {
      writeLine(line);
    } else if (
      (state === STATE_IF_TRUE || state === STATE_ELSE_TRUE) &&
      !stack.includes(STATE_IF_FALSE) &&
      !stack.includes(STATE_ELSE_FALSE)
    ) {
      writeLine(
        line
          .replaceAll(/^\/\/|^<!--/g, "  ")
          .replaceAll(/(^\s*)\/\*/g, "$1  ")
          .replaceAll(/\*\/$|-->$/g, "")
      );
    }
  }
  if (state !== STATE_NONE || stack.length !== 0) {
    throw new Error(
      "Missing #endif in preprocessor for " + fs.realpathSync(inFilename)
    );
  }
  if (typeof outFilename !== "function") {
    fs.writeFileSync(outFilename, out.join("\n"));
  }
}

export { preprocess };
