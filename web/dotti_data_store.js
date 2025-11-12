/* eslint-disable no-alert */
const DottiStore = {
  token: null,
  profile: null,
  task: null,
  workflow: null,
  displayMode: "view",
  signingStampEditor: null,
  sha256: null,
  userConsentId: null,
  jumpToNextPlaceholderIndex: 0,
  setToken(t) {
    this.token = t;
  },
  setProfile(t) {
    this.profile = t;
  },
  setTask(t) {
    this.task = t;
  },
  setWorkflow(w) {
    this.workflow = w;
  },
  setDisplayMode(mode) {
    this.displayMode = mode;
  },
  setSigningStampEditor(editor) {
    this.signingStampEditor = editor;
  },
  getFileContents() {
    return this.task ? this.task.fileContents : this.workflow.fileContents;
  },
  sameSigner(annotationSigner) {
    if (annotationSigner.organizationId) {
      const pms = this.profile.permissions ?? [];
      const validPermissions = pms.filter(
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
    const fileContents = this.getFileContents();
    return this.isFinishedWorkflow()
      ? fileContents[1].url
      : fileContents[0].url;
  },
  getSignImageURLByKey(key) {
    const fileContents = this.getFileContents();
    return fileContents[0].signContents.find(st => st.key === key)?.url ?? "";
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
  getCurrentSignerType() {
    const signer = this.task.workflow.signers.find(
      s => s.sortNum === this.task.sortNum
    );
    return signer.organizationId ? "stamp" : "signature";
  },
  getRawAnnotations() {
    const fileContents = this.getFileContents();
    return fileContents[0].attr?.annotations;
  },
  getRawSignAnnotations() {
    const fileContents = this.getFileContents();
    return fileContents[0].signContents;
  },
  isProcessingTask() {
    return !!this.task && this.task.taskStatus === "PROCESSING";
  },
  isFinishedWorkflow() {
    const fileContents = this.getFileContents();
    return fileContents.length === 2;
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
  renderAnnotationsOnLayer(layer) {
    if (this.task) {
      this.renderTaskAnnotationsOnLayer(layer);
    } else if (this.workflow) {
      this.renderWorkflowAnnotationsOnLayer(layer);
    }
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
  renderWorkflowAnnotationsOnLayer(layer) {
    if (!this.isFinishedWorkflow()) {
      const rawAnnotations = this.getRawAnnotations();
      if (rawAnnotations) {
        for (const editor of rawAnnotations) {
          if (editor.pageIndex === layer.pageIndex) {
            if (!this.isPlaceholderEditor(editor)) {
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
    if (this.validateSubmitSignature()) {
      const userConsentDialog = document.getElementById("userConsentDialog");
      userConsentDialog.showModal();
    }
  },
  getAllSignaturePlaceholdersBelongsToCurrentUser() {
    const rawAnnotations = this.getRawAnnotations();
    if (rawAnnotations) {
      return rawAnnotations.filter(annotation => {
        if (this.isSignaturePlaceholderEditor(annotation)) {
          if (
            this.sameSigner(annotation.signer) &&
            this.sameSortNum(annotation.signer)
          ) {
            return true;
          }
        }
        return false;
      });
    }
    return [];
  },
  getAllStampPlaceholdersBelongsToCurrentUser() {
    const rawAnnotations = this.getRawAnnotations();
    if (rawAnnotations) {
      return rawAnnotations.filter(annotation => {
        if (this.isStampPlaceholderEditor(annotation)) {
          if (
            this.sameSigner(annotation.signer) &&
            this.sameSortNum(annotation.signer)
          ) {
            return true;
          }
        }
        return false;
      });
    }
    return [];
  },
  findNextPlaceholderEditorPage() {
    const placeholderEditors =
      this.getCurrentSignerType() === "signature"
        ? this.getAllSignaturePlaceholdersBelongsToCurrentUser()
        : this.getAllStampPlaceholdersBelongsToCurrentUser();
    if (placeholderEditors.length) {
      const targetPage = placeholderEditors[this.jumpToNextPlaceholderIndex].pageIndex + 1;
      this.jumpToNextPlaceholderIndex += 1;
      if (this.jumpToNextPlaceholderIndex >= placeholderEditors.length) {
        this.jumpToNextPlaceholderIndex = 0;
      }
      return targetPage;
    }
    return null;
  },
  validateSubmitSignature() {
    const uiManager =
      window.PDFViewerApplication.pdfViewer.annotationEditorUIManager;
    const signatureEditors = uiManager.getAllSignatureEditors();
    const signaturePlaceholderEditors =
      this.getAllSignaturePlaceholdersBelongsToCurrentUser();
    if (signatureEditors.length !== signaturePlaceholderEditors.length) {
      alert(
        `您还剩余${signaturePlaceholderEditors.length - signatureEditors.length}处未签名，请在签名完成后再提交`
      );
      return false;
    }

    const stampEditors = uiManager.getAllStampPlaceholderEditors();
    const stampPlaceholderEditors =
      this.getAllStampPlaceholdersBelongsToCurrentUser();
    if (stampEditors.length !== stampPlaceholderEditors.length) {
      alert(
        `您还剩余${stampPlaceholderEditors.length - stampEditors.length}处未盖章，请在盖章完成后再提交`
      );
      return false;
    }

    const unsignedStampPlaceholderEditors =
      uiManager.getAllUnsignedStampPlaceholderEditors();
    if (unsignedStampPlaceholderEditors.length > 0) {
      alert(
        `您还剩余${unsignedStampPlaceholderEditors.length}处未盖章，请在盖章完成后再提交`
      );
      return false;
    }
    return true;
  },
  processSubmitSignature() {
    const uiManager =
      window.PDFViewerApplication.pdfViewer.annotationEditorUIManager;
    const signatureEditors = uiManager.getAllSignatureEditors();
    const stampPlaceholderEditors = uiManager.getAllStampPlaceholderEditors();

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
            // alert("请进行人脸核身以授权平台代签");
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
    // create face auth log
    const faceAuthLogData = {
      bizId: this.userConsentId,
      bizType: "SUBMIT_SIGNATURE_TASK",
      ipAddress: "127.0.0.1",
      userAgent: navigator.userAgent,
    };
    fetch("https://i-sign.cn:9102/isign/v1/face-auth/logs", {
      method: "POST",
      body: JSON.stringify(faceAuthLogData),
      headers: {
        "X-IS-Token": this.token,
        "Content-Type": "application/json",
      },
    })
      .then(response => response.json())
      .then(faceAuthRes => {
        if (faceAuthRes.success) {
          const faceAuthLogId = faceAuthRes.data.id;
          // request face recognition
          const requestor = this.getCurrentSigner();
          const data = {
            businessType: "SUBMIT_SIGNATURE_TASK",
            idCard: requestor.idCard,
            name: requestor.idName,
            redirectUrl: `https://i-sign.cn?pre_submit_task_id=${preSubmitTaskId}_${this.token}_${faceAuthLogId}_4`, // preSubmitTaskId_token_faceAuthLogId_bizType, bizType = 4 = SUBMIT_SIGNATURE_TASK
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
                const authURL = res.data.authUrl;
                // eslint-disable-next-line max-len
                // eslint-disable-next-line unicorn/no-single-promise-in-promise-methods
                Promise.all([
                  this.updateFaceAuthLog(res.data, faceAuthLogId),
                  // just save userConsentId to bizId of faceAuthLog.
                  // this.bindFaceAuthLogIdWithUserConsent(faceAuthLogId),
                ]).then(() => {
                  open(authURL, "_self");
                });
              } else {
                alert("提交失败，请检查网络后重试");
              }
            })
            .catch(err => {
              console.error("Face recognition flow error:", err);
              alert("网络异常，请稍后重试");
            });
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
      ipAddress: "127.0.0.1",
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
          this.userConsentId = res.data.id;
          this.processSubmitSignature(res.data.id);
        } else {
          alert(res.message);
        }
      });
  },
  updateFaceAuthLog(faceData, faceAuthLogId) {
    const url = new URL(faceData.authURL);
    const params = Object.fromEntries(url.searchParams.entries());
    const data = {
      id: faceAuthLogId,
      resultMetadata: {
        appId: params.appId,
        nonce: params.nonce,
        bizSeqNo: faceData.bizSeqNo,
        orderNo: faceData.orderNo,
        faceId: faceData.faceId,
        transactionTime: faceData.transactionTime,
        sign: params.sign,
      },
    };
    return fetch("https://i-sign.cn:9102/isign/v1/face-auth/logs", {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        "X-IS-Token": this.token,
        "Content-Type": "application/json",
      },
    });
  },
  bindFaceAuthLogIdWithUserConsent(logId) {
    const data = {
      id: this.userConsentId,
      faceVerificationLogId: logId,
    };
    return fetch("https://i-sign.cn:9102/isign/v1/consents", {
      method: "PATCH",
      body: JSON.stringify(data),
      headers: {
        "X-IS-Token": this.token,
        "Content-Type": "application/json",
      },
    });
  },
};

export default DottiStore;
