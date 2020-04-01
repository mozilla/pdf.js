It's *very highly* recommended to *not* use these files, but rather use the
pre-built library as found in e.g. the `/build`, `/web`, and `/image_decoders`
folders in the root of this repository.

Please note that the "lib" build target exists mostly to enable unit-testing in
Node.js/Travis, and that you'll need to handle e.g. any necessary polyfills
and/or Node.js dependencies yourself if using the files in this folder.
