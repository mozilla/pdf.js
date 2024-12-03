class A {
  constructor() {
    console.log("Hi!");
  }
}
class B {
  constructor(x = console.log("Hi!")) {}
}
class C {
  constructor({
    x
  }) {}
}
class D {}
class E extends A {
  constructor() {}
}
class F {
  constructor() {
    var a = 0;
  }
}
class G {}
