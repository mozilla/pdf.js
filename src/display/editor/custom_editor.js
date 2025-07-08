import { AnnotationEditor } from "./editor.js";
import { AnnotationEditorType } from "../../shared/util.js";

class CustomEditor extends AnnotationEditor {
  static _editorType = AnnotationEditorType.CUSTOM;
  static _type = "custom";

  constructor(params) {

    super({ ...params, name: "customEditor" });
  }
  render() {
    if (this.div) {
      return this.div;
    }
    const editor =  super.render();
    
    this.eventBus.dispatch("annotation-editor-event", {
      source: this,
      type: this.isUserCreated
        ? "annotationCreatedByUser"
        : "annotationCreated",
      page: this.pageIndex + 1,
      editorType: this.constructor.name,
    });

    return editor;
  }

  async addEditToolbar() {
    return null;
  }
}
export { CustomEditor };
