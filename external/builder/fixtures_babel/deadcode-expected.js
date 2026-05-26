function f1() {}
f1();
function f2() {
  return 1;
}
f2();
function f3() {
  before();
  throw "test";
}
f3();
function f4() {
  before();
}
f4();
var obj = {
  method1() {},
  method2() {}
};
class C {
  method1() {}
  method2() {}
}
var arrow1 = () => {};
var arrow2 = () => {};
use(obj, C, arrow1, arrow2);
