function f() {
  var unusedLiteral = 1;
  var scriptName = import.meta.url;
  var scriptDirectory = "";
  try {
    scriptDirectory = new URL(".", scriptName).href;
  } catch {}
  var used = 1;
  var initWithSideEffect = console.log("Hi!");
  var assignedWithSideEffect;
  assignedWithSideEffect = console.log("Hi!");
  var assignedInTryWithFinally;
  try {
    assignedInTryWithFinally = 2;
  } finally {
    console.log("Hi!");
  }
  for (var key in {}) {}
  let unusedLet = 1;
  return used;
}
f();
var unusedTopLevel = 1;
