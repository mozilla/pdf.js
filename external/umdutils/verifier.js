/* Copyright 2015 Mozilla Foundation
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

'use strict';

/* Utilities for parsing PDF.js UMD file format. A UMD header of the file
 * shall conform the following rules:
 *   1. Names of AMD modules and JavaScript object placed to the global object
 *      shall be alike: symbols'/' and '_' removed, and character case is
 *      ignored.
 *   2. CommonJS require shall use relative path to the required module, e.g.
 *      './display.js' or '../shared/util.js', and they shall construct the
 *      similar name to AMD one.
 *   3. Factory function shall contain names for modules, not less than listed
 *      in AMD, CommonJS or global object properties list, and also their
 *      names must be alike to name of the root object properties.
 *
 * Example:
 *
 * (function (root, factory) {
 *   if (typeof define === 'function' && define.amd) {
 *     define('pdfjs/display/pattern_helper', ['exports', 'pdfjs/shared/util',
 *       'pdfjs/display/webgl'], factory);
 *   } else if (typeof exports !== 'undefined') {
 *     factory(exports, require('../shared/util.js'), require('./webgl.js'));
 *   } else {
 *     factory((root.pdfjsDisplayPatternHelper = {}), root.pdfjsSharedUtil,
 *       root.pdfjsDisplayWebGL);
 *   }
 * }(this, function (exports, sharedUtil, displayWebGL) {
 *
 */

var fs = require('fs');
var path = require('path');

/**
 * Parses PDF.js UMD header.
 * @param {string} filePath PDF.js JavaScript file path.
 * @returns {{amdId: *, amdImports: Array, cjsRequires: Array, jsRootName: *,
 *   jsImports: Array, imports: Array, importedNames: Array,
 *   exportedNames: Array, body: *}}
 */
function parseUmd(filePath) {
  var jscode = fs.readFileSync(filePath).toString();
  if (/\/\*\s*umdutils\s+ignore\s*\*\//.test(jscode)) {
    throw new Error('UMD processing ignored');
  }
  // Extracts header and body.
  var umdStart = '\\(function\\s\\(root,\\sfactory\\)\\s\\{';
  var umdImports = '\\}\\(this,\\sfunction\\s\\(exports\\b';
  var umdBody = '\\)\\s\\{';
  var umdEnd = '\\}\\)\\);\\s*(//#endif\\s*)?$';
  var m, re;
  m = new RegExp(umdStart + '([\\s\\S]*?)' + umdImports + '([\\s\\S]*?)' +
    umdBody + '([\\s\\S]*?)' + umdEnd).exec(jscode);
  if (!m) {
    throw new Error('UMD was not found');
  }
  var header = m[1];
  var imports = m[2].replace(/\s+/g, '').split(',');
  imports.shift(); // avoiding only-export case
  var body = m[3];

  // Extracts AMD definitions.
  var amdMatch = /\bdefine\('([^']*)',\s\[([^\]]*)\],\s+factory\);/.
    exec(header);
  if (!amdMatch) {
    throw new Error('AMD call was not found');
  }
  var amdId = amdMatch[1];
  var amdImports = amdMatch[2].replace(/[\s']+/g, '').split(',');
  if (amdImports[0] !== 'exports') {
    throw new Error('exports expected first at AMD call');
  }
  amdImports.shift();

  // Extracts CommonJS definitions.
  var cjsMatch = /\bfactory\(exports((?:,\s+require\([^\)]+\))*)\);/.
    exec(header);
  if (!cjsMatch) {
    throw new Error('CommonJS call was not found');
  }
  var cjsRequires = cjsMatch[1].replace(/\s+/g, ' ').trim().
    replace(/\s*require\('([^']*)'\)/g, '$1').split(',');
  cjsRequires.shift();
  var jsMatch = /\bfactory\(\(root\.(\S+)\s=\s\{\}\)((?:,\s+root\.\S+)*)\);/.
    exec(header);
  if (!jsMatch) {
    throw new Error('Regular JS call was not found');
  }

  // Extracts global object properties definitions.
  var jsRootName = jsMatch[1];
  var jsImports = jsMatch[2].replace(/\s+/g, '').split(',');
  jsImports.shift();

  // Scans for imports usages in the body.
  var importedNames = [];
  if (imports.length > 0) {
    re = new RegExp('\\b(' + imports.join('|') + ')\\.(\\w+)', 'g');
    while ((m = re.exec(body))) {
      importedNames.push(m[0]);
    }
  }
  importedNames.sort();
  for (var i = importedNames.length - 1; i > 0; i--) {
    if (importedNames[i - 1] === importedNames[i]) {
      importedNames.splice(i, 1);
    }
  }
  // Scans for exports definitions in the body.
  var exportedNames = [];
  re = /\bexports.(\w+)\s*=\s/g;
  while ((m = re.exec(body))) {
    exportedNames.push(m[1]);
  }

  return {
    amdId: amdId,
    amdImports: amdImports,
    cjsRequires: cjsRequires,
    jsRootName: jsRootName,
    jsImports: jsImports,
    imports: imports,
    importedNames: importedNames,
    exportedNames: exportedNames,
    body: body
  };
}

