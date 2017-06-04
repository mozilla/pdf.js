'use strict';

var acorn = require('acorn');
var escodegen = require('escodegen');
var vm = require('vm');
var fs = require('fs');
var path = require('path');

var PDFJS_PREPROCESSOR_NAME = 'PDFJSDev';
var ROOT_PREFIX = '$ROOT/';

function isLiteral(obj, value) {
  return obj.type === 'Literal' && obj.value === value;
}

function isPDFJSPreprocessor(obj) {
  return obj.type === 'Identifier' &&
         obj.name === PDFJS_PREPROCESSOR_NAME;
}

function evalWithDefines(code, defines, loc) {
  if (!code || !code.trim()) {
    throw new Error('No JavaScript expression given');
  }
  return vm.runInNewContext(code, defines, { displayErrors: false, });
}

function handlePreprocessorAction(ctx, actionName, args, loc) {
  try {
    var arg;
    switch (actionName) {
      case 'test':
        arg = args[0];
        if (!arg || arg.type !== 'Literal' ||
            typeof arg.value !== 'string') {
          throw new Error('No code for testing is given');
        }
        var isTrue = !!evalWithDefines(arg.value, ctx.defines);
        return { type: 'Literal', value: isTrue, loc: loc, };
      case 'eval':
        arg = args[0];
        if (!arg || arg.type !== 'Literal' ||
            typeof arg.value !== 'string') {
          throw new Error('No code for eval is given');
        }
        var result = evalWithDefines(arg.value, ctx.defines);
        if (typeof result === 'boolean' || typeof result === 'string' ||
            typeof result === 'number') {
          return { type: 'Literal', value: result, loc: loc, };
        }
        if (typeof result === 'object') {
          var parsedObj = acorn.parse('(' + JSON.stringify(result) + ')');
          parsedObj.body[0].expression.loc = loc;
          return parsedObj.body[0].expression;
        }
        break;
      case 'json':
        arg = args[0];
        if (!arg || arg.type !== 'Literal' ||
            typeof arg.value !== 'string') {
          throw new Error('Path to JSON is not provided');
        }
        var jsonPath = arg.value;
        if (jsonPath.indexOf(ROOT_PREFIX) === 0) {
          jsonPath = path.join(ctx.rootPath,
                               jsonPath.substring(ROOT_PREFIX.length));
        }
        var jsonContent = fs.readFileSync(jsonPath).toString();
        var parsedJSON = acorn.parse('(' + jsonContent + ')');
        parsedJSON.body[0].expression.loc = loc;
        return parsedJSON.body[0].expression;
    }
    throw new Error('Unsupported action');
  } catch (e) {
    throw new Error('Could not process ' + PDFJS_PREPROCESSOR_NAME + '.' +
                    actionName + ' at ' + JSON.stringify(loc) + '\n' +
                    e.name + ': ' + e.message);
  }
}

