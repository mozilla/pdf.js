## Build

In order to generate the files `qcms.js` and `qcms_bg.wasm`:
* git clone https://github.com/mozilla/pdf.js.qcms/
* the build requires to have a [Docker](https://www.docker.com/) setup and then:
  * `node build.js -C` to build the Docker image
  * `node build.js -co /pdf.js/external/qcms/` to compile the decoder

## Licensing

[qcms](https://github.com/FirefoxGraphics/qcms) is under [MIT](https://github.com/FirefoxGraphics/qcms/blob/main/COPYING)
and [pdf.js.qcms](https://github.com/mozilla/pdf.js.qcms/) is released under [MIT](https://github.com/mozilla/pdf.js.qcms/blob/main/LICENSE) license so `qcms.js` and `qcms_bg.wasm` are released under [MIT](https://github.com/mozilla/pdf.js.qcms/blob/main/LICENSE) license too.
