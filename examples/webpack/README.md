## Overview

Example to demonstrate PDF.js library usage with Webpack.

## Getting started

Install the example dependencies and build the project:

    $ gulp dist-install
    $ cd examples/webpack
    $ npm install
    $ ./node_modules/webpack/bin/webpack.js

You can observe the build results by running `gulp server` and navigating to
http://localhost:8888/examples/webpack/index.html.

Refer to the `main.js` and `webpack.config.js` files for the source code.
Note that PDF.js packaging requires packaging of the main application and
the worker code, and the `workerSrc` path shall be set to the latter file.

## Worker loading

If you are getting the `Setting up fake worker` warning, make sure you are
importing `pdfjs-dist/webpack` which is the zero-configuration method for
Webpack users. You will need to install
[worker-loader](https://github.com/webpack-contrib/worker-loader) as a
dependency in your project in order to use `pdfjs-dist/webpack` (configuring
`worker-loader` is not necessary; just installing it is sufficient).

    import pdfjsLib from 'pdfjs-dist/webpack';

For a full working example refer to [this repository](https://github.com/yurydelendik/pdfjs-react).
