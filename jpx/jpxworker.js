/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

arguments = [];
NO_RUN = 1;

importScripts('openjpeg.cc.js');

var components, messages;

function print(text) {
  messages += text + '\n';
}

// missing function?
function _lrintf(x) {
  return (x > 0) ? -Math.round(-x) : Math.round(x);
}

addEventListener('message', function workerMessage(e) {
  var data = e.data.data, tag = e.data.tag;

  try {
    messages = '';
    components = [];

    run();

    _STDIO.prepare('image.jp2', data);
    callMain(['-i', 'image.jp2', '-o', 'image.raw']);
    var outputFile = _STDIO.filenames['image.raw'];
    if (!outputFile)
      throw 'Output file was not generated';
    var output = _STDIO.streams[outputFile].data;

    var re = /Component (\d+) characteristics: (\d+)x(\d+)x(\d+) unsigned/g;
    var m, i, j;
    while ((m = re.exec(messages)) != null) {
      components.push({
        component: m[1] | 0,
        width: m[2] | 0,
        height: m[3] | 0
      });
    }

    var imageWidth = 0, imageHeight = 0;
    var componentsLength = components.length;
    for (i = 0; i < componentsLength; ++i) {
      imageWidth = Math.max(imageWidth, components[i].width);
      imageHeight = Math.max(imageHeight, components[i].height);
    }
    var offset = 0;
    for (i = 0; i < componentsLength; ++i) {
      components[i].scaleX = imageWidth / components[i].width;
      components[i].scaleY = imageHeight / components[i].height;
      components[i].offset = offset;
      offset += components[i].width * components[i].height;
    }

    var imageData = new Uint8Array(imageWidth * imageHeight * 4);
    var position = 0;
    switch (componentsLength) {
      case 1:
        var outputLength = output.length;
        for (i = 0; i < outputLength; ++i) {
          var component = output[i];
          imageData[position++] = component;
          imageData[position++] = component;
          imageData[position++] = component;
          imageData[position++] = 255;
        }
        break;
      case 3:
        for (i = 0; i < imageHeight; ++i) {
          for (j = 0; j < imageWidth; ++j) {
            var component0 = output[
              components[0].offset + ((j / components[0].scaleX) | 0) +
              ((i / components[0].scaleY) | 0) * components[0].width];
            var component1 = output[
              components[1].offset + ((j / components[1].scaleX) | 0) +
              ((i / components[1].scaleY) | 0) * components[1].width];
            var component2 = output[
              components[2].offset + ((j / components[2].scaleX) | 0) +
              ((i / components[2].scaleY) | 0) * components[2].width];
            // TODO colorspace transform ?
            imageData[position] = component0;
            imageData[position + 1] = component1;
            imageData[position + 2] = component2;
            imageData[position + 3] = 255;
            position += 4;
          }
        }
        break;
      default:
        throw ('Unsupported amount of components: ' + componentsLength);
    }

    postMessage({
      data: imageData,
      width: imageWidth,
      height: imageHeight,
      tag: tag,
      log: messages
    });
  } catch (ex) {
    postMessage({
      error: '' + ex,
      log: messages,
      tag: tag
    });
  }
}, false);