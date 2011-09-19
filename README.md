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

**Hello world**

For a "hello world" example, take a look at:

    examples/helloworld/

This example illustrates the bare minimum ingredients for integrating pdf.js
in a custom project.



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


## Contributing

pdf.js is a community-driver project, so contributors are always welcome. 
Simply fork our repo and contribute away. A great place to start is our
open issues. 

For better consistency and long-term stability, please do look around the 
code and try to follow our conventions.


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
