const fs = require("fs");
const mkdirp = require("mkdirp");

const defaults = {
  file: 0o600,
  directory: 0o700,
};

function apply(args, mode) {
  switch (typeof args[0]) {
    case "undefined":
      // Explicit undefined mode argument
      args[0] = { mode };
      break;
    case "function":
      // Elided mode argument
      args.unshift({ mode });
      break;
    case "object":
      if (args[0] === null) {
        // Explicit null mode argument
        args[0] = { mode };
      } else if (args[0].mode === undefined) {
        // Lacking or explicit undefined mode property
        args[0].mode = mode;
      }
      break;
  }
}

function applyOpen(args, mode) {
  if (typeof args[0] === "function") {
    // Elided flags and mode
    args.unshift("r", mode);
  } else if (typeof args[1] === "function") {
    // Elided mode only
    args.splice(1, 1, mode);
  } else if (args[1] === undefined) {
    // Explicit undefined mode
    args[1] = mode;
  }
}

function appendFile(path, data, ...args) {
  apply(args, defaults.file);
  return fs.appendFile(path, data, ...args);
}

function appendFileSync(path, data, ...args) {
  apply(args, defaults.file);
  return fs.appendFileSync(path, data, ...args);
}

function createReadStream(path, ...args) {
  apply(args, defaults.file);
  return fs.createReadStream(path, ...args);
}

function createWriteStream(path, ...args) {
  apply(args, defaults.file);
  return fs.createWriteStream(path, ...args);
}

function mkdir(path, ...args) {
  apply(args, defaults.directory);
  return fs.mkdir(path, ...args);
}

function mkdirSync(path, ...args) {
  apply(args, defaults.directory);
  return fs.mkdirSync(path, ...args);
}

function open(path, ...args) {
  applyOpen(args, defaults.file);
  return fs.open(path, ...args);
}

function openSync(path, ...args) {
  applyOpen(args, defaults.file);
  return fs.openSync(path, ...args);
}

function writeFile(file, data, ...args) {
  apply(args, defaults.file);
  return fs.writeFile(file, data, ...args);
}

function writeFileSync(file, data, ...args) {
  apply(args, defaults.file);
  return fs.writeFileSync(file, data, ...args);
}

const promises = Object.assign({}, fs.promises, {
  appendFile(path, data, ...args) {
    apply(args, defaults.file);
    return fs.promises.appendFile(path, data, ...args);
  },

  mkdir(path, ...args) {
    apply(args, defaults.directory);
    return fs.promises.mkdir(path, ...args);
  },

  open(path, ...args) {
    applyOpen(args, defaults.file);
    return fs.promises.open(path, ...args);
  },

  writeFile(file, data, ...args) {
    apply(args, defaults.file);
    return fs.promises.writeFile(file, ...args);
  },
});

function mkdirpSecure(path, ...args) {
  apply(args, defaults.directory);
  return mkdirp(path, ...args);
}

mkdirpSecure.sync = function (path, ...args) {
  apply(args, defaults.directory);
  return mkdirp.sync(path, ...args);
};

Object.assign(exports, fs, {
  appendFile,
  appendFileSync,
  createReadStream,
  createWriteStream,
  mkdir,
  mkdirSync,
  open,
  openSync,
  writeFile,
  writeFileSync,
  promises,
  mkdirp: mkdirpSecure,
});
