function f1() {}
f1();
function f2() {
  return 1;
}
f2();
function f3() {
  var i = 0;
  throw "test";
}
f3();
function f4() {
  var i = 0;
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
