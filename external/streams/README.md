# Streams API polyfill for PDF.js

This folder contains streams-lib.js file that works as a polyfill for `Streams API
in PDF.js` project.

## Steps to create streams-lib.js file

- Fork [Streams API](https://github.com/whatwg/streams/tree/master/reference-implementation) reference implementation.
- Bundle and port to es5 ref-implementation files using webpack to create commonjs module.