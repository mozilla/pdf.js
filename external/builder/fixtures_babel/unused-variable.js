let a = 1;
let b = a, c = 4;
let d = null && sideEffect();
let e = null || sideEffect();
let f = 5;
let g = 6;

use(c);

if (PDFJSDev.test('TRUE')) {
  use(f);
} else {
  use(g);
}
