---
title: Getting Started
template: layout.jade
---

# Getting Started

An introduction to PDF.js with examples.

## Introduction

Before downloading PDF.js please take a moment to understand the different layers of the PDF.js project.

<table class="table">
  <thead>
    <tr>
      <th>Layer</th>
      <th>About</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Core</td>
      <td>The core layer is where a binary PDF is parsed and interpreted. This layer is the foundation for all subsequent layers. It is not documented here because using it directly is considered an advanced usage and the API is likely to change. For an example of using the core layer see the <a href="https://github.com/brendandahl/pdf.js.utils/tree/master/browser">PDF Object Browser</a>.
      </td>
    </tr>
    <tr>
      <td>Display</td>
      <td>The display layer takes the core layer and exposes an easier to use API to render PDFs and get other information out of a document. This API is what the version number is based on.</td>
    </tr>
    <tr>
      <td>Viewer</td>
      <td>The viewer is built on the display layer and is the UI for PDF viewer in Firefox and the other browser extensions within the project. It can be a good starting point for building your own viewer. <em>However, we do ask if you plan to embed the viewer in your own site, that it not just be an unmodified version. Please re-skin it or build upon it.</em></td>
    </tr>
  </tbody>
</table>

## Download

<div class="row">
  <div class="col-md-6">
    <h3>Prebuilt</h3>
    <p>
      Includes the generic build of PDF.js and the viewer.
    </p>
    <span class="GROUP_CLASS">
      <a type="button" class="btn btn-primary" href="https://github.com/mozilla/pdf.js/releases/download/vSTABLE_VERSION/pdfjs-STABLE_VERSION-dist.zip">Stable (vSTABLE_VERSION)</a>
      <a type="button" class="btn btn-warning HIDDEN_CLASS" href="https://github.com/mozilla/pdf.js/releases/download/vBETA_VERSION/pdfjs-BETA_VERSION-dist.zip">Beta (vBETA_VERSION)</a>
    </span>
  </div>
  <div class="col-md-6">
    <h3>Source</h3>
    To get a local copy of the current code, clone it using git:
    <pre><code>$ git clone git://github.com/mozilla/pdf.js.git
$ cd pdf.js
</code></pre>
  </div>
</div>

## Including via a CDN

PDF.js is hosted on several free CDNs:
 - https://www.jsdelivr.com/package/npm/pdfjs-dist
 - https://cdnjs.com/libraries/pdf.js
 - https://unpkg.com/pdfjs-dist/

## File Layout Overview

Note that we only mention the most relevant files and folders.

### Prebuilt

```
├── build/
│   ├── pdf.js                             - display layer
│   ├── pdf.js.map                         - display layer's source map
│   ├── pdf.worker.js                      - core layer
│   └── pdf.worker.js.map                  - core layer's source map
├── web/
│   ├── cmaps/                             - character maps (required by core)
│   ├── compressed.tracemonkey-pldi-09.pdf - PDF file for testing purposes
│   ├── debugger.js                        - helpful debugging features
│   ├── images/                            - images for the viewer and annotation icons
│   ├── locale/                            - translation files
│   ├── viewer.css                         - viewer style sheet
│   ├── viewer.html                        - viewer layout
│   ├── viewer.js                          - viewer layer
│   └── viewer.js.map                      - viewer layer's source map
└── LICENSE
```

### Source

```
├── docs/                                  - website source code
├── examples/                              - simple usage examples
├── extensions/                            - browser extension source code
├── external/                              - third party code
├── l10n/                                  - translation files
├── src/
│   ├── core/                              - core layer
│   ├── display/                           - display layer
│   ├── shared/                            - shared code between the core and display layers
│   ├── interfaces.js                      - interface definitions for the core/display layers
│   ├── pdf.*.js                           - wrapper files for bundling
│   └── worker_loader.js                   - used for developer builds to load worker files
├── test/                                  - unit, font and reference tests
├── web/                                   - viewer layer
├── LICENSE
├── README.md
├── gulpfile.js                            - build scripts/logic
├── package-lock.json                      - pinned dependency versions
└── package.json                           - package definition and dependencies
```

## Trying the Viewer

With the prebuilt or source version, open `web/viewer.html` in a browser and the test pdf should load. Note: the worker is not enabled for file:// urls, so use a server. If you're using the source build and have node, you can run `gulp server`.

## More Information

For a further walkthrough of a minimal viewer, see the hello world example. More documentation can be found in our [wiki](https://github.com/mozilla/pdf.js/wiki) too.
