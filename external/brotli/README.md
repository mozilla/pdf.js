## Release

In order to get the file `decode.js`:
* `gulp release-brotli --hash` followed by the git hash of the revision.

The task exports `makeBrotliDecode` instead of calling it, so the decoder
is only initialized when needed.

## Licensing

[brotli](https://github.com/google/brotli/) is under [MIT License](https://github.com/google/brotli/blob/master/LICENSE)
