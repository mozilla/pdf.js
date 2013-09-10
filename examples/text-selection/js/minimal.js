//Minimal PDF rendering and text-selection example using pdf.js by Vivin Suresh Paliath (http://vivin.net)
//This example uses a built version of pdf.js that contains all modules that it requires.
//
//
//The problem with understanding text selection was that the text selection code has heavily intertwined
//with viewer.html and viewer.js. I have extracted the parts I need out of viewer.js into a separate file
//which contains the bare minimum required to implement text selection. The key component is TextLayerBuilder,
//which is the object that handles the creation of text-selection divs. I have added this code as an external
//resource.
//
//This demo uses a PDF that only has one page. You can render other pages if you wish, but the focus here is
//just to show you how you can render a PDF with text selection. Hence the code only loads up one page.
//
//The CSS used here is also very important since it sets up the CSS for the text layer divs overlays that
//you actually end up selecting.

window.onload = function () {

    var scale = 1.5; //Set this to whatever you want. This is basically the "zoom" factor for the PDF.
    PDFJS.workerSrc = '../../src/worker_loader.js';

    function loadPdf(pdfPath) {
        var pdf = PDFJS.getDocument(pdfPath);
        pdf.then(renderPdf);
    }

    function renderPdf(pdf) {
        pdf.getPage(1).then(renderPage);
    }

    function renderPage(page) {
        var viewport = page.getViewport(scale);
        var $canvas = jQuery("<canvas></canvas>");

        //Set the canvas height and width to the height and width of the viewport
        var canvas = $canvas.get(0);
        var context = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        //Append the canvas to the pdf container div
        var $pdfContainer = jQuery("#pdfContainer");
        $pdfContainer.css("height", canvas.height + "px").css("width", canvas.width + "px");
        $pdfContainer.append($canvas);

        var canvasOffset = $canvas.offset();
        var $textLayerDiv = jQuery("<div />")
            .addClass("textLayer")
            .css("height", viewport.height + "px")
            .css("width", viewport.width + "px")
            .offset({
                top: canvasOffset.top,
                left: canvasOffset.left
            });

        //The following few lines of code set up scaling on the context if we are on a HiDPI display
        var outputScale = getOutputScale();
        if (outputScale.scaled) {
            var cssScale = 'scale(' + (1 / outputScale.sx) + ', ' +
                (1 / outputScale.sy) + ')';
            CustomStyle.setProp('transform', canvas, cssScale);
            CustomStyle.setProp('transformOrigin', canvas, '0% 0%');

            if ($textLayerDiv.get(0)) {
                CustomStyle.setProp('transform', $textLayerDiv.get(0), cssScale);
                CustomStyle.setProp('transformOrigin', $textLayerDiv.get(0), '0% 0%');
            }
        }

        context._scaleX = outputScale.sx;
        context._scaleY = outputScale.sy;
        if (outputScale.scaled) {
            context.scale(outputScale.sx, outputScale.sy);
        }

        $pdfContainer.append($textLayerDiv);

        page.getTextContent().then(function (textContent) {

            var textLayer = new TextLayerBuilder({
                textLayerDiv: $textLayerDiv.get(0),
                pageIndex: 0
            });

            textLayer.setTextContent(textContent);

            var renderContext = {
                canvasContext: context,
                viewport: viewport,
                textLayer: textLayer
            };

            page.render(renderContext);
        });
    }

    loadPdf('pdf/TestDocument.pdf');
};

