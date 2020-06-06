const fs = require('fs');

const lineReader = require('readline').createInterface({
  input: fs.createReadStream('../../mozillas-pdf.js/build/generic/build/pdf.worker.js')
});

console.log("\n");

let result = '';
let expectedChanges = 12;

const successfulChanges = {};
for (let i = 1; i <= expectedChanges; i++) {
  successfulChanges[i] = 'not found';
}
// successfulChanges[6]="only till pdf.js 2.3";

let dropLines = 0;
currentFunction = '';
let printKeyDownListener = false;
let unregisterPrintOverlayDone = false;
let es2015 = false;
let lines = [];
lineReader
  .on('line', function(line) {
    lines.push(line);
    if (line.includes('function ') || line.startsWith('class ')) {
      if (line.startsWith('class ')) {
        if (!es2015) {
          console.log('ES 2015 version');
          // expectedChanges -= 4;
        }
        es2015 = true;
      }
    }
  })
  .on('close', function() {
    convertLines();
    const filename = es2015 ? 'pdf.worker.js' : 'pdf.worker-es5.js';
    fs.writeFile('../projects/ngx-extended-pdf-viewer/src/assets-2.6/' + filename, result, function(err) {
      if (err) {
        return console.log(err);
      }

      console.log('The file was saved to ../projects/ngx-extended-pdf-viewer/src/assets-2.6/' + filename);
      if (expectedChanges !== 0) {
        console.error(expectedChanges + " changes couldn't be applied!");
        for (const [key, value] of Object.entries(successfulChanges)) {
          if (value !== true) {
            console.log(key + " " + value);
          }
        }
      }
    });
  });

function convertLines() {
  lines.forEach(line => {
    if (dropLines > 0) {
      dropLines--;
      //      console.log('Dropping ' + line);
    } else {
      if (line.includes('function ') || line.startsWith('class ')) {
        currentFunction = line;
      }
      if (line.includes('return workerHandlerName;')) {
        const before = `    // #171 receive options from ngx-extended-pdf-viewer
    handler.on('showUnverifiedSignatures', function wphReady(data) {
      if (data) {
        console.log("showUnverifiedSignatures=" + data + ". This is an incompletely implemented feature. Signatures cannot be validated, so use it at own risk.");
      }
      self.showUnverifiedSignatures = data;
    });
    // #171 end of receive options from ngx-extended-pdf-viewer
`;
        line = before + line;
        expectedChanges--;
        successfulChanges[1] = true;
      } else if (line.includes('.setFlags(_util.AnnotationFlag.HIDDEN)')) {
        const before = `      // #171 modification start
      if (!self.showUnverifiedSignatures) {
  `;
        line =
          before +
          line +
          `
        console.log("The PDF file contains a signature. Please take into account that it can't be verified yet.");
      }
    // #171 modification end`;
        expectedChanges--;
        successfulChanges[2] = true;
      } else if (line.includes("TT: ")) {
        line = line.replace("TT: ", "'The font embedded in the PDF file contains errors: TT: ");
        expectedChanges--;
        successfulChanges[3] = true; // Hint: this is called ten times!
      }
      if (line != null) {
        result += line + '\n';
      }
    }
  });
}
