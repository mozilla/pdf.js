# PDF.js

Next, you need to start a local web server as some browsers don't allow opening
PDF files for a file:// url:

    $ node make server


+ http://localhost:8888/web/viewer.html

You can also view all the test pdf files on the right side serving

+ http://localhost:8888/test/pdfs/?frame


## Building Kaybus specific PDF.js viewer

In order to bundle all `src/` files into two productions scripts and build the Kaybus Viewer, issue:

    $ node make kb_viewer

This will generate `pdf.js` and `pdf.worker.js` in the `build/kaybus/pdfjs` directory.
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. 

## Deploying Kaybus specific PDF.js viewer to the Kaybus repository

Manually copy pdfjs/build/kaybus/pdfjs folder content into the kaybus/vendor/assets/javascripts/pdfjs folder


## Building generic PDF.js

In order to bundle all `src/` files into two productions scripts and build the generic
viewer, issue:

    $ node make generic

This will generate `pdf.js` and `pdf.worker.js` in the `build/generic/build/` directory.
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. If you want to support more browsers than Firefox you'll also need
to include `compatibility.js` from `build/generic/web/`. The PDF.js files are large and
should be minified for production.


## Cleaning PDF.js

In order to clean a build prior to a new build, please issue:

    $ node make clean



## Learning

You can play with the PDF.js API directly from your browser through the live
demos below:

+ Hello world: http://jsbin.com/pdfjs-helloworld-v2/edit#html,live
+ Simple reader with prev/next page controls: http://jsbin.com/pdfjs-prevnext-v2/edit#html,live

The repo contains a hello world example that you can run locally:

+ [examples/helloworld/](https://github.com/mozilla/pdf.js/blob/master/examples/helloworld/)

For an introduction to the PDF.js code, check out the presentation by our
contributor Julian Viereck:

+ http://www.youtube.com/watch?v=Iv15UY-4Fg8

You can read more about PDF.js here:

+ http://andreasgal.com/2011/06/15/pdf-js/
+ http://blog.mozilla.com/cjones/2011/06/15/overview-of-pdf-js-guts/

Even more learning resources can be found at:

+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources

