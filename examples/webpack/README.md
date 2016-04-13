## Overview

Example to demonstrate PDF.js library usage with Webpack.

## Getting started

Build project and install the example dependencies:

    $ gulp dist
    $ cd examples/webpack
    $ npm install

To build Webpack bundles, run `node_modules/.bin/webpack`. If you are running
a web server, you can observe the build results at
http://localhost:8888/examples/webpack/index.html

See main.js and webpack.config.js files. Please notice that PDF.js
packaging requires packaging of the main application and PDF.js worker code,
and the `workerSrc` path shall be set to the latter file.
