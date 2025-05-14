/* globals f0 */
function f1() {
  /* head */
  "1";
  /* mid */
  "2";
  /* tail */
}
f1();

function f2() {
  // head
  "1";
  // mid
  "2";
  // tail
}
f2();

function f3() {
  if ("1") { // begin block
    "1";
  }
  "2"; // trailing
  if (/* s */"3"/*e*/) {
    "4";
  }
}
f3();
