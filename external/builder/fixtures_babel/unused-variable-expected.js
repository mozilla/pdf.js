function f() {
  var used = 1;
  var initWithSideEffect = console.log("Hi!");
  var assignedWithSideEffect;
  assignedWithSideEffect = console.log("Hi!");
  try {} finally {
    console.log("Hi!");
  }
  for (var key in {}) {}
  let unusedLet = 1;
  return used;
}
f();
var unusedTopLevel = 1;
