var shell = require('./shell.js');
for (cmd in shell)
  global[cmd] = shell[cmd];
