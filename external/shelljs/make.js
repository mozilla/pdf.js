require('./global');

global.target = {};

// This ensures we only execute the script targets after the entire script has
// been evaluated
var args = process.argv.slice(2);
setTimeout(function() {

  if (args.length === 1 && args[0] === '--help') {
    console.log('Available targets:');
    for (t in target)
      console.log('  ' + t);
    return;
  }

  // Wrap targets to prevent duplicate execution
  for (t in target) {
    (function(t, oldTarget){

      // Wrap it
      target[t] = function(force) {
        if (oldTarget.done && !force)
          return;
        oldTarget.done = true;
        return oldTarget.apply(oldTarget, arguments);
      }

    })(t, target[t]);
  }

  // Execute desired targets
  if (args.length > 0) {
    args.forEach(function(arg) {
      if (arg in target) 
        target[arg]();
      else {
        console.log('no such target: ' + arg);
        exit(1);
      }
    });
  } else if ('all' in target) {
    target.all();
  }

}, 0);
