# PDF.JS


PDF.js is an HTML5 technology experiment that explores building a faithful
and efficient Portable Document Format (PDF) renderer without native code
assistance.

PDF.js is community-driven and supported by Mozilla Labs. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs, and releasing a reliable and secore PDF reader powered by
PDF.js. Integration with Mozilla Firefox is in active development and the viewer
is already integrated in in the (experimental) Aurora builds



# Getting started

### Online demo

For an online demo, visit:

+ http://mozilla.github.com/pdf.js/web/viewer.html

This demo provides an interactive interface for displaying and browsing PDFs
using the PDF.js API.

### Extension

Currently we only regularly ship Firefox extensions, but you can build you
own Chrome extension from source.

#### Firefox

A Firefox extension is available as two different builds:

+ Stable Version: https://addons.mozilla.org/firefox/addon/pdfjs
+ Development Version: http://mozilla.github.com/pdf.js/extensions/firefox/pdf.js.xpi

The development extension should be quite stable but might still break from time to time.
Also, note that the development extension is updated on every merge and by default
Firefox will auto-update extensions on a daily basis (you can change this through the
`extensions.update.interval` option in `about:config`).

#### Chrome

For an experimental Chrome extension, get the code as explained below
and issue `node make chrome`.
Then open Chrome, go to `Tools > Extension` and load the (unpackaged) extension
from the directory `build/chrome`.

If you want to build a .crx package, you'll need to set an environment variable
called `PDFJS_CHROME_KEY` pointing to a your PEM key file. The build script will
figure out if you've set the variable properly and will then generate a .crx package.

### Getting the code

To get a local copy of the current code, clone it using git:

    $ git clone git://github.com/mozilla/pdf.js.git pdfjs
    $ cd pdfjs

Next, you need to start a local web server as most browsers don't allow opening
PDF files for a file:// url:

    $ node make server

You can install Node via [nvm](https://github.com/creationix/nvm) or the
[official package](http://nodejs.org). If everything worked out, you can now serve

+ http://localhost:8888/web/viewer.html

You can also view all the test pdf files on the right side serving

+ http://localhost:8888/test/pdfs/?frame

### Bundling PDF.js.

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


# Contributing

PDF.js is a community-driven project, so contributors are always welcome.
Simply fork our repo and contribute away. If you'd like to start out gently
look for Github issues tagged with [5-good-beginner-bug](https://github.com/mozilla/pdf.js/issues?labels=5-good-beginner-bug&page=1&state=open), otherwise feel
free to dive in directly at:

+ https://github.com/mozilla/pdf.js/issues

For better consistency and long-term stability, please do look around the
code and try to follow our conventions.
More information about the contributor process can be found on the
[contributor wiki page](https://github.com/mozilla/pdf.js/wiki/Contributing).

If you don't want to hack on the project or have little spare time, __you can
still help!__ Just open PDFs in the
[online demo](http://mozilla.github.com/pdf.js/web/viewer.html) or install
the extensions and report any breakage in rendering.

Our Github contributors so far:

+ https://github.com/mozilla/pdf.js/contributors

You can add your name to it! :)


# Running the tests

PDF.js comes with browser-level regression tests that allow one to probe
whether it's able to successfully parse PDFs, as well as compare its output
against reference images, pixel-by-pixel.

More information about running the tests can be found on the
[contributor wiki page](https://github.com/mozilla/pdf.js/wiki/Contributing).


# Additional resources

Gallery of user projects and modifications:

+ https://github.com/mozilla/pdf.js/wiki/Gallery-of-user-projects-and-modifications

You can read more about PDF.js here:

+ http://andreasgal.com/2011/06/15/pdf-js/
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

