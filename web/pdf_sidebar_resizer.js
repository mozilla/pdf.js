
export class PDFSidebarResizer {
  constructor(options) {
    this.pdfSidebar = options.pdfSidebar;
    this.mainContainer = options.mainContainer;
    this.resizer = options.resizer;
    this.eventBus = options.eventBus;

    this.onmousemove = this.onmousemove.bind(this);
    this.onmouseup = this.onmouseup.bind(this);
    this.resizer.addEventListener('mousedown', (evt) => {
      // We want to disable transition animation so make drag resize animate
      // smoothly.
      this.eventBus.dispatch('deferupdate');
      document.addEventListener('mousemove', this.onmousemove);
      document.addEventListener('mouseup', this.onmouseup);
    });
  }

  onmousemove(evt) {
    if (evt.clientX < 200 ||
        evt.clientX > this.mainContainer.offsetWidth / 2) {
      return;
    }
    this.pdfSidebar.setWidth(evt.clientX + 'px');
  }

  onmouseup(evt) {
    // Defer pdf resize event until now.
    this.eventBus.dispatch('resumeupdate');

    document.removeEventListener('mousemove', this.onmousemove);
    document.removeEventListener('mouseup', this.onmouseup);
  }
}
