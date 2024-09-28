# PDF.js ![Build Status](https://github.com/mozilla/pdf.js/workflows/CI/badge.svg?branch=master)

[PDF.js](https://mozilla.github.io/pdf.js/) is a powerful HTML5-based PDF viewer developed by Mozilla. Our mission is to provide a robust, web standards-based platform for parsing and rendering PDF documents. It is community-driven and supported by Mozilla.

## Table of Contents
- [Contributing](#contributing)
- [Getting Started](#getting-started)
  - [Online Demo](#online-demo)
  - [Browser Extensions](#browser-extensions)
  - [Getting the Code](#getting-the-code)
- [Building PDF.js](#building-pdfjs)
- [Using PDF.js in a Web Application](#using-pdfjs-in-a-web-application)
- [Including via a CDN](#including-via-a-cdn)
- [Learning Resources](#learning-resources)
- [Questions](#questions)

## Contributing

PDF.js thrives on community contributions! If you're interested in getting involved, check out the following resources:

- [Issue Reporting Guide](https://github.com/mozilla/pdf.js/blob/master/.github/CONTRIBUTING.md)
- [Code Contribution Guide](https://github.com/mozilla/pdf.js/wiki/Contributing)
- [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions)
- [Good Beginner Bugs](https://github.com/mozilla/pdf.js/issues?direction=desc&labels=good-beginner-bug&page=1&sort=created&state=open)
- [Projects](https://github.com/mozilla/pdf.js/projects)

Join our [Matrix room](https://chat.mozilla.org/#/room/#pdfjs:mozilla.org) for questions or support!

## Getting Started

### Online Demo

To explore PDF.js functionality, visit:

- **Modern Browsers:** [Demo](https://mozilla.github.io/pdf.js/web/viewer.html)
- **Older Browsers:** [Legacy Demo](https://mozilla.github.io/pdf.js/legacy/web/viewer.html)

### Browser Extensions

- **Firefox:** Integrated into Firefox 19 and above.
- **Chrome:**
  - Install the official extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm) (maintained by [@Rob--W](https://github.com/Rob--W)).
  - Build Your Own: Clone the repo and run `npx gulp chromium`. Load the unpacked extension from the `build/chromium` directory in Chrome.

### Getting the Code

To clone the repository:

```bash
$ git clone https://github.com/mozilla/pdf.js.git
$ cd pdf.js
```

Install Node.js from the [official site](https://nodejs.org) or via [nvm](https://github.com/creationix/nvm). Then, install dependencies:

```bash
$ npm install
```

> [!NOTE]
> On macOS with Apple Silicon (M1, M2, M3, etc.), you may face node-gyp-related errors during `npm install`. Ensure you have the necessary native dependencies for `canvas` installed via Homebrew. For instructions, visit [node-canvas Compilation](https://github.com/Automattic/node-canvas#compiling).

Start a local web server:

```bash
$ npx gulp server
```

Access the viewer at:

- [http://localhost:8888/web/viewer.html](http://localhost:8888/web/viewer.html)

You can also view test PDFs here:

- [http://localhost:8888/test/pdfs/?frame](http://localhost:8888/test/pdfs/?frame)

## Building PDF.js

To bundle source files and build the generic viewer, run:

```bash
$ npx gulp generic
```

For older browser support, run:

```bash
$ npx gulp generic-legacy
```

Generated files will be located in the `build/generic/build/` and `build/generic-legacy/build/` directories. Include `pdf.js` in your project; `pdf.worker.js` will load automatically.

## Using PDF.js in a Web Application

You can integrate PDF.js into your web application using a pre-built version or by building from source. Pre-built versions are available as `pdfjs-dist`. More details and examples can be found in our [setup guide](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website).

## Including via a CDN

PDF.js is available on several CDNs:

- [jsDelivr](https://www.jsdelivr.com/package/npm/pdfjs-dist)
- [cdnjs](https://cdnjs.com/libraries/pdf.js)
- [unpkg](https://unpkg.com/pdfjs-dist/)

## Learning Resources

Experiment with the PDF.js API through live demos:

- [Interactive Examples](https://mozilla.github.io/pdf.js/examples/index.html#interactive-examples)

Additional examples are available in the [examples folder](https://github.com/mozilla/pdf.js/tree/master/examples/). To build and install the `pdfjs-dist` package, use:

```bash
$ npx gulp dist-install
```

For an introduction to PDF.js code, check out this presentation by contributor Julian Viereck: [Watch Presentation](https://www.youtube.com/watch?v=Iv15UY-4Fg8).

More learning resources can be found at:

- [Additional Learning Resources](https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources)

API documentation is available at:

- [PDF.js API Documentation](https://mozilla.github.io/pdf.js/api/)

## Questions?

Check our [FAQs](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions) for common inquiries, join the discussion on Matrix, or file an issue [here](https://github.com/mozilla/pdf.js/issues/new/choose).
