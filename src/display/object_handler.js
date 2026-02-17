import { assert, warn } from "../shared/util.js";
import {
  FontInfo,
  FontPathInfo,
  PatternInfo,
} from "../shared/obj-bin-transform.js";

import { FontFaceObject } from "./font_loader.js";
import { PDFObjects } from "./pdf_objects.js";

function getPatternIR(exportedData) {
  return exportedData instanceof ArrayBuffer
    ? new PatternInfo(exportedData).getIR()
    : exportedData;
}

class ObjectHandler {
  constructor({
    messageHandler,
    commonObjs,
    fontLoader,
    pageCache,
    pdfBug = null,
    renderInWorker = false,
  }) {
    this.messageHandler = messageHandler;
    this.commonObjs = commonObjs;
    this.fontLoader = fontLoader;
    this.pageCache = pageCache;
    this.pdfBug = pdfBug;
    this.renderInWorker = renderInWorker;
  }

  resolveCommonObject(id, type, exportedData) {
    switch (type) {
      case "Font":
        if ("error" in exportedData) {
          const exportedError = exportedData.error;
          warn(`Error during font loading: ${exportedError}`);
          this.commonObjs.resolve(id, exportedError);
          break;
        }

        const fontData = new FontInfo(exportedData);
        const inspectFont =
          this.pdfBug && globalThis.FontInspector?.enabled
            ? (font, url) => globalThis.FontInspector.fontAdded(font, url)
            : null;
        const font = new FontFaceObject(
          fontData,
          inspectFont,
          exportedData.extra,
          exportedData.charProcOperatorList
        );

        this.fontLoader
          .bind(font)
          .catch(() =>
            this.messageHandler.sendWithPromise("FontFallback", { id })
          )
          .finally(() => {
            if (!font.fontExtraProperties && font.data) {
              // Immediately release the `font.data` property once the font
              // has been attached to the DOM, since it's no longer needed,
              // rather than waiting for a `PDFDocumentProxy.cleanup` call.
              // Since `font.data` could be very large, e.g. in some cases
              // multiple megabytes, this will help reduce memory usage.
              font.clearData();
            }
            this.commonObjs.resolve(id, font);
          });
        break;
      case "CopyLocalImage":
        const { imageRef } = exportedData;
        assert(imageRef, "The imageRef must be defined.");

        for (const pageOrObjs of this.pageCache.values()) {
          const objs = pageOrObjs.objs || pageOrObjs;

          for (const [, data] of objs) {
            if (data?.ref !== imageRef) {
              continue;
            }
            if (!data.dataLen) {
              return null;
            }
            this.commonObjs.resolve(id, structuredClone(data));
            return data.dataLen;
          }
        }
        break;
      case "FontPath":
        this.commonObjs.resolve(id, new FontPathInfo(exportedData));
        break;
      case "Image":
        this.commonObjs.resolve(id, exportedData);
        break;
      case "Pattern":
        this.commonObjs.resolve(id, getPatternIR(exportedData));
        break;
      default:
        throw new Error(`Got unknown common object type ${type}`);
    }
    return null;
  }

  resolveObject(id, pageIndex, type, exportedData) {
    let pageOrObjs = this.pageCache.get(pageIndex);
    if (!pageOrObjs) {
      if (!this.renderInWorker) {
        return;
      }
      pageOrObjs = new PDFObjects();
      this.pageCache.set(pageIndex, pageOrObjs);
    }

    const objs = pageOrObjs.objs || pageOrObjs;
    if (objs.has(id)) {
      return;
    }
    // Don't store data *after* cleanup has successfully run, see bug 1854145.
    if (pageOrObjs._intentStates?.size === 0) {
      exportedData?.bitmap?.close(); // Release any `ImageBitmap` data.
      return;
    }

    switch (type) {
      case "Image":
        objs.resolve(id, exportedData);
        break;
      case "Pattern":
        objs.resolve(id, getPatternIR(exportedData));
        break;
      default:
        throw new Error(`Got unknown object type ${type}`);
    }
  }
}

export { ObjectHandler };
