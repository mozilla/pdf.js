class A {
  static {}
  static {
    { foo() }
  }
  static {
    {;}
  }
  static {
    if (PDFJSDev.test('TRUE')) {
      var a = 0;
    }
  }

  static {
    if (PDFJSDev.test('FALSE')) {
      var a = 1;
    }
  }
}
