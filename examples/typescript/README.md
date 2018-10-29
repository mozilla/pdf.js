## Overview

Example to demonstrate PDF.js library usage with TypeScript.

## Getting started

Build project and install the example dependencies:

    $ cd pdf.js
    $ npm install
    $ gulp dist
    $ cd examples/typescript
    $ npm install
    $ npm test

## Type declaration file

TypeScript type declarations are in `external/types/*.d.ts`. These are copied over to the dist/ directory by `gulp dist`. The copy in the `build/dist/` directory is used by these tests. Rerun `gulp dist` or manually copy the file into `build/dist/` after updating declaration files.
