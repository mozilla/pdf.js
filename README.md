# PDF.JS

pdf.js is an HTML5 technology experiment that explores building a faithful
and efficient Portable Document Format (PDF) renderer without native code 
assistance.

pdf.js is community-driven and supported by Mozilla Labs. Our goal is to 
create a general-purpose, web standards-based platform for parsing and 
rendering PDFs, and eventually release a PDF reader extension powered by 
pdf.js.

 

# Getting started

### Online demo

For an online demo, visit:

+ http://mozilla.github.com/pdf.js/web/viewer.html

This demo provides an interactive interface for displaying and browsing PDFs
using the pdf.js API.

### Extension

A Firefox extension is availble in two places:

+ Stable Version: https://addons.mozilla.org/firefox/addon/pdfjs
+ Development Version: http://mozilla.github.com/pdf.js/extensions/firefox/pdf.js.xpi

The development extension should be quite stable but still might break from time to time.
Also, note that the development extension is updated on every merge and by default Firefox will
auto-update extensions on a daily basis (you can change this through the 
`extensions.update.interval` option in `about:config`).

For an experimental Chrome extension, get the code as explained below and issue `node make extension`. 
Then open Chrome, go to `Tools > Extension` and load the (unpackaged) extension
from the directory `build/chrome`.

### Getting the code

To get a local copy of the current code, clone it using git:

    $ git clone git://github.com/mozilla/pdf.js.git pdfjs
    $ cd pdfjs

Next, you need to start a local web server as some browsers don't allow opening
PDF files for a file:// url:

    $ node make server

You can install Node via [nvm](https://github.com/creationix/nvm) or the 
[official package](http://nodejs.org). If everything worked out, you can now serve 

+ http://localhost:8888/web/viewer.html

You can also view all the test pdf files on the right side serving

+ http://localhost:8888/test/pdfs/?frame

### Building pdf.js.

In order to bundle all `src/` files into a final `pdf.js` and build the generic viewer, issue:

    $ node make generic

This will generate the file `build/generic/build/pdf.js` that can be included in your final project. The pdf.js file is large and should be minified for production. Also, if you would like to support more browsers than firefox you'll also need to include `compatibility.js` from `build/generic/web/`.


# Learning

You can play with the PDF.js API directly from your browser through the live demos below:

+ Hello world: http://jsbin.com/pdfjs-helloworld-v2/edit#html,live
+ Simple reader with prev/next page controls: http://jsbin.com/pdfjs-prevnext-v2/edit#html,live

The repo contains a hello world example that you can run locally:

+ [examples/helloworld/](https://github.com/mozilla/pdf.js/blob/master/examples/helloworld/)

For an introduction to the PDF.js code, check out the presentation by our contributor Julian Viereck:

+ http://www.youtube.com/watch?v=Iv15UY-4Fg8

Additional learning resources can be found at:

+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources


# Contributing

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
+ https://github.com/mozilla/pdf.js/blob/master/LICENSE

You can add your name to it! :)


# Running the tests

pdf.js comes with browser-level regression tests that allow one to probe
whether it's able to successfully parse PDFs, as well as compare its output
against reference images, pixel-by-pixel.

More information about running the tests can be found on the
[contributor wiki page](https://github.com/mozilla/pdf.js/wiki/Contributing).


# Additional resources

Gallery of user projects and modifications:

+ https://github.com/mozilla/pdf.js/wiki/Gallery-of-user-projects-and-modifications

You can read more about pdf.js here:

+ http://andreasgal.com/2011/06/15/pdf-js/
+ http://blog.mozilla.com/cjones/2011/06/15/overview-of-pdf-js-guts/
+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources

Talk to us on IRC:

+ #pdfjs on irc.mozilla.org

Join our mailing list: 

+ dev-pdf-js@lists.mozilla.org

Subscribe either using lists.mozilla.org or Google Groups: 
  
+ https://lists.mozilla.org/listinfo/dev-pdf-js
+ https://groups.google.com/group/mozilla.dev.pdf-js/topics

Follow us on twitter: @pdfjs

+ http://twitter.com/#!/pdfjs

