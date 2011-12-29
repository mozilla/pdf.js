/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

//
// Basic AcroForms input controls rendering
//

'use strict';

var formFields = {};

function setupForm(div, content, scale) {
  function bindInputItem(input, item) {
    if (input.name in formFields) {
      var value = formFields[input.name];
      if (input.type == 'checkbox')
        input.checked = value;
      else if (!input.type || input.type == 'text')
        input.value = value;
    }
    input.onchange = function pageViewSetupInputOnBlur() {
      if (input.type == 'checkbox')
        formFields[input.name] = input.checked;
      else if (!input.type || input.type == 'text')
        formFields[input.name] = input.value;
    };
  }
  function createElementWithStyle(tagName, item) {
    var element = document.createElement(tagName);
    element.style.left = (item.x * scale) + 'px';
    element.style.top = (item.y * scale) + 'px';
    element.style.width = Math.ceil(item.width * scale) + 'px';
    element.style.height = Math.ceil(item.height * scale) + 'px';
    return element;
  }
  function assignFontStyle(element, item) {
    var fontStyles = '';
    if ('fontSize' in item)
      fontStyles += 'font-size: ' + Math.round(item.fontSize * scale) + 'px;';
    switch (item.textAlignment) {
      case 0:
        fontStyles += 'text-align: left;';
        break;
      case 1:
        fontStyles += 'text-align: center;';
        break;
      case 2:
        fontStyles += 'text-align: right;';
        break;
    }
    element.setAttribute('style', element.getAttribute('style') + fontStyles);
  }

  var items = content.getAnnotations();
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    switch (item.type) {
      case 'Widget':
        if (item.fieldType != 'Tx' && item.fieldType != 'Btn' &&
            item.fieldType != 'Ch')
          break;
        var inputDiv = createElementWithStyle('div', item);
        inputDiv.className = 'inputHint';
        div.appendChild(inputDiv);
        var input;
        if (item.fieldType == 'Tx') {
          input = createElementWithStyle('input', item);
        }
        if (item.fieldType == 'Btn') {
          input = createElementWithStyle('input', item);
          if (item.flags & 32768) {
            input.type = 'radio';
             // radio button is not supported
          } else if (item.flags & 65536) {
            input.type = 'button';
            // pushbutton is not supported
          } else {
            input.type = 'checkbox';
          }
        }
        if (item.fieldType == 'Ch') {
          input = createElementWithStyle('select', item);
          // select box is not supported
        }
        input.className = 'inputControl';
        input.name = item.fullName;
        input.title = item.alternativeText;
        assignFontStyle(input, item);
        bindInputItem(input, item);
        div.appendChild(input);
        break;
    }
  }
}

function renderPage(div, pdf, pageNumber, callback) {
  var page = pdf.getPage(pageNumber);
  var scale = 1.5;

  var pageDisplayWidth = page.width * scale;
  var pageDisplayHeight = page.height * scale;

  var pageDivHolder = document.createElement('div');
  pageDivHolder.className = 'pdfpage';
  pageDivHolder.style.width = pageDisplayWidth + 'px';
  pageDivHolder.style.height = pageDisplayHeight + 'px';
  div.appendChild(pageDivHolder);

  // Prepare canvas using PDF page dimensions
  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d');
  canvas.width = pageDisplayWidth;
  canvas.height = pageDisplayHeight;
  pageDivHolder.appendChild(canvas);


  // Render PDF page into canvas context
  page.startRendering(context, callback);

  // Prepare and populate form elements layer
  var formDiv = document.createElement('div');
  pageDivHolder.appendChild(formDiv);

  setupForm(formDiv, page, scale);
}

PDFJS.getPdf(pdfWithFormsPath, function getPdfForm(data) {
  // Instantiate PDFDoc with PDF data
  var pdf = new PDFJS.PDFDoc(data);
  
  // Rendering all pages starting from first
  var viewer = document.getElementById('viewer');
  var pageNumber = 1;
  renderPage(viewer, pdf, pageNumber++, function pageRenderingComplete() {
    if (pageNumber > pdf.numPages)
      return; // All pages rendered
    // Continue rendering of the next page
    renderPage(viewer, pdf, pageNumber++, pageRenderingComplete);
  });
});

