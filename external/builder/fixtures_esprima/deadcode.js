function f1() {
  return;
  var i = 0;
}

function f2() {
  return 1;
  var i = 0;
}

function f3() {
  var i = 0;
  throw "test";
  var j = 0;
}

function f4() {
  var i = 0;
  if (true) {
    return;
  }
  throw "test";
  var j = 0;
}

