// Stores all created highlights
var highlights = [];
// Stores all created sticky notes
var stickyNotes = [];
// the mouse down event for creating highlights
let es;

let tool;

export function init(app) {
  app.eventBus.on("pagerendered", function(event) {
    let canvas = event.source.canvas;
    if(event.cssTransform) {
      return;
    }

    drawAnnotations(event);

    let highlightSelected = true;

    if (highlightSelected) {
      createHighlight(canvas, event.pageNumber);
    }

    let stickyNoteSelected = false;
    if (stickyNoteSelected) {
      createStickyNote(canvas);
    }
  });
}

function createHighlight(canvas, page) {
  canvas.parentElement.parentElement.addEventListener("mousedown", (e) => {
    es = e;
    startDrag(e);
    disableSelect(e);
  })

  canvas.parentElement.parentElement.addEventListener("mouseup", (ee) => {
    onDragEnd();

    let bb = canvas.getBoundingClientRect();
    let relX = (es.x - bb.left) / bb.width;
    let relY = (es.y - bb.top) / bb.height;
    let relW = (ee.x - es.x) / bb.width;
    let relH = (ee.y - es.y) / bb.height;
    let color = { r: 0, g: 255, b: 90 };
    renderRect(canvas, relX, relY, relW, relH, color);

    highlights.push( { page, relPos: { x: relX, y: relY }, relSize: { width: relW, height: relH }, color } );
  })
}

function createStickyNote(canvas) {
  canvas.parentElement.parentElement.addEventListener("click", (e) => {
    onClick(e, canvas);
  })
}

/**
 * Draws the existing annotations at their corresponding positions.
 *
 * @param event the page render event
 */
function drawAnnotations(event) {
  highlights.forEach(element => {
    if (element.page === event.pageNumber) {
      renderHighlight(event.source.canvas, element.relPos, element.relSize, element.color, "Fritz", "abc");
    }
  });

  stickyNotes.forEach(element => {
    if (element.page === event.page) {

    }
  });
}

function onClick(e, canvas) {
  let bb = canvas.getBoundingClientRect();
  let relX = (e.x - bb.left) / bb.width;
  let relY = (e.y - bb.top) / bb.height;
  renderRect(canvas, relX, relY, 0.1, 0.1);

  let page = canvas.parentElement.parentElement;
  let span = document.createElement("span");
  span.style.position = "absolute";
  span.style.top = (e.y - bb.top) + "px";
  span.style.left = (e.x - bb.left) + "px";
  span.setAttribute("type", "text");
  span.setAttribute("value", "Hello World!");
  page.appendChild(span);
}

/**
 * Draws a colored rectangle at the given position.
 *
 * @param canvas the canvas on which to draw
 * @param relX the relative x position
 * @param relY the relative y position
 * @param relW the relative width of the rectangle
 * @param relH the relative height of the rectangle
 */
function renderRect(canvas, relX, relY, relW, relH, color) {
  let ctx = canvas.getContext('2d');

  let absX = canvas.width * relX;
  let absY = canvas.height * relY;
  let absW = canvas.width * relW;
  let absH = canvas.height * relH;
  let r = color.r;
  let g = color.g;
  let b = color.b;

  ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
  ctx.fillRect(absX, absY, absW, absH);
}

/**
 * Prevents text from being selected while drawing a rectangle.
 *
 * @param event the mouse down event
 */
function disableSelect(event) {
  event.preventDefault();}

function startDrag(event) {
  window.addEventListener('mouseup', onDragEnd);
  window.addEventListener('selectstart', disableSelect);
}

function onDragEnd() {
  window.removeEventListener('mouseup', onDragEnd);
  window.removeEventListener('selectstart', disableSelect);
}

/**
 * Renders a sticky note.
 *
 * @param canvas the canvas on which to draw
 * @param relPos the relative position of the annotation on the PDF file
 * @param content the textual content
 * @param color the color of the rectangle
 * @param userName the username of the annotation creator
 * @param profilePictureURL the profile picture of the annotation creator
 */
function renderStickyNote(canvas, relPos, content, color, userName, profilePictureURL) {

}

/**
 * Renders a highlight.
 *
 * @param canvas the canvas on which to draw
 * @param relPos the relative position of the annotation on the PDF file
 * @param relSize the relative size of the rectangle
 * @param color the color of the rectangle
 * @param userName the username of the annotation creator
 * @param profilePictureURL the profile picture of the annotation creator
 */
function renderHighlight(canvas, relPos, relSize, color, userName, profilePictureURL) {
  renderRect(canvas, relPos.x, relPos.y, relSize.width, relSize.height, color);
}
