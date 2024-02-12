if ('test') {
  "1";
}
if (true) {
  "1";
}
if (true) {
  "1";
} else {
  "2";
}
if (false) {
  "1";
}
if (false) {
  "1";
} else {
  "2";
}
if (true && false) {
  "1";
}
if (true && false || '1') {
  "1";
}

function f1() {
  if (true) {
    "1";
  }
  if (false) {
    "2";
  }
}
