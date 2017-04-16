# PDF.js

PDF.js is a Portable Document Format (PDF) viewer that is built with HTML5.

PDF.js is community-driven and supported by Mozilla Labs. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs.

## Contributing

PDF.js is an open source project and always looking for more contributors. To
get involved, visit:

+ [Issue Reporting Guide](https://github.com/mozilla/pdf.js/blob/master/.github/CONTRIBUTING.md)
+ [Code Contribution Guide](https://github.com/mozilla/pdf.js/wiki/Contributing)
+ [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
+ [Good Beginner Bugs](https://github.com/mozilla/pdf.js/issues?direction=desc&labels=5-good-beginner-bug&page=1&sort=created&state=open)
+ [Projects](https://github.com/mozilla/pdf.js/projects)

Feel free to stop by #pdfjs on irc.mozilla.org for questions or guidance.

## Getting Started

### Online demo

+ https://mozilla.github.io/pdf.js/web/viewer.html

### Browser Extensions

#### Firefox (and Seamonkey)

PDF.js is built into version 19+ of Firefox, however one extension is still available:

+ [Development Version](http://mozilla.github.io/pdf.js/extensions/firefox/pdf.js.xpi) - This extension is mainly intended for developers/testers, and it is updated every time new code is merged into the PDF.js codebase. It should be quite stable, but might break from time to time.

  + Please note that the extension is *not* guaranteed to be compatible with Firefox versions that are *older* than the current ESR version, see the [Release Calendar](https://wiki.mozilla.org/RapidRelease/Calendar#Past_branch_dates).

  + The extension should also work in Seamonkey, provided that it is based on a Firefox version as above (see [Which version of Firefox does SeaMonkey 2.x correspond with?](https://wiki.mozilla.org/SeaMonkey/FAQ#General)), but we do *not* guarantee compatibility.

#### Chrome

+ The official extension for Chrome can be installed from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm).
*This extension is maintained by [@Rob--W](https://github.com/Rob--W).*
+ Build Your Own - Get the code as explained below and issue `gulp chromium`. Then open
Chrome, go to `Tools > Extension` and load the (unpackaged) extension from the
directory `build/chromium`.

## Getting the Code

To get a local copy of the current code, clone it using git:

    $ git clone git://github.com/mozilla/pdf.js.git
    $ cd pdf.js

Next, install Node.js via the [official package](http://nodejs.org) or via
[nvm](https://github.com/creationix/nvm). You need to install the gulp package
globally (see also [gulp's getting started](https://github.com/gulpjs/gulp/blob/master/docs/getting-started.md#getting-started)):

    $ npm install -g gulp-cli

If everything worked out, install all dependencies for PDF.js:

    $ npm install

Finally you need to start a local web server as some browsers do not allow opening
PDF files using a file:// URL. Run

    $ gulp server

and then you can open

+ http://localhost:8888/web/viewer.html

It is also possible to view all test PDF files on the right side by opening

+ http://localhost:8888/test/pdfs/?frame

## Building PDF.js

In order to bundle all `src/` files into two production scripts and build the generic
viewer, run:

    $ gulp generic

This will generate `pdf.js` and `pdf.worker.js` in the `build/generic/build/` directory.
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. If you want to support more browsers than Firefox you'll also need
to include `compatibility.js` from `build/generic/web/`. The PDF.js files are large and
should be minified for production.

## Using PDF.js in a web application

To use PDF.js in a web application you can choose to use a pre-built version of the library
or to build it from source. We supply pre-built versions for usage with NPM and Bower under
the `pdfjs-dist` name. For more information and examples please refer to the
[wiki page](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website) on this subject.

## Learning

You can play with the PDF.js API directly from your browser using the live
demos below:

+ [Interactive examples](http://mozilla.github.io/pdf.js/examples/index.html#interactive-examples)

The repository contains a hello world example that you can run locally:

+ [examples/helloworld/](https://github.com/mozilla/pdf.js/blob/master/examples/helloworld/)

For an introduction to the PDF.js code, check out the presentation by our
contributor Julian Viereck:

+ http://www.youtube.com/watch?v=Iv15UY-4Fg8

More learning resources can be found at:

+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources

## Questions

Check out our FAQs and get answers to common questions:

+ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions

Talk to us on IRC:

+ #pdfjs on irc.mozilla.org

File an issue:

+ https://github.com/mozilla/pdf.js/issues/new

Follow us on twitter: @pdfjs

+ http://twitter.com/#!/pdfjs
