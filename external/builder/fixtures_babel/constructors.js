class A {
  constructor() {
    console.log("Hi!");
  }
}

class B {
  constructor(x = console.log("Hi!")) {}
}

class C {
  constructor({ x }) {}
}

class D {
  constructor(x, y, z) {}
}

class E extends A {
  constructor() {}
}

class F {
  constructor() {
    if (PDFJSDev.test('TRUE')) {
      var a = 0;
    }
  }
}

class G {
  constructor() {
    if (PDFJSDev.test('FALSE')) {
      var a = 0;
    }
  }
}
