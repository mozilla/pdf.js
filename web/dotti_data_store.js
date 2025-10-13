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
    if (annotationSigner.organizationId) {
      const validPermissions = this.profile.permissions.filter(
        p => p.organizationId === annotationSigner.organizationId
      );
      return !!validPermissions.length;
    }
    return annotationSigner.phone === this.profile.phone;
  },
  sameSortNum(annotationSigner) {
    return annotationSigner.sortNum === this.task.sortNum;
  },
  getPDFURL() {
    return this.task.fileContents[0].url;
  },
  getSignImageURLByKey(key) {
    return (
      this.task.fileContents[0].signContents.find(st => st.key === key)?.url ??
      ""
    );
  },
  getRawAnnotations() {
    return this.task.fileContents[0].attr?.annotations;
  },
  getRawSignAnnotations() {
    return this.task.fileContents[0].signContents;
  },
  isProcessingTask() {
    return !!this.task && this.task.taskStatus === "PROCESSING";
  },
  isPlaceholderEditor(editor) {
    return editor.isSignaturePlaceholder || editor.isStampPlaceholder;
  },
  isSignaturePlaceholderEditor(editor) {
    return editor.isSignaturePlaceholder;
  },
  isStampPlaceholderEditor(editor) {
    return editor.isStampPlaceholder;
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
              if (
                this.sameSigner(editor.signer) &&
                this.sameSortNum(editor.signer)
              ) {
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
      for (const rsa of rawSignAnnotations) {
        // signContents can contain 2 things:
        // 1. just pure key and url for saving stamp image
        // 2. real annotation data
        const editor = rsa.attr;
        if (editor) {
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
    }
  },
  onSubmitSignature() {
    const uiManager = window.PDFViewerApplication.pdfViewer.annotationEditorUIManager;
    const signatureEditors = uiManager.getAllSignatureEditors();
    const signaturePlaceholderEditors = uiManager.getAllSignaturePlaceholderEditors();
    const stampPlaceholderEditors = uiManager.getAllStampPlaceholderEditors();
    const unsignedStampPlaceholderEditors = uiManager.getAllUnsignedStampPlaceholderEditors();
    if (signatureEditors.length !== signaturePlaceholderEditors.length) {
      alert("请先签名，签名完成后再提交");
      return;
    }
    if (unsignedStampPlaceholderEditors.length > 0) {
      alert("请盖章完成后再提交");
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
      for (const editor of stampPlaceholderEditors) {
        const serialized = editor.serialize(true);
        serialized.isStampPlaceholder = false;
        if (serialized) {
          signatureEditorsSerialized.push(serialized);
        }
      }
      this.submitSignatureTask(signatureEditorsSerialized);
    }
  },
  submitSignatureTask(signatureAnnotations) {
    if (this.task) {
      const annotations = this.task.fileContents[0].attr.annotations;
      // find out this task is individual or entity
      const entityAnnotations = annotations.filter(annotation => {
        if (
          annotation.signer.organizationId &&
          this.sameSortNum(annotation.signer)
        ) {
          return true;
        }
        return false;
      });
      const isStampingTask = entityAnnotations.length > 0;

      // Exclude all placeholders for this task
      const filteredAnnotations = annotations.filter(annotation => {
        if (
          annotation.isSignaturePlaceholder ||
          annotation.isStampPlaceholder
        ) {
          return false;
        }
        return true;
      });
      this.task.fileContents[0].attr.annotations = filteredAnnotations;

      const mergedSignatureAnnotations = this.task.fileContents[0].signContents ?? [];
      signatureAnnotations.forEach(sa => {
        mergedSignatureAnnotations.push({
          attr: sa,
          checksum: null,
          imgProcessArg: null,
          key: null,
          signType: null,
          url: null,
        });
      });
      this.task.fileContents[0].signContents = mergedSignatureAnnotations;

      const data = {
        fileContents: this.task.fileContents,
        taskId: this.task.taskId,
        workflowId: this.task.workflow.workflowId,
        taskAction: isStampingTask ? "STAMPED" : "SIGNED",
      };

      const submitTaskActionUrl = isStampingTask
        ? "https://i-sign.cn:9102/isign/v1/submit-task"
        : "https://i-sign.cn:9102/isign/v1/pre-submit-task";

      const submitTaskActionUrl1 = "https://i-sign.cn:9102/isign/v1/submit-task";

      fetch(submitTaskActionUrl1, {
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
            if (isStampingTask) {
              alert("提交成功");
              location.reload();
            } else {
              alert("请进行人脸核身");
              // this.requestFacialRecognition(res.data);
            }
          } else {
            if (res.message === 'not processing') {
              alert("该任务已办结");
            } else {
              alert("提交失败，请检查网络后重试");
            }
          }
        });
    }
  },
  requestFacialRecognition(preSubmitTaskId) {
    const data = {
      idCard: this.profile.idCard,
      name: this.profile.idName,
      redirectUrl: `https://i-sign.cn?pre_submit_task_id=${preSubmitTaskId}_${this.token}`,
    };

    fetch("https://i-sign.cn:9103/v1/tencent/h5-face-auth", {
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
          open(res.data.authUrl, "_self");
        } else {
          alert("提交失败，请检查网络后重试");
        }
      });
  },
};

export default DottiStore;
