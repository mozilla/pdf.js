import { types as t, transformSync } from "@babel/core";
import vm from "vm";

const PDFJS_PREPROCESSOR_NAME = "PDFJSDev";

function isPDFJSPreprocessor(obj) {
  return obj.type === "Identifier" && obj.name === PDFJS_PREPROCESSOR_NAME;
}

function evalWithDefines(code, defines) {
  if (!code?.trim()) {
    throw new Error("No JavaScript expression given");
  }
  return vm.runInNewContext(code, defines, { displayErrors: false });
}

function handlePreprocessorAction(ctx, actionName, args, path) {
  try {
    const arg = args[0];
    switch (actionName) {
      case "test":
        if (!t.isStringLiteral(arg)) {
          throw new Error("No code for testing is given");
        }
        return !!evalWithDefines(arg.value, ctx.defines);
      case "eval":
        if (!t.isStringLiteral(arg)) {
          throw new Error("No code for eval is given");
        }
        const result = evalWithDefines(arg.value, ctx.defines);
        if (
          typeof result === "boolean" ||
          typeof result === "string" ||
          typeof result === "number" ||
          typeof result === "object"
        ) {
          return result;
        }
        break;
    }
    throw new Error("Unsupported action");
  } catch (e) {
    throw path.buildCodeFrameError(
      `Could not process ${PDFJS_PREPROCESSOR_NAME}.${actionName}: ${e.message}`
    );
  }
}

function babelPluginPDFJSPreprocessor(babel, ctx) {
  function removeUnusedFunctions(path) {
    let removed;
    do {
      removed = false;
      path.scope.crawl();
      for (const name in path.scope.bindings) {
        const binding = path.scope.bindings[name];
        if (!binding.referenced) {
          const { path: bindingPath } = binding;
          if (bindingPath.isFunctionDeclaration()) {
            bindingPath.remove();
            removed = true;
          }
        }
      }
      // If we removed some functions, there might be new unused ones
    } while (removed);
  }

  return {
    name: "babel-plugin-pdfjs-preprocessor",
    manipulateOptions({ parserOpts }) {
      parserOpts.attachComment = false;
    },
    visitor: {
      "ExportNamedDeclaration|ImportDeclaration": ({ node }) => {
        if (node.source && ctx.map?.[node.source.value]) {
          node.source.value = ctx.map[node.source.value];
        }
      },
      "IfStatement|ConditionalExpression": {
        exit(path) {
          const { node } = path;
          if (t.isBooleanLiteral(node.test)) {
            // if (true) stmt1; => stmt1
            // if (false) stmt1; else stmt2; => stmt2
            if (node.test.value === true) {
              path.replaceWith(node.consequent);
            } else if (node.alternate) {
              path.replaceWith(node.alternate);
            } else {
              path.remove(node);
            }
          }
        },
      },
      UnaryExpression: {
        exit(path) {
          const { node } = path;
          if (
            node.operator === "typeof" &&
            isPDFJSPreprocessor(node.argument)
          ) {
            // typeof PDFJSDev => 'object'
            path.replaceWith(t.stringLiteral("object"));
            return;
          }
          if (node.operator === "!" && t.isBooleanLiteral(node.argument)) {
            // !true => false,  !false => true
            path.replaceWith(t.booleanLiteral(!node.argument.value));
          }
        },
      },
      LogicalExpression: {
        exit(path) {
          const { node } = path;
          if (!t.isBooleanLiteral(node.left)) {
            return;
          }

          switch (node.operator) {
            case "&&":
              // true && expr => expr
              // false && expr => false
              path.replaceWith(
                node.left.value === true ? node.right : node.left
              );
              break;
            case "||":
              // true || expr => true
              // false || expr => expr
              path.replaceWith(
                node.left.value === true ? node.left : node.right
              );
              break;
          }
        },
      },
      BinaryExpression: {
        exit(path) {
          const { node } = path;
          switch (node.operator) {
            case "==":
            case "===":
            case "!=":
            case "!==":
              if (t.isLiteral(node.left) && t.isLiteral(node.right)) {
                // folding == and != check that can be statically evaluated
                const { confident, value } = path.evaluate();
                if (confident) {
                  path.replaceWith(t.booleanLiteral(value));
                }
              }
          }
        },
      },
      CallExpression(path) {
        const { node } = path;
        if (
          t.isMemberExpression(node.callee) &&
          isPDFJSPreprocessor(node.callee.object) &&
          t.isIdentifier(node.callee.property) &&
          !node.callee.computed
        ) {
          // PDFJSDev.xxxx(arg1, arg2, ...) => transform
          const action = node.callee.property.name;
          const result = handlePreprocessorAction(
            ctx,
            action,
            node.arguments,
            path
          );
          path.replaceWith(t.inherits(t.valueToNode(result), path.node));
        }

        if (t.isIdentifier(node.callee, { name: "__raw_import__" })) {
          if (node.arguments.length !== 1) {
            throw new Error("Invalid `__raw_import__` usage.");
          }
          // Replace it with a standard `import`-call and attempt to ensure that
          // various bundlers will leave it alone; this *must* include Webpack.
          const source = node.arguments[0];
          source.leadingComments = [
            {
              type: "CommentBlock",
              value: "webpackIgnore: true",
            },
            {
              type: "CommentBlock",
              value: "@vite-ignore",
            },
          ];
          path.replaceWith(t.importExpression(source));
        }
      },
      "BlockStatement|StaticBlock": {
        // Visit node in post-order so that recursive flattening
        // of blocks works correctly.
        exit(path) {
          const { node } = path;

          let subExpressionIndex = 0;
          while (subExpressionIndex < node.body.length) {
            switch (node.body[subExpressionIndex].type) {
              case "EmptyStatement":
                // Removing empty statements from the blocks.
                node.body.splice(subExpressionIndex, 1);
                continue;
              case "BlockStatement":
                // Block statements inside a block are flattened
                // into the parent one.
                const subChildren = node.body[subExpressionIndex].body;
                node.body.splice(subExpressionIndex, 1, ...subChildren);
                subExpressionIndex += Math.max(subChildren.length - 1, 0);
                continue;
              case "ReturnStatement":
              case "ThrowStatement":
                // Removing dead code after return or throw.
                node.body.splice(
                  subExpressionIndex + 1,
                  node.body.length - subExpressionIndex - 1
                );
                break;
            }
            subExpressionIndex++;
          }

          if (node.type === "StaticBlock" && node.body.length === 0) {
            path.remove();
          }
        },
      },
      Function: {
        exit(path) {
          if (!t.isBlockStatement(path.node.body)) {
            // Arrow function with expression body
            return;
          }

          const { body } = path.node.body;
          if (
            body.length > 0 &&
            t.isReturnStatement(body.at(-1), { argument: null })
          ) {
            // Function body ends with return without arg -- removing it.
            body.pop();
          }

          removeUnusedFunctions(path);
        },
      },
      ClassMethod: {
        exit(path) {
          const {
            node,
            parentPath: { parent: classNode },
          } = path;
          if (
            // Remove empty constructors. We only do this for
            // base classes, as the default constructor of derived
            // classes is not empty (and an empty constructor
            // must throw at runtime when constructed).
            node.kind === "constructor" &&
            node.body.body.length === 0 &&
            node.params.every(p => p.type === "Identifier") &&
            !classNode.superClass
          ) {
            path.remove();
          }
        },
      },
      Program: {
        exit(path) {
          if (path.node.sourceType === "module") {
            removeUnusedFunctions(path);
          }
        },
      },
      MemberExpression(path) {
        // The Emscripten Compiler (emcc) generates code that allows the caller
        // to provide the Wasm module (thorugh Module.instantiateWasm), with
        // a fallback in case .instantiateWasm is not provided.
        // We always define instantiateWasm, so we can hard-code the check
        // and let our dead code elimination logic remove the unused fallback.
        if (
          path.parentPath.isIfStatement({ test: path.node }) &&
          path.matchesPattern("Module.instantiateWasm")
        ) {
          path.replaceWith(t.booleanLiteral(true));
        }
      },
    },
  };
}

function preprocessPDFJSCode(ctx, content) {
  return transformSync(content, {
    configFile: false,
    plugins: [[babelPluginPDFJSPreprocessor, ctx]],
  }).code;
}

export { babelPluginPDFJSPreprocessor, preprocessPDFJSCode };
