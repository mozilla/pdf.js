# PDF.js [![Build Status](https://github.com/mozilla/pdf.js/workflows/CI/badge.svg?branch=master)](https://github.com/mozilla/pdf.js/actions?query=workflow%3ACI+branch%3Amaster)

[PDF.js](https://mozilla.github.io/pdf.js/) is a Portable Document Format (PDF) viewer that is built with HTML5.

PDF.js is community-driven and supported by Mozilla. Our goal is to
create a general-purpose, web standards-based platform for parsing and
rendering PDFs.

## Contributing

PDF.js is an open source project and always looking for more contributors. To
get involved, visit:

+ [Issue Reporting Guide](https://github.com/mozilla/pdf.js/blob/master/.github/CONTRIBUTING.md)
+ [Code Contribution Guide](https://github.com/mozilla/pdf.js/wiki/Contributing)
+ [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
+ [Good Beginner Bugs](https://github.com/mozilla/pdf.js/issues?direction=desc&labels=good-beginner-bug&page=1&sort=created&state=open)
+ [Projects](https://github.com/mozilla/pdf.js/projects)

Feel free to stop by our [Matrix room](https://chat.mozilla.org/#/room/#pdfjs:mozilla.org) for questions or guidance.

## Getting Started

### Online demo

Please note that the "Modern browsers" version assumes native support for the
latest JavaScript features; please also see [this wiki page](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#faq-support).

+ Modern browsers: https://mozilla.github.io/pdf.js/web/viewer.html

+ Older browsers: https://mozilla.github.io/pdf.js/legacy/web/viewer.html

## Setup Instructions (Platform-Specific)

### Windows
1. Install [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/get-npm).
2. Clone the repository and navigate into the project folder:
   bash
   git clone https://github.com/mozilla/pdf.js
   cd pdf.js
3. Install dependencies
   npm install
   npm start

### MacOS/Linux
1. Install Node.js using Homebrew or your package manager: 
   brew install node
2. Clone the repository and navigate into the project folder:
   git clone https://github.com/your-username/pdf.js
   cd pdf.js
3. Install dependencies and start the server:
   npm install 
   npm start

If you encounter any issues during setup, please refer to the troubleshooting section

### Trouble Shooting Section

If you encounter issues during setup or development, here are some common problems and their solutions:

 - **Error: 'npm' command not found**: Ensure that Node,js and npm are installed correctly. Verify by running `node -v` and `npm -v`
 - **Dependency installation fails**: Run `npm cache clean --force` and try `npm install` again. 
 - **Server not starting**: Check for conflicting processes using the same port (usually 3000). Try running `npx kill-port 300` and restarting the server. 

If your issues persists, feel free to open a discussion or consult the [issues section](https://github.com/mozilla/pdf.js/issues). 

### Contribution Guide (Summary)

We welcome contributions from everyone! Here's a brief overview of how to contribute:
 1. **Find an issue**: Look for 'good first issue' or 'help wanted' tags in the [issues section]
 2. **Fork the repo**: Fork the project and create a new branch for your changes.
 3. **Make your changes**: Ensure your changes follow the coding guidelines. 
 4. **Submit a pull request**: After testing your changes, submit a PR and wait for review. 

For more details, check out our [Contribution Guide]

### Browser Extensions

#### Firefox

PDF.js is built into version 19+ of Firefox.

#### Chrome

+ The official extension for Chrome can be installed from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm).
*This extension is maintained by [@Rob--W](https://github.com/Rob--W).*
+ Build Your Own - Get the code as explained below and issue `npx gulp chromium`. Then open
Chrome, go to `Tools > Extension` and load the (unpackaged) extension from the
directory `build/chromium`.

## Getting the Code

To get a local copy of the current code, clone it using git:

    $ git clone https://github.com/mozilla/pdf.js.git
    $ cd pdf.js

Next, install Node.js via the [official package](https://nodejs.org) or via
[nvm](https://github.com/creationix/nvm). If everything worked out, install
all dependencies for PDF.js:

    $ npm install

> [!NOTE]
> On MacOS M1/M2 you may see some `node-gyp`-related errors when running `npm install`. This is because one of our dependencies, `"canvas"`, does not provide pre-built binaries for this platform and instead `npm` will try to build it from source. Please make sure to first install the necessary native dependencies using `brew`: https://github.com/Automattic/node-canvas#compiling.

Finally, you need to start a local web server as some browsers do not allow opening
PDF files using a `file://` URL. Run:

    $ npx gulp server

and then you can open:

+ http://localhost:8888/web/viewer.html

Please keep in mind that this assumes the latest version of Mozilla Firefox; refer to [Building PDF.js](https://github.com/mozilla/pdf.js/blob/master/README.md#building-pdfjs) for non-development usage of the PDF.js library.

It is also possible to view all test PDF files on the right side by opening:

+ http://localhost:8888/test/pdfs/?frame

## Building PDF.js

In order to bundle all `src/` files into two production scripts and build the generic
viewer, run:

    $ npx gulp generic

If you need to support older browsers, run:

    $ npx gulp generic-legacy

This will generate `pdf.js` and `pdf.worker.js` in the `build/generic/build/` directory (respectively `build/generic-legacy/build/`).
Both scripts are needed but only `pdf.js` needs to be included since `pdf.worker.js` will
be loaded by `pdf.js`. The PDF.js files are large and should be minified for production.

## Using PDF.js in a web application

To use PDF.js in a web application you can choose to use a pre-built version of the library
or to build it from source. We supply pre-built versions for usage with NPM and Bower under
the `pdfjs-dist` name. For more information and examples please refer to the
[wiki page](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website) on this subject.

## Including via a CDN

PDF.js is hosted on several free CDNs:
 - https://www.jsdelivr.com/package/npm/pdfjs-dist
 - https://cdnjs.com/libraries/pdf.js
 - https://unpkg.com/pdfjs-dist/

## Learning

You can play with the PDF.js API directly from your browser using the live demos below:

+ [Interactive examples](https://mozilla.github.io/pdf.js/examples/index.html#interactive-examples)

More examples can be found in the [examples folder](https://github.com/mozilla/pdf.js/tree/master/examples/). Some of them are using the pdfjs-dist package, which can be built and installed in this repo directory via `npx gulp dist-install` command.

For an introduction to the PDF.js code, check out the presentation by our
contributor Julian Viereck:

+ https://www.youtube.com/watch?v=Iv15UY-4Fg8

More learning resources can be found at:

+ https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources

The API documentation can be found at:

+ https://mozilla.github.io/pdf.js/api/

## Questions

Check out our FAQs and get answers to common questions:

+ https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions

Talk to us on Matrix:

+ https://chat.mozilla.org/#/room/#pdfjs:mozilla.org

File an issue:

+ https://github.com/mozilla/pdf.js/issues/new/choose
