---
title: Examples
template: layout.jade
---

## Hello World Walkthrough

[Full source](https://github.com/mozilla/pdf.js/tree/master/examples/helloworld)

PDF.js heavily relies on the use of [Promises](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise). If promises are new to you, it's recommended you become familiar with them before continuing on.

### Document

The object structure of PDF.js loosely follows the structure of an actual PDF. At the top level there is a document object. From the document, more information and individual pages can be fetched. To get the document:

```js
PDFJS.getDocument('helloworld.pdf')
```

Remember though that PDF.js uses promises, so the above will return a promise that is resolved with the document object.

```js
PDFJS.getDocument('helloworld.pdf').then(function(pdf) {
  // you can now use *pdf* here
});
```

### Page
Now that we have the document, we can get a page. Again, this uses promises.

```js
pdf.getPage(1).then(function(page) {
  // you can now use *page* here
});
```

### Rendering the Page
Each PDF page has its own viewport which defines the size in pixels(72DPI) and initial rotation. By default the viewport is scaled to the original size of the PDF, but this can be changed by modifying the viewport. When the viewport is created an initial transformation matrix will also be created that takes into account the desired scale, rotation, and it transforms the coordinate system (the 0,0 point in PDF documents the bottom-left whereas canvas 0,0 is top-left).

```js
var scale = 1.5;
var viewport = page.getViewport(scale);

var canvas = document.getElementById('the-canvas');
var context = canvas.getContext('2d');
canvas.height = viewport.height;
canvas.width = viewport.width;

var renderContext = {
  canvasContext: context,
  viewport: viewport
};
page.render(renderContext);
```

Alternatively, if you want the canvas to render to a certain pixel size you could do the following:

```js
var desiredWidth = 100;
var viewport = page.getViewport(1);
var scale = desiredWidth / viewport.width;
var scaledViewport = page.getViewport(scale);
```
