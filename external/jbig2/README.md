## Build

In order to generate the file `jbig2.js`:
* git clone https://github.com/mozilla/pdf.js.jbig2/
* the build requires to have a [Docker](https://www.docker.com/) setup and then:
  * `node build.js -C` to build the Docker image
  * `node build.js -co /pdf.js/external/jbig2/` to compile the decoder

## Licensing

[PDFium](https://pdfium.googlesource.com/pdfium/) is under [Apache-2.0](https://pdfium.googlesource.com/pdfium/+/main/LICENSE)
and [pdf.js.jbig2](https://github.com/mozilla/pdf.js.jbig2/) is released under [Apache-2.0](https://github.com/mozilla/pdf.js.jbig2/blob/main/LICENSE) license so `jbig2.js` is released under [Apache-2.0](https://github.com/mozilla/pdf.js.jbig2/blob/main/LICENSE) license too.
