import {initUI} from "./ui.js";

export function init(app) {
  console.log("scholarly initialized:", app);
  initUI();

  app.eventBus.on("pagerendered", function(event) {
    console.log("scholarly page rendered:", event);

    let canvas = event.source.canvas;
    if(event.cssTransform) {
      return;
    }



    canvas.parentElement.parentElement.addEventListener("click", (e) => {
      console.log("Page", event.pageNumber, "was clicked")
      console.log(e);
      onClick(e, canvas);
    })
  });
}

function onClick(e, canvas) {
  let bb = canvas.getBoundingClientRect();
  let relX = (e.x - bb.left) / bb.width;
  let relY = (e.y - bb.top) / bb.height;
  renderRect(canvas, relX, relY, 0.1, 0.1);

  let page = canvas.parentElement.parentElement;
  let span = document.createElement("span");
  span.innerText = "hey!";
  span.style.position = "absolute";
  span.style.top = (e.y - bb.top) + "px";
  span.style.left = (e.x - bb.left) + "px";
  page.appendChild(span);
}

function renderRect(canvas, relX, relY, relW, relH) {
  let ctx = canvas.getContext('2d');
  ctx.fillStyle = 'green';

  let absH = canvas.height * relH;
  let absW = canvas.width * relW;
  let absY = canvas.height * relY;
  let absX = canvas.width * relX;

  ctx.fillStyle = "rgba(255, 0, 0, 0.2)";
  ctx.fillRect(absX, absY, absW, absH);
}


function renderStickyNote(canvas, relPos, content, color, userName, profilePictureURL) {

}

function renderHighlight(canvas, relPos, relSize, color, userName, profilePictureURL) {

}
