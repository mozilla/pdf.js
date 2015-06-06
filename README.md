# PDF.js

PDF.js is a Portable Document Format (PDF) viewer that is built with HTML5.

PDF.js is community-driven and supported by Mozilla Labs. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs.

## Contributing

PDF.js is an open source project and always looking for more contributors. To
get involved checkout:

+ [Issue Reporting Guide](https://github.com/mozilla/pdf.js/blob/master/CONTRIBUTING.md)
+ [Code Contribution Guide](https://github.com/mozilla/pdf.js/wiki/Contributing)
+ [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
+ [Good Beginner Bugs](https://github.com/mozilla/pdf.js/issues?direction=desc&labels=5-good-beginner-bug&page=1&sort=created&state=open)
+ [Priorities](https://github.com/mozilla/pdf.js/milestones)
+ [Attend a Public Meeting](https://github.com/mozilla/pdf.js/wiki/Weekly-Public-Meetings)

For further questions or guidance feel free to stop by #pdfjs on
irc.mozilla.org.

## Getting Started

### Online demo

+ http://mozilla.github.io/pdf.js/web/viewer.html

### Browser Extensions

#### Firefox

PDF.js is built into version 19+ of Firefox, however one extension is still available:

+ [Development Version](http://mozilla.github.io/pdf.js/extensions/firefox/pdf.js.xpi) - This version is updated every time new code is merged into the PDF.js codebase. This should be quite stable but still might break from time to time.

#### Chrome and Opera

+ The official extension for Chrome can be installed from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm).
*This extension is maintained by [@Rob--W](https://github.com/Rob--W).*
+ Opera has also published an extension for their browser at the [Opera add-ons catalog](https://addons.opera.com/en/extensions/details/pdf-viewer/).
+ Build Your Own - Get the code as explained below and issue `node make chromium`. Then open
Chrome, go to `Tools > Extension` and load the (unpackaged) extension from the
directory `build/chromium`.

## Getting the Code

To get a local copy of the current code, clone it using git:

    $ git clone git://github.com/mozilla/pdf.js.git
    $ cd pdf.js

Next, install Node.js via the [official package](http://nodejs.org) or via
[nvm](https://github.com/creationix/nvm). If everything worked out, run

    $ npm install

to install all dependencies for PDF.js.

Finally you need to start a local web server as some browsers do not allow opening
PDF files using a file:// URL. Run

    $ node make server

and then you can open

+ http://localhost:8888/web/viewer.html

It is also possible to view all test PDF files on the right side by opening

+ http://localhost:8888/test/pdfs/?frame

## Building PDF.js

In order to bundle all `src/` files into two productions scripts and build the generic
viewer, issue:

    $ node make generic

This will generate `pdf.js` and `pdf.worker.js` in the `build/generic/build/` directory.
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. If you want to support more browsers than Firefox you'll also need
to include `compatibility.js` from `build/generic/web/`. The PDF.js files are large and
should be minified for production.

## Learning

You can play with the PDF.js API directly from your browser through the live
demos below:

+ [Hello world](http://mozilla.github.io/pdf.js/examples/learning/helloworld.html)
+ [Simple reader with prev/next page controls](http://mozilla.github.io/pdf.js/examples/learning/prevnext.html)

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

## Questions

Check out our FAQs and get answers to common questions:

+ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions

Talk to us on IRC:

+ #pdfjs on irc.mozilla.org

Join our mailing list:

+ dev-pdf-js@lists.mozilla.org

Subscribe either using lists.mozilla.org or Google Groups:

+ https://lists.mozilla.org/listinfo/dev-pdf-js
+ https://groups.google.com/group/mozilla.dev.pdf-js/topics

Follow us on twitter: @pdfjs

+ http://twitter.com/#!/pdfjs

Weekly Public Meetings

+ https://github.com/mozilla/pdf.js/wiki/Weekly-Public-Meetings
