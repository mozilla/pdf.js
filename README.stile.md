# Build

I'm not sure why we've done it so weirdly, but the way to deploy this seems to be:

1. Branch off `stile_build`, make your changes.
2. Note that the .gitignore doesn't ignore the build directory, like it does in master.
3. Run `gulp minified` and check in the build directory.
4. PR as per normal process. Once merged into `stile_build` branch, tag
   commit using semantic versioning.
5. Update `web-client/package.json` in mono repo to reference your new tag.
