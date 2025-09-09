const DottiStore = {
  token: null,
  profile: null,
  task: null,
  displayMode: "view",
  signingStampEditor: null,
  setToken(t) {
    this.token = t;
  },
  setProfile(t) {
    this.profile = t;
  },
  setTask(t) {
    this.task = t;
  },
  setDisplayMode(mode) {
    this.displayMode = mode;
  },
  setSigningStampEditor(editor) {
    this.signingStampEditor = editor;
  },
  sameSigner(annotationSigner) {
    return annotationSigner?.phone === this.profile.phone;
  },
  getPDFURL() {
    return this.task.fileContents[0].url;
  },
  getRawAnnotations() {
    return this.task.fileContents[0].attr?.annotations;
  },
  getRawSignAnnotations() {
    return this.task.fileContents[0].signContents?.[0].attr?.annotations;
  },
  isProcessingTask() {
    return !!this.task && this.task.taskStatus === "PROCESSING";
  },
  isPlaceholderStampEditor(editor) {
    return editor.isSignaturePlaceholder || editor.isStampPlaceholder;
  },
  canSign(editorSigner) {
    if (this.displayMode === "task") {
      return editorSigner.phone === this.profile.phone;
    }
    return false;
  },
  renderTaskAnnotationsOnLayer(layer) {
    const rawAnnotations = this.getRawAnnotations();
    if (rawAnnotations) {
      for (const editor of rawAnnotations) {
        if (editor.pageIndex === layer.pageIndex) {
          if (this.isPlaceholderStampEditor(editor)) {
            if (this.isProcessingTask()) {
              if (this.sameSigner(editor.signer)) {
                layer.deserialize(editor).then(deserializedEditor => {
                  if (!deserializedEditor) {
                    return;
                  }
                  layer.add(deserializedEditor);
                });
              }
            }
          } else {
            layer.deserialize(editor).then(deserializedEditor => {
              if (!deserializedEditor) {
                return;
              }
              layer.add(deserializedEditor);
            });
          }
        }
      }
    }
    const rawSignAnnotations = this.getRawSignAnnotations();
    if (rawSignAnnotations) {
      for (const editor of rawSignAnnotations) {
        if (editor.pageIndex === layer.pageIndex) {
          layer.deserialize(editor).then(deserializedEditor => {
            if (!deserializedEditor) {
              return;
            }
            layer.add(deserializedEditor);
          });
        }
      }
    }
  },
};

export default DottiStore;
