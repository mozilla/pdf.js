## Overview

Example to demonstrate PDF.js library usage with Browserify.

## Getting started

Build project and install the example dependencies:

    $ gulp dist
    $ cd examples/browserify
    $ npm install

To build Browserify bundles, run `gulp build`. If you are running
a web server, you can observe the build results at
http://localhost:8888/examples/browserify/index.html

See main.js, worker.js and gulpfile.js files. Please notice that PDF.js
packaging requires packaging of the main application and PDF.js worker code,
and the `workerSrc` path shall be set to the latter file. The pdf.worker.js file
shall be excluded from the main bundle.

Alternatives to the gulp commands (without compression) are:

    $ mkdir -p ../../build/browserify
    $ node_modules/.bin/browserify main.js -u ./node_modules/pdfjs-dist/build/pdf.worker.js -o ../../build/browserify/main.bundle.js
    $ node_modules/.bin/browserify worker.js -o ../../build/browserify/pdf.worker.bundle.js
