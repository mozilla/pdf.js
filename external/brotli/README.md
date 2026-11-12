## Release

In order to get the file `decode.js`:
* `gulp release-brotli --hash` followed by the git hash of the revision.

The task exports `makeBrotliDecode` instead of calling it, so the decoder
is only initialized when needed.

The task also enables "large window" support unconditionally, by forcibly
invoking `enableLargeWindow`, since no such option is currently exposed.

## Licensing

[brotli](https://github.com/google/brotli/) is under [MIT License](https://github.com/google/brotli/blob/master/LICENSE)
