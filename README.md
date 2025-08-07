# PDF.js [![CI](https://github.com/mozilla/pdf.js/actions/workflows/ci.yml/badge.svg?query=branch%3Amaster)](https://github.com/mozilla/pdf.js/actions/workflows/ci.yml?query=branch%3Amaster)

[PDF.js](https://mozilla.github.io/pdf.js/) is a powerful Portable Document Format (PDF) viewer built with **HTML5**.

Driven by a vibrant community and proudly supported by Mozilla, our mission is to deliver a versatile, web standards-based platform for parsing and rendering PDFs directly in the browser.

---

## Contribute to PDF.js

PDF.js is an open-source project thriving on contributions! We're always looking for passionate individuals to join our community. To get involved and help shape the future of web-based PDF rendering, explore these resources:

* **Issue Reporting Guide:** Learn how to effectively report bugs and suggest features.
* **Code Contribution Guide:** Dive into the codebase and start contributing your own enhancements.
* **Frequently Asked Questions:** Find answers to common queries about the project.
* **Good Beginner Bugs:** Get started with issues specifically tagged for new contributors.
* **Projects:** See what the team is currently working on.

For real-time questions or guidance, feel free to drop by our [Matrix room](https://chat.mozilla.org/#/room/#pdfjs:mozilla.org).

---

## Get Started

### Online Demos

Experience PDF.js instantly with our live online demos:

* **Modern Browsers:** For browsers with native support for the latest JavaScript features, visit: [https://mozilla.github.io/pdf.js/web/viewer.html](https://mozilla.github.io/pdf.js/web/viewer.html)
    * *Please note: Refer to our [FAQ on browser support](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions#faq-support) for more details.*
* **Older Browsers:** For broader compatibility, use our legacy viewer: [https://mozilla.github.io/pdf.js/legacy/web/viewer.html](https://mozilla.github.io/pdf.js/legacy/web/viewer.html)

### Browser Extensions

Integrate PDF.js directly into your browser for a seamless viewing experience.

#### Firefox

PDF.js is **built directly into Firefox versions 19 and above**, providing native PDF viewing capabilities.

#### Chrome

* **Official Extension:** Install the official PDF.js extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/pdf-viewer/oemmndcbldboiebfnladdacbdfmadadm).
    * *This extension is actively maintained by [@Rob--W](https://github.com/Rob--W).*
* **Build Your Own:** For a customized experience, clone the repository as explained below, then run ```npx gulp chromium```. In Chrome, navigate to ```Tools > Extensions``` and load the unpackaged extension from the ```build/chromium``` directory.

---

## Getting the Code

To obtain a local copy of the PDF.js source code, follow these steps:

```bash
git clone https://github.com/mozilla/pdf.js.git
cd pdf.js
```

Next, ensure you have Node.js installed, either via the [official package](https://nodejs.org) or [nvm](https://github.com/creationix/nvm). Once Node.js is set up, install all project dependencies:

```bash
npm install
```

Finally, to properly test PDF.js, you'll need a local web server (as some browsers restrict ```file://``` URLs for PDF files). Start the server with:

```bash
npx gulp server
```

You can then access the viewer at:

* [http://localhost:8888/web/viewer.html](http://localhost:8888/web/viewer.html)

*Keep in mind this setup is optimized for development with the latest Mozilla Firefox. For non-development usage, refer to the [Building PDF.js](#building-pdfjs) section.*

You can also view all test PDF files on the right side by opening:

* [http://localhost:8888/test/pdfs/?frame](http://localhost:8888/test/pdfs/?frame)

---

## Building PDF.js

To bundle all ```src/``` files into production-ready scripts and build the generic viewer, run:

```bash
npx gulp generic
```

If you need to support older browsers, use:

```bash
npx gulp generic-legacy
```

These commands will generate ```pdf.js``` and ```pdf.worker.js``` within the ```build/generic/build/``` directory (or ```build/generic-legacy/build/```). Both scripts are essential; however, you only need to include ```pdf.js```, as it will automatically load ```pdf.worker.js```. For optimal performance in production, remember to **minify these large PDF.js files**.

---

## Using PDF.js in Your Web Application

Integrating PDF.js into your web application is straightforward. You can either use a pre-built version or build it directly from the source. For convenience, we provide pre-built versions for NPM under the ```pdfjs-dist``` package.

For detailed instructions and examples, consult our comprehensive [wiki page on setting up PDF.js in a website](https://github.com/mozilla/pdf.js/wiki/Setup-pdf.js-in-a-website).

---

## Including via a CDN

For easy integration, PDF.js is readily available on several free CDNs:

* [https://www.jsdelivr.com/package/npm/pdfjs-dist](https://www.jsdelivr.com/package/npm/pdfjs-dist)
* [https://cdnjs.com/libraries/pdf.js](https://cdnjs.com/libraries/pdf.js)
* [https://unpkg.com/pdfjs-dist/](https://unpkg.com/pdfjs.dist/)

---

## Learn More

Explore the PDF.js API directly in your browser with our interactive demos:

* [Interactive Examples](https://mozilla.github.io/pdf.js/examples/index.html#interactive-examples)

More code examples are available in the [examples folder](https://github.com/mozilla/pdf.js/tree/master/examples/). Some examples utilize the ```pdfjs-dist``` package, which can be built and installed in this repository via the ```npx gulp dist-install``` command.

For an insightful introduction to the PDF.js codebase, watch the presentation by our esteemed contributor, Julian Viereck:

* [https://www.youtube.com/watch?v=Iv15UY-4Fg8](https://www.youtube.com/watch?v=Iv15UY-4Fg8)

Discover additional learning resources here:

* [https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources](https://github.com/mozilla/pdf.js/wiki/Additional-Learning-Resources)

Access the full API documentation at:

* [https://mozilla.github.io/pdf.js/api/](https://mozilla.github.io/pdf.js/api/)

---

## Have Questions?

We're here to help!

* Check our [Frequently Asked Questions](https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions) for immediate answers.
* Join the conversation on Matrix: [https://chat.mozilla.org/#/room/#pdfjs:mozilla.org](https://chat.mozilla.org/#/room/#pdfjs:mozilla.org)
* If you've found an issue or have a feature request, please [file an issue](https://github.com/mozilla/pdf.js/issues/new/choose).
