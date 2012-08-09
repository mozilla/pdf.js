
function isPdfDownloadable(url) {
  return url.indexOf('pdfjs.action=download') >= 0;
}

if (isPdfDownloadable(document.location.href))
  return;

var viewerPage = 'content/web/viewer.html';
var url = chrome.extension.getURL(viewerPage) +
  '?file=' + encodeURIComponent(document.location.href);

var embed = document.querySelector('embed');
var iframe = document.createElement('iframe');
iframe.src = url;
iframe.style.width = '100%';
iframe.style.height = '100%';
iframe.style.border = 0;
embed.parentNode.replaceChild(iframe, embed);

// TODO: Synchronize title, focus iframe.
