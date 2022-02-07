# PDF.js -- Certify Edition

## Local Development
To build and test:
```
npm install -g gulp-cli
npm install
gulp generic
```

In order to test this within CertifyApp, you need to link the package into the CertifyApp project and then run `npm run update-pdfjs`
to copy the library to the public-facing directory. Instructions on npm linking can be found [here](https://chromeriver.atlassian.net/wiki/spaces/CE/pages/2310012973/Dependency+package+development+with+npm)

## Releasing
A Github Action is available for releasing a new version of the package [here](https://github.com/CertifyInc/pdf.js/actions/workflows/npm-publish.yml).
Select "Run workflow" in the top-right, base off of `master`, and select the appropriate Release Type in accordance with semantic versioning.

