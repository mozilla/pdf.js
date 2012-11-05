
function isPdfDownloadable(url) {
  return url.indexOf('pdfjs.action=download') >= 0;
}

if (isPdfDownloadable(document.location.href)) {
  history.replaceState('', document.title, window.location.pathname);

  // Here we're abusing that this content-script will fail to
  // load if there's an syntax error in the document. This will make Chrome
  // fallback on the internal PDF viewer
  return;
}

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
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    embed.parentNode.replaceChild(iframe, embed);
    iframe.focus();

    window.addEventListener('hashchange', function() {
      if (isPdfDownloadable(document.location.href)) {
        // We're reloading the document, so the PDF can be rendered in the
        // internal viewer.
        document.location.reload();
      }
      // chrome doesn't give us access to the iframe's window, so
      // we work around it http://crbug.com/20773
      var script = document.createElement('script');
      script.text = "frames[0].postMessage('hashchange:'" +
        " + document.location.hash, '" + chrome.extension.getURL('') + "');";
      document.body.appendChild(script);
      script.parentNode.removeChild(script);
    });
  } else {
    window.webkitRequestAnimationFrame(tryInsertIframe);
  }
}

window.webkitRequestAnimationFrame(tryInsertIframe);
