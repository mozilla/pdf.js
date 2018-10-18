# Build

I'm not sure why we've done it so weirdly, but the way to deploy this seems to be:

1. Make a new branch based off of the one currently referenced in web-client/package.json.
2. Note that the .gitignore doesn't ignore the build directory, like it does in master.
3. Run `gulp minified` and check in the build directory.
4. Update web-client/package.json to reference your new branch.

