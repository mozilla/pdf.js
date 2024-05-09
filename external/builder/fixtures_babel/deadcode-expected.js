function f1() {}
function f2() {
  return 1;
}
function f3() {
  var i = 0;
  throw "test";
}
function f4() {
  var i = 0;
}
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
