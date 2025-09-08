const DottiStore = {
  token: null,
  profile: null,
  task: null,
  displayMode: "view",
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
  renderTaskAnnotationsOnLayer(layer) {
    console.info('inside render task annotation fnction')
    if (this.task) {
      console.log('task somethibg')
      console.log(this.task)
      const rawAnnotations = this.getRawAnnotations();
      if (rawAnnotations) {
        console.info('inside rawAnnotations')
        for (const editor of rawAnnotations) {
          console.log('each editor')
          if (editor.pageIndex === layer.pageIndex) {
            console.log('page index matches')
            if (this.isPlaceholderStampEditor(editor)) {
              console.log('isPlaceholderStampEditor')
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
              console.info(editor);
              layer.deserialize(editor).then(deserializedEditor => {
                if (!deserializedEditor) {
                  return;
                }
                console.log("before add to layer");
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
    } else {
      console.log('task null')
      setTimeout(() => {
        this.renderTaskAnnotationsOnLayer(layer);
      }, 1000);
    }
  },
};

export default DottiStore;

/*
let token = null;
let profile = null;
let task = null;
let displayMode = "view"; // 'task'

export function setToken(t) {
  token = t;
}

export function setProfile(p) {
  profile = p;
}

export function sameSigner(annotationSigner) {
  return annotationSigner?.phone === profile.phone;
}

export function setTask(t) {
  task = t;
  console.log('setting task')
  console.log(task)
}

export function setDisplayMode(mode) {
  displayMode = mode;
}

export function getRawAnnotations() {
  return task.fileContents[0].attr?.annotations;
}

export function getRawSignAnnotations() {
  return task.fileContents[0].signContents?.[0].attr?.annotations;
}

export function getPDFURL() {
  return task.fileContents[0].url;
}

export function isProcessingTask() {
  return !!task && task.taskStatus === "PROCESSING";
}

export function isPlaceholderStampEditor(editor) {
  return editor.isSignaturePlaceholder || editor.isStampPlaceholder;
}

export function renderTaskAnnotationsOnLayer(layer) {
  console.info('inside render task annotation fnction')
  if (task) {
    console.log('task somethibg')
    console.log(task)
    const rawAnnotations = getRawAnnotations();
    if (rawAnnotations) {
      console.info('inside rawAnnotations')
      for (const editor of rawAnnotations) {
        console.log('each editor')
        if (editor.pageIndex === layer.pageIndex) {
          console.log('page index matches')
          if (isPlaceholderStampEditor(editor)) {
            console.log('isPlaceholderStampEditor')
            if (isProcessingTask()) {
              if (sameSigner(editor.signer)) {
                layer.deserialize(editor).then(deserializedEditor => {
                  if (!deserializedEditor) {
                    return;
                  }
                  layer.add(deserializedEditor);
                });
              }
            }
          } else {
            console.info(editor);
            layer.deserialize(editor).then(deserializedEditor => {
              if (!deserializedEditor) {
                return;
              }
              console.log("before add to layer");
              layer.add(deserializedEditor);
            });
          }
        }
      }
    }
    const rawSignAnnotations = getRawSignAnnotations();
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
  } else {
    console.log('task null')
    setTimeout(() => {
      renderTaskAnnotationsOnLayer(layer);
    }, 1000);
  }
}
*/
