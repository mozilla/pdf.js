const fs = require('fs');

const lineReader = require('readline').createInterface({
  input: fs.createReadStream('../../mozillas-pdf.js/build/generic/build/pdf.js')
});

console.log("\n");

let result = '';

let expectedChanges = 9;

const successfulChanges = {};
for (let i = 1; i <= expectedChanges+1; i++) {
  successfulChanges[i]="not found";
}
successfulChanges[1]="ES2015 only";
successfulChanges[2]="ES5 only";
successfulChanges[6]="only till pdf.js 2.3";
successfulChanges[7]="only till pdf.js 2.3";

let dropLines = 0;
let es2015 = false;
lineReader
  .on('line', function (line) {
    if (dropLines > 0) {
      dropLines--;
      //      console.log('Dropping ' + line);
    } else {
      const line2 = line.replace(/"/g, "'"); // since pdf.js 2.4, the ES2015 uses double quotes
      if (line.includes('let fs') || line.includes('const fs')) {
        if (!es2015) console.log('ES 2015 version');
        es2015 = true;
        successfulChanges[1] = true;
      }
      if (line2.includes("var fs = require('fs');") || line2.includes("let fs = require('fs');")) {
        line = '';
        expectedChanges--;
        successfulChanges[2] = true;
      } else if (line2.includes("http = require('http');")) {
        line = '';
        expectedChanges--;
        successfulChanges[3] = true;
      } else if (line2.includes("https = require('https');")) {
        expectedChanges--;
        line = '';
        successfulChanges[4] = true;
      } else if (
        line2.includes("require('zlib')")
      ) {
        expectedChanges--;
        line = 'throw Error("zlib not available in the browser");';
        dropLines = 2;
        successfulChanges[5] = true;
      } else if (line.includes('pdfjs-dist/build/pdf.worker')) {
        if (es2015) {
          line = line.replace('pdfjs-dist/build/pdf.worker', './assets/pdf.worker');
        } else {
          line = line.replace('pdfjs-dist/build/pdf.worker', './assets/pdf.worker-es5');
        }
        expectedChanges--;
        successfulChanges[6] = true;
      } else if (line.includes('pdfjs-dist/build/pdf.worker.js')) {
        if (es2015) {
          line = line.replace('pdfjs-dist/build/pdf.worker.js', './assets/pdf.worker.js');
        } else {
          line = line.replace('pdfjs-dist/build/pdf.worker.js', './assets/pdf.worker-es5.js');
        }
        line = line.replace('pdfjs-dist/build/pdf.worker.js', './pdf.worker-2.2.js');
        expectedChanges--;
        successfulChanges[7] = true;
      } else if (line.includes('./pdf.worker.js')) {
        if (es2015) {
          line = line.replace('./pdf.worker.js', './assets/pdf.worker.js');
        } else {
          line = line.replace('./pdf.worker.js', './assets/pdf.worker-es5.js');
        }
        expectedChanges--;
        successfulChanges[8] = true;
      } else if (line.includes('//# sourceMappingURL=pdf.js.map')) {
        line = ''; // the file hasn't been minified, so there's no use for a source map
        expectedChanges--;
        successfulChanges[9] = true;
      } else if (line2.includes("messageHandler.send('Ready', null);")) {
        const before = `      // #171 receive options from ngx-extended-pdf-viewer
      messageHandler.send('showUnverifiedSignatures',
          window.ServiceWorkerOptions.showUnverifiedSignatures);
      // #171 end of receive options from ngx-extended-pdf-viewer
`;
        line = before + line;
        expectedChanges--;
        successfulChanges[10] = true;
      /* temporarily deactivated during migration to version 2.3.200
      } else if (line.includes('if (fontSize !== this._layoutTextLastFontSize')) {
        expectedChanges--;
        // dropLines = 7;
        line = '//if (this._layoutTextCtx) {\n';
        line += '//if (fontSize !== this._layoutTextLastFontSize || fontFamily !== this._layoutTextLastFontFamily) {\n';
        line += "//this._layoutTextCtx.font = fontSize + ' ' + fontFamily;\n";
        line += '//this._layoutTextLastFontSize = fontSize;\n';
        line += '//this._layoutTextLastFontFamily = fontFamily;\n';
        line += '//}\n';
        line += '//}\n';
        line += '//let width = this._layoutTextCtx?this._layoutTextCtx.measureText(textDiv.textContent).width:0;\n';
      */
      }

      result += line + '\n';
    }
  })
  .on('close', function () {
    let filename = 'pdf-es5.js';
    if (es2015) {
      filename = 'pdf.js';
    }
    fs.writeFile('../projects/ngx-extended-pdf-viewer/src/assets-2.6/' + filename, result, function (err) {
      if (err) {
        return console.log(err);
      }

      console.log('The file was saved to ../projects/ngx-extended-pdf-viewer/src/assets-2.6/' + filename);
      if (expectedChanges !== 0) {
        console.error(expectedChanges + " changes couldn't be applied!");
        for (const [key, value] of Object.entries(successfulChanges)) {
          if (value !== true) {
            console.log("pdf.js " + key + " " + value);
          }
        }
      }
    });
  });
