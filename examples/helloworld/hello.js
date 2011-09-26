//
// See README for overview
//


//
// Ajax GET request, for binary files
// (like jQuery's $.get(), but supports the binary type ArrayBuffer)
//
var ajaxGet = function(url, callback){
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.mozResponseType = xhr.responseType = 'arraybuffer';
  xhr.expected = (document.URL.indexOf('file:') === 0) ? 0 : 200;
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4 && xhr.status === xhr.expected) {
      var data = (xhr.mozResponseArrayBuffer || xhr.mozResponse ||
                  xhr.responseArrayBuffer || xhr.response);

      callback(data);
    }
  };
  xhr.send(null);  
}

//
// This is where the fun happens
//
ajaxGet('helloworld.pdf', function(data){
  //
  // Instantiate PDFDoc with PDF data
  //
  var pdf = new PDFDoc(data);
  var page = pdf.getPage(1);
  var scale = 1.5;

  //
  // Prepare canvas using PDF page dimensions
  //
  var canvas = document.getElementById('the-canvas');
  var context = canvas.getContext('2d');
  canvas.height = page.height * scale;
  canvas.width = page.width * scale;  

  //
  // Render PDF page into canvas context
  //
  page.startRendering(context);
});
