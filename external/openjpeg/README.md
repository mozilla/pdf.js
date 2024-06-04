## Build

In order to generate the file `openjpeg.js`:
* git clone https://github.com/mozilla/pdf.js.openjpeg/
* the build requires to have a [Docker](https://www.docker.com/) setup and then:
  * `node build.js -C` to build the Docker image
  * `node build.js -co /pdf.js/external/openjpeg/` to compile the decoder

## Licensing

[OpenJPEG](https://www.openjpeg.org/) is under [BSD 2-clause "Simplified" License](https://github.com/uclouvain/openjpeg/blob/master/LICENSE)
and [pdf.js.openjpeg](https://github.com/mozilla/pdf.js.openjpeg/) is released under [BSD 2-clause](https://github.com/mozilla/pdf.js.openjpeg/blob/main/LICENSE) license so `openjpeg.js` is released under [BSD 2-clause](https://github.com/mozilla/pdf.js.openjpeg/blob/main/LICENSE) license too.
