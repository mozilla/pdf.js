# pdf.js

 

## Overview

pdf.js is an HTML5 technology experiment that explores building a faithful
and efficient Portable Document Format (PDF) renderer without native code 
assistance.

pdf.js is community-driven and supported by Mozilla Labs. Our goal is to 
create a general-purpose, web standards-based platform for parsing and 
rendering PDFs, and eventually release a PDF reader extension powered by 
pdf.js. Integration with Firefox is a possibility if the experiment proves 
successful.



## Getting started

### Online demo

For an online demo, visit:

+ http://mozilla.github.com/pdf.js/web/viewer.html

This demo provides an interactive interface for displaying and browsing PDFs
using the pdf.js API.

### Extension

An up-to-date Firefox extension is also available:

+ http://mozilla.github.com/pdf.js/extensions/firefox/pdf.js.xpi

(The above link is updated upon every merge to our master branch).

For an experimental Chrome extension, get the code as explained below and issue `make extension`. 
Then open Chrome with the flag `--enable-experimental-extension-apis`, go to `Tools > Extension`
and load the (unpackaged) extension from the directory `extensions/chrome`.

### Getting the code

To get a local copy of the current code, clone it using git:

    $ git clone git://github.com/mozilla/pdf.js.git pdfjs
    $ cd pdfjs

Next, you need to start a local web server as some browsers don't allow opening
PDF files for a file:// url:

    $ make server

If everything worked out, you can now serve 

+ http://localhost:8888/web/viewer.html

You can also view all the test pdf files on the right side serving

+ http://localhost:8888/test/pdfs/?frame

### Building pdf.js

In order to bundle all `src/` files into a final `pdf.js`, issue:

    $ make

This will generate the file `build/pdf.js` that can be included in your final project. (WARNING: That's a large file! Consider minifying it).


## Learning

Here are some initial pointers to help contributors get off the ground. 
Additional resources are available in a separate section below.

#### Hello world

For a "hello world" example, take a look at:

+ [examples/helloworld/hello.js](https://github.com/mozilla/pdf.js/blob/master/examples/helloworld/hello.js)

This example illustrates the bare minimum ingredients for integrating pdf.js
in a custom project.

#### Introductory video

Check out the presentation by our contributor Julian Viereck on the inner 
workings of PDF and pdf.js:

+ http://www.youtube.com/watch?v=Iv15UY-4Fg8




## Contributing

pdf.js is a community-driven project, so contributors are always welcome. 
Simply fork our repo and contribute away. Good starting places for picking
a bug are the top error messages and TODOs in our corpus report:

+ http://people.mozilla.com/~bdahl/corpusreport/test/ref/

and of course our open Github issues:

+ https://github.com/mozilla/pdf.js/issues 

For better consistency and long-term stability, please do look around the 
code and try to follow our conventions.
More information about the contributor process can be found on the 
[contributor wiki page](https://github.com/mozilla/pdf.js/wiki/Contributing).

If you don't want to hack on the project or have little spare time, __you still
can help!__ Just open PDFs in the 
[online demo](http://mozilla.github.com/pdf.js/web/viewer.html) and report 
any breakage in rendering.

Our Github contributors so far:

+ https://github.com/mozilla/pdf.js/contributors

You can add your name to it! :)



## Running the tests

pdf.js comes with browser-level regression tests that allow one to probe 
whether it's able to successfully parse PDFs, as well as compare its output
against reference images, pixel-by-pixel.

To run the tests, first configure the browser manifest file at:

    test/resources/browser_manifests/browser_manifest.json

Sample manifests for different platforms are provided in that directory.

To run all the bundled tests, type:

    $ make test

and cross your fingers. Different types of tests are available, see the test
manifest file at:

    test/test_manifest.json

The test type `eq` tests whether the output images are identical to reference 
images. The test type `load` simply tests whether the file loads without 
raising any errors.


## Running tests through our bot

If you are a reviewer, you can use our remote bot to issue comprehensive tests 
against reference images before merging pull requests.

See the bot repo for details:

+ https://github.com/mozilla/pdf.js-bot


## Additional resources

Gallery of user projects and modifications:

+ https://github.com/mozilla/pdf.js/wiki/Gallery-of-user-projects-and-modifications

You can read more about pdf.js here:

+ http://andreasgal.com/2011/06/15/pdf-js/
+ http://blog.mozilla.com/cjones/2011/06/15/overview-of-pdf-js-guts/

Talk to us on IRC:

+ #pdfjs on irc.mozilla.org

Join our mailing list: 

+ dev-pdf-js@lists.mozilla.org

Subscribe either using lists.mozilla.org or Google Groups: 
  
+ https://lists.mozilla.org/listinfo/dev-pdf-js
+ https://groups.google.com/group/mozilla.dev.pdf-js/topics

Follow us on twitter: @pdfjs

+ http://twitter.com/#!/pdfjs
  
  
  
## PDF-related resources

A really basic overview of PDF is described here:

+ http://partners.adobe.com/public/developer/en/livecycle/lc_pdf_overview_format.pdf

A more detailed file example:

+ http://gnupdf.org/Introduction_to_PDF
  
The PDF specification itself is an ISO and not freely available. However, there is
a "PDF Reference" from Adobe:

+ http://wwwimages.adobe.com/www.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/pdf_reference_1-7.pdf

Recommended chapters to read: "2. Overview", "3.4 File Structure", 
"4.1 Graphics Objects" that lists the PDF commands.