function postprocessNode(ctx, node) {
  switch (node.type) {
    case 'ExportNamedDeclaration':
    case 'ImportDeclaration':
      if (node.source && node.source.type === 'Literal' &&
          ctx.map && ctx.map[node.source.value]) {
        var newValue = ctx.map[node.source.value];
        node.source.value = node.source.raw = newValue;
      }
      break;
    case 'IfStatement':
      if (isLiteral(node.test, true)) {
        // if (true) stmt1; => stmt1
        return node.consequent;
      } else if (isLiteral(node.test, false)) {
        // if (false) stmt1; else stmt2; => stmt2
        return node.alternate || { type: 'EmptyStatement', loc: node.loc, };
      }
      break;
    case 'ConditionalExpression':
      if (isLiteral(node.test, true)) {
        // true ? stmt1 : stmt2 => stmt1
        return node.consequent;
      } else if (isLiteral(node.test, false)) {
        // false ? stmt1 : stmt2 => stmt2
        return node.alternate;
      }
      break;
    case 'UnaryExpression':
      if (node.operator === 'typeof' &&
          isPDFJSPreprocessor(node.argument)) {
        // typeof PDFJSDev => 'object'
        return { type: 'Literal', value: 'object', loc: node.loc, };
      }
      if (node.operator === '!' &&
          node.argument.type === 'Literal' &&
          typeof node.argument.value === 'boolean') {
        // !true => false,  !false => true
        return { type: 'Literal', value: !node.argument.value, loc: node.loc, };
      }
      break;
    case 'LogicalExpression':
      switch (node.operator) {
        case '&&':
          if (isLiteral(node.left, true)) {
            return node.right;
          }
          if (isLiteral(node.left, false)) {
            return node.left;
          }
          break;
        case '||':
          if (isLiteral(node.left, true)) {
            return node.left;
          }
          if (isLiteral(node.left, false)) {
            return node.right;
          }
          break;
      }
      break;
    case 'BinaryExpression':
      switch (node.operator) {
        case '==':
        case '===':
        case '!=':
        case '!==':
          if (node.left.type === 'Literal' &&
              node.right.type === 'Literal' &&
              typeof node.left.value === typeof node.right.value) {
             // folding two literals == and != check
             switch (typeof node.left.value) {
               case 'string':
               case 'boolean':
               case 'number':
                 var equal = node.left.value === node.right.value;
                 return {
                   type: 'Literal',
                   value: (node.operator[0] === '=') === equal,
                   loc: node.loc,
                 };
             }
          }
          break;
      }
      break;
    case 'CallExpression':
      if (node.callee.type === 'MemberExpression' &&
          isPDFJSPreprocessor(node.callee.object) &&
          node.callee.property.type === 'Identifier') {
        // PDFJSDev.xxxx(arg1, arg2, ...) => tranform
        var action = node.callee.property.name;
        return handlePreprocessorAction(ctx, action,
                                        node.arguments, node.loc);
      }
      // require('string')
      if (node.callee.type === 'Identifier' && node.callee.name === 'require' &&
          node.arguments.length === 1 && node.arguments[0].type === 'Literal' &&
          ctx.map && ctx.map[node.arguments[0].value]) {
        var requireName = node.arguments[0];
        requireName.value = requireName.raw = ctx.map[requireName.value];
      }
      break;
    case 'BlockStatement':
      var subExpressionIndex = 0;
      while (subExpressionIndex < node.body.length) {
        switch (node.body[subExpressionIndex].type) {
          case 'EmptyStatement':
            // Removing empty statements from the blocks.
            node.body.splice(subExpressionIndex, 1);
            continue;
          case 'BlockStatement':
            // Block statements inside a block are moved to the parent one.
            var subChildren = node.body[subExpressionIndex].body;
            Array.prototype.splice.apply(node.body,
              [subExpressionIndex, 1].concat(subChildren));
            subExpressionIndex += Math.max(subChildren.length - 1, 0);
            continue;
          case 'ReturnStatement':
          case 'ThrowStatement':
            // Removing dead code after return or throw.
            node.body.splice(subExpressionIndex + 1,
                             node.body.length - subExpressionIndex - 1);
            break;
        }
        subExpressionIndex++;
      }
      break;
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      var block = node.body;
      if (block.body.length > 0 &&
          block.body[block.body.length - 1].type === 'ReturnStatement' &&
          !block.body[block.body.length - 1].argument) {
        // Function body ends with return without arg -- removing it.
        block.body.pop();
      }
      break;
  }
  return node;
}

function fixComments(ctx, node) {
  if (!ctx.saveComments) {
    return;
  }
  // Fixes double comments in the escodegen output.
  delete node.trailingComments;
  // Removes ESLint and other service comments.
  if (node.leadingComments) {
    var CopyrightRegExp = /\bcopyright\b/i;
    var BlockCommentRegExp = /^\s*(globals|eslint|falls through)\b/;
    var LineCommentRegExp = /^\s*eslint\b/;

    var i = 0;
    while (i < node.leadingComments.length) {
      var type = node.leadingComments[i].type;
      var value = node.leadingComments[i].value;

      if (ctx.saveComments === 'copyright') {
        // Remove all comments, except Copyright notices and License headers.
        if (!(type === 'Block' && CopyrightRegExp.test(value))) {
          node.leadingComments.splice(i, 1);
          continue;
        }
      } else if ((type === 'Block' && BlockCommentRegExp.test(value)) ||
                 (type === 'Line' && LineCommentRegExp.test(value))) {
        node.leadingComments.splice(i, 1);
        continue;
      }
      i++;
    }
  }
}

function traverseTree(ctx, node) {
  // generic node processing
  for (var i in node) {
    var child = node[i];
    if (typeof child === 'object' && child !== null && child.type) {
      var result = traverseTree(ctx, child);
      if (result !== child) {
        node[i] = result;
      }
    } else if (Array.isArray(child)) {
      child.forEach(function (childItem, index) {
        if (typeof childItem === 'object' && childItem !== null &&
            childItem.type) {
          var result = traverseTree(ctx, childItem);
          if (result !== childItem) {
            child[index] = result;
          }
        }
      });
    }
  }

  node = postprocessNode(ctx, node) || node;

  fixComments(ctx, node);
  return node;
}

function preprocessPDFJSCode(ctx, code) {
  var format = ctx.format || {
    indent: {
      style: ' ',
    },
  };
  var parseOptions = {
    locations: true,
    sourceFile: ctx.sourceFile,
    sourceType: 'module',
  };
  var codegenOptions = {
    format: format,
    parse: acorn.parse,
    sourceMap: ctx.sourceMap,
    sourceMapWithCode: ctx.sourceMap,
  };
  var syntax = acorn.parse(code, parseOptions);
  traverseTree(ctx, syntax);
  return escodegen.generate(syntax, codegenOptions);
}

exports.preprocessPDFJSCode = preprocessPDFJSCode;
