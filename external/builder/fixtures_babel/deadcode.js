function f1() {
  return;
  after();
}
f1();

function f2() {
  return 1;
  after();
}
f2();

function f3() {
  before();
  throw "test";
  after();
}
f3();

function f4() {
  before();
  if (true) {
    return;
  }
  throw "test";
  after();
}
f4();

var obj = {
  method1() { return; after(); },
  method2() { return; },
};

class C {
  method1() { return; after(); }
  method2() { return; }
}

var arrow1 = () => { return; after(); };
var arrow2 = () => { return; };

use(obj, C, arrow1, arrow2);