/**
 * Reads and parses all JavaScript root files dependencies and calculates
 * evaluation/load order.
 * @param {Array} rootPaths Array of the paths for JavaScript files.
 * @returns {{modules: null, loadOrder: Array}}
 */
function readDependencies(rootPaths) {
  // Reading of dependencies.
  var modules = Object.create(null);
  var processed = Object.create(null);
  var queue = [];
  rootPaths.forEach(function (i) {
    if (processed[i]) {
      return;
    }
    queue.push(i);
    processed[i] = true;
  });
  while (queue.length > 0) {
    var p = queue.shift();
    var umd;
    try {
      umd = parseUmd(p);
    } catch (_) {
      // Ignoring bad UMD modules.
      continue;
    }
    modules[umd.amdId] = {
      dependencies: umd.amdImports
    };
    umd.cjsRequires.forEach(function (r) {
      if (r[0] !== '.' || !/\.js$/.test(r)) {
        return; // not pdfjs module
      }
      var dependencyPath = path.join(path.dirname(p), r);
      if (processed[dependencyPath]) {
        return;
      }
      queue.push(dependencyPath);
      processed[dependencyPath] = true;
    });
  }

  // Topological sorting, somewhat Kahn's algorithm but sorts found nodes at
  // each iteration.
  processed = Object.create(null);
  var left = [], result = [];
  for (var i in modules) {
    var hasDependencies = modules[i].dependencies.length > 0;
    if (hasDependencies) {
      left.push(i);
    } else {
      processed[i] = true;
      result.push(i);
    }
  }
  result.sort();
  while (left.length > 0) {
    var discovered = [];
    left.forEach(function (i) {
      // Finding if we did not process all dependencies for current module yet.
      var hasDependecies = modules[i].dependencies.some(function (j) {
        return !processed[j] && !!modules[j];
      });
      if (!hasDependecies) {
        discovered.push(i);
      }
    });
    if (discovered.length === 0) {
      throw new Error('Some circular references exist: somewhere at ' +
        left.join(','));
    }
    discovered.sort();
    discovered.forEach(function (i) {
      result.push(i);
      left.splice(left.indexOf(i), 1);
      processed[i] = true;
    });
  }

  return {modules: modules, loadOrder: result};
}

/**
 * Validates individual file. See rules above.
 */
