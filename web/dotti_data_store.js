/* eslint-disable no-alert */
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
  isPlaceholderEditor(editor) {
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
          if (this.isPlaceholderEditor(editor)) {
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
  onSubmitSignature() {
    const uiManager = window.PDFViewerApplication.pdfViewer.annotationEditorUIManager;
    const signatureEditors = uiManager.getAllSignatureEditors();
    const placeholderEditors = uiManager.getAllSignaturePlaceholderEditors();
    if (signatureEditors.length !== placeholderEditors.length) {
      alert("请先签名，签名完成后再提交");
      return;
    }
    if (confirm("确认提交吗？")) {
      const signatureEditorsSerialized = [];
      for (const editor of signatureEditors) {
        const serialized = editor.serialize(true);
        if (serialized) {
          signatureEditorsSerialized.push(serialized);
        }
      }
      this.submitSignatureTask(signatureEditorsSerialized);
    }
  },
  submitSignatureTask(signatureAnnotations) {
    if (this.task) {
      // Exclude all placeholders for this task
      const annotations = this.task.fileContents[0].attr.annotations;
      const filteredAnnotations = annotations.filter(annotation => {
        if (
          annotation.isSignaturePlaceholder &&
          this.sameSigner(annotation.signer)
        ) {
          return false;
        }
        return true;
      });
      this.task.fileContents[0].attr.annotations = filteredAnnotations;

      const mergedSignatureAnnotations = this.task.fileContents[0].signContents?.[0].attr.annotations ?? [];
      mergedSignatureAnnotations.push(...signatureAnnotations);
      this.task.fileContents[0].signContents = [
        {
          attr: {
            annotations: mergedSignatureAnnotations,
          },
        },
      ];

      const data = {
        fileContents: this.task.fileContents,
        taskId: this.task.taskId,
        workflowId: this.task.workflow.workflowId,
      };

      fetch("https://i-sign.cn:9102/isign/v1/submit-task", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "X-IS-Token": this.token,
          "Content-Type": "application/json",
        },
      })
        .then(response => response.json())
        .then(res => {
          if (res.success) {
            alert("提交成功");
            location.reload();
          } else {
            alert("提交失败，请检查网络后重试");
          }
        });
    }
  },
};

export default DottiStore;
