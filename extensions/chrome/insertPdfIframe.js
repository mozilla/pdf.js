
function isPdfDownloadable(url) {
  return url.indexOf('pdfjs.action=download') >= 0;
}

if (isPdfDownloadable(document.location.href))
  return;

var viewerPage = 'content/web/viewer.html';
var url = chrome.extension.getURL(viewerPage) +
  '?file=' + encodeURIComponent(document.location.href);

function tryInsertIframe() {
  var embed = document.querySelector('embed');
  if (embed) {
    var iframe = document.createElement('iframe');
    iframe.src = url + document.location.hash;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 0;
    embed.parentNode.replaceChild(iframe, embed);
    iframe.focus();

    window.addEventListener('hashchange', function () { 
      // chrome doesn't give us access to the iframe's window, so
      // we work around it http://crbug.com/20773
      var script = document.createElement('script');
      script.text = "frames[0].postMessage('hashchange:' + document.location.hash, '" + chrome.extension.getURL('') + "');";
      document.body.appendChild(script);
      script.parentNode.removeChild(script);
    });
  } else {
    window.webkitRequestAnimationFrame(tryInsertIframe);
  }
}
window.webkitRequestAnimationFrame(tryInsertIframe);

// TODO: Synchronize title.