function validateFile(path, name, context) {
  function info(msg) {
    context.infoCallback(path + ': ' + msg);
  }
  function warn(msg) {
    context.warnCallback(path + ': ' + msg);
  }
  function error(msg) {
    context.errorCallback(path + ': ' + msg);
  }

  try {
    var umd = parseUmd(path);
    info('found ' + umd.amdId);

    if (name !== umd.amdId) {
      error('AMD name does not match module name');
    }
    if (name.replace(/[_\-\/]/g, '').toLowerCase() !==
        umd.jsRootName.toLowerCase()) {
      error('root name does not look like module name');
    }

    if (umd.amdImports.length > umd.imports.length) {
      error('AMD imports has more entries than body imports');
    }
    if (umd.cjsRequires.length > umd.imports.length) {
      error('CommonJS imports has more entries than body imports');
    }
    if (umd.jsImports.length > umd.imports.length) {
      error('JS imports has more entries than body imports');
    }
    var optionalArgs = umd.imports.length - Math.min(umd.amdImports.length,
        umd.cjsRequires.length, umd.jsImports.length);
    if (optionalArgs > 0) {
      warn('' + optionalArgs + ' optional args found: ' +
        umd.imports.slice(-optionalArgs));
    }
    umd.jsImports.forEach(function (i, index) {
      if (i.indexOf('root.') !== 0) {
        if (index >= umd.jsImports.length - optionalArgs) {
          warn('Non-optional non-root based JS import: ' + i);
        }
        return;
      }
      i = i.substring('root.'.length);
      var j = umd.imports[index].replace(/(_|Lib)$/, '');
      var offset = i.toLowerCase().lastIndexOf(j.toLowerCase());
      if (offset + j.length !== i.length) {
        error('JS import name does not look like corresponding body import ' +
          'name: ' + i + ' vs ' + j);
      }

      j = umd.amdImports[index];
      if (j) {
        if (j.replace(/[_\-\/]/g, '').toLowerCase() !== i.toLowerCase()) {
          error('JS import name does not look like corresponding AMD import ' +
            'name: ' + i + ' vs ' + j);
        }
      }
    });
    umd.cjsRequires.forEach(function (i, index) {
      var j = umd.amdImports[index];
      if (!j) {
        return; // optional
      }
      var noExtension = i.replace(/\.js$/, '');
      if (noExtension === i || i[0] !== '.') {
        error('CommonJS shall have relative path and extension: ' + i);
        return;
      }
      var base = name.split('/');
      base.pop();
      var parts = noExtension.split('/');
      if (parts[0] === '.') {
        parts.shift();
      }
      while (parts[0] === '..') {
        if (base.length === 0) {
          error('Invalid relative CommonJS path');
        }
        parts.shift();
        base.pop();
      }
      if (base.length === 0) {
        // Reached the project root -- finding prefix matching subpath.
        for (var prefix in context.paths) {
          if (!context.paths.hasOwnProperty(prefix)) {
            continue;
          }
          var prefixPath = context.paths[prefix];
          if (!('./' + parts.join('/') + '/').startsWith(prefixPath + '/')) {
            continue;
          }
          parts.splice(0, prefixPath.split('/').length - 1);
          base.push(prefix);
          break;
        }
        if (base.length === 0) {
          error('Invalid relative CommonJS path prefix');
        }
      }
      if (j !== base.concat(parts).join('/')) {
        error('CommonJS path does not point to right AMD module: ' +
          i + ' vs ' + j);
      }
    });

    umd.imports.forEach(function (i) {
      var prefix = i + '.';
      if (umd.importedNames.every(function (j) {
          return j.indexOf(prefix) !== 0;
        })) {
        warn('import is not used to import names: ' + i);
      }
    });

    // Recording the module exports and imports for further validation.
    // See validateImports and validateDependencies below.
    context.exports[name] = Object.create(null);
    umd.exportedNames.forEach(function (i) {
      context.exports[name][i] = true;
    });
    context.dependencies[name] = umd.amdImports;
    umd.importedNames.forEach(function (i) {
      var parts = i.split('.');
      var index = umd.imports.indexOf(parts[0]);
      if (index < 0 || !umd.amdImports[index]) {
        return; // some optional arg and not in AMD list?
      }
      var refModuleName = umd.amdImports[index];
      var fromModule = context.imports[refModuleName];
      if (!fromModule) {
        context.imports[refModuleName] = (fromModule = Object.create(null));
      }
      var symbolRefs = fromModule[parts[1]];
      if (!symbolRefs) {
        fromModule[parts[1]] = (symbolRefs = []);
      }
      symbolRefs.push(name);
    });
  } catch (e) {
    warn(e.message);
  }
}

