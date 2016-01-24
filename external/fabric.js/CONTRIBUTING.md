# Contributing to Fabric

1. [Questions?!?](#questions)
2. [Issue tracker](#issue-tracker)
3. [Issue tracker guidelines](#issue-tracker-guidelines)
4. [Pull requests](#pull-request)
5. [Pull request guidelines](#pull-request-guidelines)

## Questions?!?

To get your questions answered, please ask/search on [Fabric's google group], [StackOverflow] or on Fabric's IRC channel (irc://irc.freenode.net/#fabric.js).
Please do not open an issue if you're not sure it's a bug or if it's not a feature/suggestion.

For news about Fabric you can follow [@fabric.js], [@kangax], or [@kienzle_s] on Twitter.
Demos and examples can be found on [jsfiddle], [codepen.io] and [fabricjs.com].

## Issue tracker

If you are sure that it's a bug in Fabric.js or a suggestion, open a new [issue] and try to answer the following questions:

- What did you do?
- What did you expect to happen?
- What happened instead?

### Issue tracker guidelines

- **Search:** Before opening a new issue please [search](https://github.com/kangax/fabric.js/search?q=&ref=cmdform&type=Issues) Fabric's existing issues.

- **Title:** Choose an informative title.

- **Description:** Use the questions above to describe the issue. Add logs, screenshots or videos if that makes sense.

- **Test case:** Please post code to replicate the bug - best on [jsfiddle](http://jsfiddle.net). Ideally a failing test would be
perfect, but even a simple script demonstrating the error would suffice. You could use [this jsfiddle template](http://jsfiddle.net/fabricjs/Da7SP/) as a
starting point.

- **Fabric.js version:** Make sure to specify which version of Fabric.js you are using. The version can be found in [fabric.js file](https://github.com/kangax/fabric.js/blob/master/dist/fabric.js#L5) or just by executing `fabric.version` in the browser console.

## Pull requests

We are very grateful for your pull requests! This is your chance to improve Fabric for everyone else.

### Pull request guidelines

Here are a few notes you should take into account:

- **Code style, notes:** Make sure you have complied with the [guidelines](https://github.com/kangax/fabric.js/wiki/How-to-contribute-to-Fabric#code-style-notes)

- **Distribution files:** Do your changes only in the [source files](https://github.com/kangax/fabric.js/tree/master/src). Don't include the [distribution files](https://github.com/kangax/fabric.js/tree/master/dist) in your commit.

- **Add tests**: Tests are always a great addition - invest a little time and expand the [unit tests suite](https://github.com/kangax/fabric.js/tree/master/test/unit). More informations about [QUnit](http://qunitjs.com/) tests can be found in the [wiki](https://github.com/kangax/fabric.js/wiki/How-to-contribute-to-Fabric#testing-fabric).

- **Add documentation:** Fabric uses [JSDoc 3] for documentation. The generated documentation can be found at [fabricjs.com](http://fabricjs.com/docs).

- **Create topic branches.** Don't use your master branch for pull request. It's better to create a new branch for every pull request.

- **One pull request per feature/bug**. If you want to do more than one thing, send multiple pull requests.

- **And there you go!** If you still have questions we're always happy to help. Also feel free to consult [wiki](https://github.com/kangax/fabric.js/wiki/How-to-contribute-to-Fabric).

[Fabric's google group]: https://groups.google.com/forum/#!forum/fabricjs
[stackoverflow]: http://stackoverflow.com/questions/tagged/fabricjs
[@fabric.js]: https://twitter.com/fabricjs
[@kangax]: https://twitter.com/kangax
[@kienzle_s]: https://twitter.com/kienzle_s
[jsfiddle]: http://jsfiddle.net/user/fabricjs/fiddles
[codepen.io]: http://codepen.io/tag/fabricjs
[fabricjs.com]: http://fabricjs.com/demos
[JSDoc 3]: http://usejsdoc.org/
[issue]: https://github.com/kangax/fabric.js/issues
