const fs = require("fs");

const lineReader = require("readline").createInterface({
  input: fs.createReadStream(
    "../../mozillas-pdf.js/build/generic/web/viewer.js"
  ),
});

console.log("\n");

let result = "";
let expectedChanges = 84;

const successfulChanges = {};
for (let i = 1; i <= expectedChanges; i++) {
  successfulChanges[i] = "not found";
}
successfulChanges[16] = "ES5 only";
successfulChanges[17] = "ES5 only";
successfulChanges[43] = true; // this changes is counted twice (ES5 and ES2015)
successfulChanges[45] = true; // this changes is counted twice (ES5 and ES2015)
successfulChanges[61] = true; // this changes is counted twice (ES5 and ES2015)

let dropLines = 0;
let unregisterPrintOverlayDone = false;
let es2015 = false;
const lines = [];
lineReader
  .on("line", function (line) {
    lines.push(line);
    if (line.includes("function ") || line.startsWith("class ")) {
      if (line.startsWith("class ")) {
        if (!es2015) {
          console.log("ES 2015 version");
          expectedChanges -= 1;
        }
        es2015 = true;
      }
    }
  })
  .on("close", function () {
    // addPolyfills();
    convertLines();
    const filename = es2015 ? "viewer.js" : "viewer-es5.js";
    fs.writeFileSync(
      "../projects/ngx-extended-pdf-viewer/src/assets-2.6/" + filename,
      result
    );

    console.log(
      "The file was saved to ../projects/ngx-extended-pdf-viewer/src/assets-2.6/" +
        filename
    );
    if (expectedChanges !== 0) {
      console.error(expectedChanges + " changes couldn't be applied!");
      for (const [key, value] of Object.entries(successfulChanges)) {
        if (value !== true) {
          console.log("V" + key + " " + value);
        }
      }
    }
  });

function addPolyfills() {
  if (!es2015) {
    result += `if (!HTMLCollection.prototype[Symbol.iterator]) {
  HTMLCollection.prototype[Symbol.iterator] = Array.prototype[Symbol.iterator];
}
    `;
    result += "(function () {\n";
    result += "\n";
    result +=
      "  if ( typeof window.CustomEvent === 'function' ) return false;\n";
    result += "\n";
    result += "  function CustomEvent ( event, params ) {\n";
    result +=
      "    params = params || { bubbles: false, cancelable: false, detail: null };\n";
    result += "    var evt = document.createEvent( 'CustomEvent' );\n";
    result +=
      "    evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );\n";
    result += "    return evt;\n";
    result += "   }\n";
    result += "\n";
    result += "  window.CustomEvent = CustomEvent;\n";
    result += "})();\n";
  }
}

function convertLines() {
  let indentAfter = 0;
  let currentMethod = "";
  let currentClass = "";
  let currentFunction = "";
  lines.forEach(line => {
    indentAfter += line.split("{").length - 1;
    indentAfter -= line.split("}").length - 1;
    if (dropLines > 0) {
      dropLines--;
      //      console.log('Dropping ' + line);
    } else {
      const line2 = line.replace(/"/g, "'").trim(); // since pdf.js 2.4, the ES2015 uses double quotes
      if (line2.includes("function ") || line.startsWith("class ")) {
        if (!line.includes("function (")) {
          currentFunction = line;
          currentMethod = "";
        }
      }
      if (line2.startsWith("_classCallCheck(") || line2.startsWith("class ")) {
        currentClass = line2;
      }
      if (
        line2.startsWith("_updateUIState(") ||
        line2.startsWith("value: function _updateUIState() {")
      ) {
        currentMethod = "_updateUIState";
      }
      if (line2.includes("_calculateMatch(pageIndex) {")) {
        currentFunction = "_calculateMatch";
      }
      if (line2.includes("../build/pdf.js")) {
        // nothing

      if (line !== null) {
        line = line.replace(" print(", " printPDF(");
        line = line.replace(".print(", ".printPDF(");
        line = line.replace("window.print ", "window.printPDF ");
        result += line + "\n";
      }
    }
  });
}
