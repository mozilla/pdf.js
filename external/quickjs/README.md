## Build

In order to generate the file `quickjs-eval.js`:
* git clone https://github.com/mozilla/pdf.js.quickjs/
* the build requires to have a [Docker](https://www.docker.com/) setup and then:
  * `node build.js -C` to build the Docker image
  * `node build.js -co /pdf.js/external/quickjs/` to compile the sandbox

## Licensing

[Quickjs](https://bellard.org/quickjs/) and [pdf.js.quickjs](https://github.com/mozilla/pdf.js.quickjs/) are released under [MIT](https://opensource.org/licenses/MIT) license so `quickjs-eval.js` is released under [MIT](https://opensource.org/licenses/MIT) license too.
