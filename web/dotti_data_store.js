/* eslint-disable no-alert */
const DottiStore = {
  token: null,
  profile: null,
  task: null,
  displayMode: "view",
  signingStampEditor: null,
  sha256: null,
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
    return this.isFinishedWorkflow()
      ? this.task.fileContents[1].url
      : this.task.fileContents[0].url;
  },
  getSignImageURLByKey(key) {
    return (
      this.task.fileContents[0].signContents.find(st => st.key === key)?.url ??
      ""
    );
  },
  getCurrentSigner() {
    // 如果是个签名任务，则直接拿Signer里的信息，如果是盖章任务，则需要拿profile里的信息，这里默认加入组织的用户必须已经实名认证过
    const signer = this.task.workflow.signers.find(
      s => s.sortNum === this.task.sortNum
    );
    if (signer.organizationId) {
      return {
        idName: this.profile.idName,
        idCard: this.profile.idCard,
        phone: this.profile.phone,
      };
    }
    return {
      idName: signer.name,
      idCard: signer.idCard,
      phone: signer.phone,
    };
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
  isFinishedWorkflow() {
    return this.task.fileContents.length === 2;
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
    if (!this.isFinishedWorkflow()) {
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
            const annotation = editor.annotation;
            if (annotation.pageIndex === layer.pageIndex) {
              layer.deserialize(annotation).then(deserializedEditor => {
                if (!deserializedEditor) {
                  return;
                }
                layer.add(deserializedEditor);
              });
            }
          }
        }
      }
    }
  },
  onSubmitSignature() {
    const userConsentDialog = document.getElementById("userConsentDialog");
    userConsentDialog.showModal();
  },
  processSubmitSignature() {
    const uiManager =
      window.PDFViewerApplication.pdfViewer.annotationEditorUIManager;
    const signatureEditors = uiManager.getAllSignatureEditors();
    const signaturePlaceholderEditors =
      uiManager.getAllSignaturePlaceholderEditors();
    const stampPlaceholderEditors = uiManager.getAllStampPlaceholderEditors();
    const unsignedStampPlaceholderEditors =
      uiManager.getAllUnsignedStampPlaceholderEditors();
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

      const mergedSignatureAnnotations =
        this.task.fileContents[0].signContents ?? [];
      signatureAnnotations.forEach(sa => {
        mergedSignatureAnnotations.push({
          attr: {
            annotation: sa,
          },
          checksum: null,
          imgProcessArg: null,
          key: sa.signer.organizationId ? sa.signer.email : null, // in org, email is the stamp image's key
          signType: null,
          url: sa.signer.organizationId
            ? this.getSignImageURLByKey(sa.signer.email)
            : null,
        });
      });
      this.task.fileContents[0].signContents = mergedSignatureAnnotations;

      const data = {
        fileContents: this.task.fileContents,
        taskId: this.task.taskId,
        workflowId: this.task.workflow.workflowId,
        taskAction: isStampingTask ? "STAMPED" : "SIGNED",
      };

      const submitTaskActionUrl =
        "https://i-sign.cn:9102/isign/v1/pre-submit-task";

      fetch(submitTaskActionUrl, {
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
            alert("请进行人脸核身以授权平台代签");
            this.requestFacialRecognition(res.data);
          } else {
            if (res.message === "not processing") {
              alert("该任务已办结");
            } else {
              alert("提交失败，请检查网络后重试");
            }
          }
        });
    }
  },
  requestFacialRecognition(preSubmitTaskId) {
    const requestor = this.getCurrentSigner();
    const data = {
      idCard: requestor.idCard,
      name: requestor.idName,
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
  /**
   * For testing purpose only
   * @param signatureAnnotations
   */
  submitSignatureTaskWithoutFacialRecognition(signatureAnnotations) {
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

      const mergedSignatureAnnotations =
        this.task.fileContents[0].signContents ?? [];
      signatureAnnotations.forEach(sa => {
        mergedSignatureAnnotations.push({
          attr: {
            annotation: sa,
          },
          checksum: null,
          imgProcessArg: null,
          key: sa.signer.organizationId ? sa.signer.email : null, // in org, email is the stamp image's key
          signType: null,
          url: sa.signer.organizationId
            ? this.getSignImageURLByKey(sa.signer.email)
            : null,
        });
      });
      this.task.fileContents[0].signContents = mergedSignatureAnnotations;

      const data = {
        fileContents: this.task.fileContents,
        taskId: this.task.taskId,
        workflowId: this.task.workflow.workflowId,
        taskAction: isStampingTask ? "STAMPED" : "SIGNED",
      };

      const submitTaskActionUrl = "https://i-sign.cn:9102/isign/v1/submit-task";

      fetch(submitTaskActionUrl, {
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
            if (res.message === "not processing") {
              alert("该任务已办结");
            } else {
              alert("提交失败，请检查网络后重试");
            }
          }
        });
    }
  },
  async calculateSha256(pdfDocument) {
    // Compute SHA-256 before rendering
    const data = await pdfDocument.getData(); // Uint8Array of full PDF bytes
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    // console.log("文件指纹(SHA-256):", hashHex);
    this.sha256 = hashHex;
    document.getElementById(
      "signingConfirmDialogDocumentFingerprintDiv"
    ).innerText = hashHex;
  },
  saveUserConsents() {
    const data = {
      userId: "",
      company_id: "",
      stamp_id: "", // 印章ID
      ipAddress: "",
      timestamp: "",
      face_auth_result: "",
      consentTextId: "v2025.10.18-1",
      docHash: this.sha256,
      taskId: this.task.taskId,
      userAgent: navigator.userAgent,
      workflowId: this.task.workflow.workflowId,
    };
    fetch("https://i-sign.cn:9102/isign/v1/consents", {
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
          // this.processSubmitSignature();
        } else {
          alert(res.message);
        }
      });
  },
};

export default DottiStore;
