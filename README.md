# pdf.js

 

## Overview

pdf.js is an HTML5 technology experiment that explores building a faithful
and efficient Portable Document Format (PDF) renderer without native code 
assistance.

pdf.js is community-driven and supported by Mozilla Labs. Our goal is to 
create a general-purpose, web standards-based platform for parsing and 
rendering PDFs, and eventually release a PDF reader extension powered by 
pdf.js. Integration with Firefox is a possibility if the experiment proves 
successful.



## Getting started

**Online demo**

For an online demo, visit:

  http://andreasgal.github.com/pdf.js/web/viewer.html

This demo provides an interactive interface for displaying and browsing PDFs
using the pdf.js API.

**Getting the code**

To get a local copy of the current code, clone it using git:

```bash
    git clone git://github.com/andreasgal/pdf.js.git pdfjs
    cd pdfjs
```

Next, you need to start a local web server as some browsers don't allow opening
PDF files for a file:// url:

```bash
  make server
```

If everything worked out, you can now serve 

  http://localhost:8888/web/viewer.html

You can also view all the test pdf files on the right side serving

  http://localhost:8888/test/pdfs/?frame



**Hello world**

For a "hello world" example, take a look at:

    examples/helloworld/

This example illustrates the bare minimum ingredients for integrating pdf.js
in a custom project.



## Contributing

pdf.js is a community-driver project, so contributors are always welcome. 
Simply fork our repo and contribute away. A great place to start is our
open issues. For better consistency and long-term stability, please do look around the 
code and try to follow our conventions.

If you __don't want to hack__ on the project or have short spare times, you still
can help! Just open PDFs in the 
[online demo](http://andreasgal.github.com/pdf.js/web/viewer.html) and report 
any breakage in rendering.



## Running the Tests

pdf.js comes with browser-level regression tests that allow one to probe 
whether it's able to successfully parse PDFs, as well as compare its output
against reference images, pixel-by-pixel.

To run the tests, first configure the browser manifest file at:

    test/resources/browser_manifests/browser_manifest.json

Sample manifests for different platforms are provided in that directory.

To run all the bundled tests, type:

    $ make test

and cross your fingers. Different types of tests are available, see the test
manifest file at:

    test/test_manifest.json

The test type `eq` tests whether the output images are identical to reference 
images. The test type `load` simply tests whether the file loads without 
raising any errors.


## Additional resources

Our demo site is here:

  http://andreasgal.github.com/pdf.js/web/viewer.html

You can read more about pdf.js here:

  http://andreasgal.com/2011/06/15/pdf-js/

  http://blog.mozilla.com/cjones/2011/06/15/overview-of-pdf-js-guts/

Follow us on twitter: @pdfjs

  http://twitter.com/#!/pdfjs

Join our mailing list: 

  dev-pdf-js@lists.mozilla.org
  
Subscribe either using lists.mozilla.org or Google Groups: 
  
  https://lists.mozilla.org/listinfo/dev-pdf-js

  https://groups.google.com/group/mozilla.dev.pdf-js/topics

Talk to us on IRC:

  #pdfjs on irc.mozilla.org
  
## Additional resources to understand the structure of PDF

A really basic overview of PDF is described here:

  http://partners.adobe.com/public/developer/en/livecycle/lc_pdf_overview_format.pdf

A more detailed file example:

  http://gnupdf.org/Introduction_to_PDF
  
The PDF specification itself is an ISO and not free available. However, there is
a "PDF Reference" from Adobe:

  http://wwwimages.adobe.com/www.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/pdf_reference_1-7.pdf

Recommanded chapters to read: "2. Overview", "3.4 File Structure", 
"4.1 Graphics Objects" that lists the PDF commands.