function findFilesInDirectory(dirPath, name, foundFiles) {
  fs.readdirSync(dirPath).forEach(function (file) {
    var filePath = dirPath + '/' + file;
    var stats = fs.statSync(filePath);
    if (stats.isFile() && /\.js$/i.test(file)) {
      var fileName = file.substring(0, file.lastIndexOf('.'));
      foundFiles.push({path: filePath, name: name + '/' + fileName});
    } else if (stats.isDirectory() && /^\w+$/.test(file)) {
      findFilesInDirectory(filePath, name + '/' + file, foundFiles);
    }
  });
}

function validateImports(context) {
  // Checks if some non-exported symbol was imported.
  for (var i in context.imports) {
    var exportedSymbols = context.exports[i];
    if (!exportedSymbols) {
      context.warnCallback('Exported symbols don\'t exist for: ' + i);
      continue;
    }
    var importedSymbols = context.imports[i];
    for (var j in importedSymbols) {
      if (!(j in exportedSymbols)) {
        context.errorCallback('The non-exported symbol is referred: ' + j +
          ' from ' + i + ' used in ' + importedSymbols[j]);
      }
    }
  }
}

function validateDependencies(context) {
  // Checks for circular dependency (non-efficient algorithm but does the work).
  var nonRoots = Object.create(null);
  var i, j, item;
  for (i in context.dependencies) {
    var checked = Object.create(null);
    var queue = [[i]];
    while (queue.length > 0) {
      item = queue.shift();
      j = item[0];

      var dependencies = context.dependencies[j];
      dependencies.forEach(function (q) {
        if (!(q in context.dependencies)) {
          context.warnCallback('Unknown dependency: ' + q);
          return;
        }

        var index = item.indexOf(q);
        if (index >= 0) {
          context.errorCallback('Circular dependency was found: ' +
            item.slice(0, index + 1).join('<-'));
          return;
        }
        if (q in checked) {
          return;
        }
        queue.push([q].concat(item));
        checked[q] = i;
        nonRoots[q] = true;
      });
    }
  }

  // Some root modules info.
  for (i in context.dependencies) {
    if (!(i in nonRoots)) {
      context.infoCallback('Root module: ' + i);
    }
  }
}

/**
 * Validates all modules/files in the specified path. The modules must be
 * defined using PDF.js UMD format. Results printed to console.
 * @param {Object} paths The map of the module path prefixes to file/directory
 *   location.
 * @param {Object} options (optional) options for validation.
 * @returns {boolean} true if no error was found.
 */
function validateFiles(paths, options) {
  options = options || {};
  var verbosity = options.verbosity === undefined ? 0 : options.verbosity;
  var wasErrorFound = false;
  var errorCallback = function (msg) {
    if (verbosity >= 0) {
      console.error('ERROR:' + msg);
    }
    wasErrorFound = true;
  };
  var warnCallback = function (msg) {
    if (verbosity >= 1) {
      console.warn('WARNING: ' + msg);
    }
  };
  var infoCallback = function (msg) {
    if (verbosity >= 5) {
      console.info('INFO: ' + msg);
    }
  };

  // Finds all files.
  var foundFiles = [];
  for (var name in paths) {
    if (!paths.hasOwnProperty(name)) {
      continue;
    }
    var path = paths[name];
    var stats = fs.statSync(path);
    if (stats.isFile()) {
      foundFiles.push({path: path, name: name});
    } else if (stats.isDirectory()) {
      findFilesInDirectory(path, name, foundFiles);
    }
  }

  var context = {
    exports: Object.create(null),
    imports: Object.create(null),
    dependencies: Object.create(null),
    paths: paths,
    errorCallback: errorCallback,
    warnCallback: warnCallback,
    infoCallback: infoCallback
  };

  foundFiles.forEach(function (pair) {
    validateFile(pair.path, pair.name, context);
  });

  validateImports(context);
  validateDependencies(context);

  return !wasErrorFound;
}

exports.parseUmd = parseUmd;
exports.readDependencies = readDependencies;
exports.validateFiles = validateFiles;
