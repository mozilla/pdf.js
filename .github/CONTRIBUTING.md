# PDF.js issue reporting

The issues are used to track both bugs filed by users and specific work items for developers. Try to file one issue per problem observed. Please specify a valid title (e.g. "Glyph spacing is incorrect" instead of "PDF.js does not work") and provide more details about the issue: link to the PDF, location in the PDF, screenshot, browser version, operating system, PDF.js version and JavaScript console warning/error messages. Issues that do not have enough details provided will be closed as invalid/incomplete.

If the issue is related to errors produced by a specific PDF, please always include the PDF by providing a URL where contributors can download it. Without a PDF for reproduction, such issues will be closed. We understand that many PDFs contain sensitive information, however having a PDF is essential to resolving the issue and building our regression testing suite. If possible, try creating a reduced example exhibiting the problem but not containing sensitive data. Also small PDFs are best suited for our regression testing. If an important issue only shows on sensitive PDFs, contributors might be willing to accept these PDFs via a secure exchange.

The issue tracking system is designed to record a single technical problem. A bug report is something where a developer/contributor can work on. The GitHub issue tracker is not a good place for general, not well thought out or unworkable ideas. Most likely a discussion-type issue will not be addressed for a long time or closed as invalid. The best place for general discussions is our #pdfjs IRC channel on irc.mozilla.org.

If you are developing a custom solution, first check the examples at https://github.com/mozilla/pdf.js#learning and search existing issues. If this does not help, please prepare a short well-documented example that demonstrates the problem and make it accessible online on your website, JS Bin, GitHub, etc. before opening a new issue or contacting us on the IRC channel -- keep in mind that just code snippets won't help us troubleshoot the problem.

Note that the translations for PDF.js in the `l10n` folder are synchronized with the Nightly channel of Mozilla Firefox. This means that we will only accept pull requests that add strings currently missing in the Nightly channel, but keep in mind that the changes will be overwritten when we synchronize again.

See also:
- https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
- https://github.com/mozilla/pdf.js/wiki/Contributing
- https://github.com/mozilla/pdf.js/blob/master/README.md
