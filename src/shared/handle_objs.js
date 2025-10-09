import { assert, warn } from "../shared/util.js";
import {
  FontInfo,
  FontPathInfo,
  PatternInfo,
} from "../shared/obj-bin-transform.js";
import { FontFaceObject } from "../display/font_loader.js";
import { PDFObjects } from "../display/pdf_objects.js";

function setupHandler(
  handler,
  isDestroyed,
  commonObjs,
  pages,
  fontLoader,
  options = null
) {
  const { pdfBug = false, renderInWorker = false } =
    typeof options === "boolean" ? { renderInWorker: options } : options || {};
  const destroyed =
    typeof isDestroyed === "function" ? isDestroyed : () => isDestroyed;

  handler.on("commonobj", ([id, type, exportedData]) => {
    if (destroyed()) {
      return null; // Ignore any pending requests if the worker was terminated.
    }

    if (commonObjs.has(id)) {
      return null;
    }

    switch (type) {
      case "Font":
        if ("error" in exportedData) {
          const exportedError = exportedData.error;
          warn(`Error during font loading: ${exportedError}`);
          commonObjs.resolve(id, exportedError);
          break;
        }

        const fontData = new FontInfo(exportedData);
        const inspectFont =
          pdfBug && globalThis.FontInspector?.enabled
            ? (font, url) => globalThis.FontInspector.fontAdded(font, url)
            : null;
        const font = new FontFaceObject(
          fontData,
          inspectFont,
          exportedData.extra,
          exportedData.charProcOperatorList
        );

        fontLoader
          .bind(font)
          .catch(() =>
            handler.sendWithPromise("FontFallback", { id, renderInWorker })
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
            commonObjs.resolve(id, font);
          });
        break;
      case "CopyLocalImage":
        const { imageRef } = exportedData;
        assert(imageRef, "The imageRef must be defined.");

        for (const pageOrObjs of pages.values()) {
          const objs = pageOrObjs.objs || pageOrObjs;
          for (const [, data] of objs) {
            if (data?.ref !== imageRef) {
              continue;
            }
            if (!data.dataLen) {
              return null;
            }
            commonObjs.resolve(id, structuredClone(data));
            return data.dataLen;
          }
        }
        break;
      case "FontPath":
        commonObjs.resolve(id, new FontPathInfo(exportedData));
        break;
      case "Image":
        commonObjs.resolve(id, exportedData);
        break;
      case "Pattern":
        const pattern = new PatternInfo(exportedData);
        commonObjs.resolve(id, pattern.getIR());
        break;
      default:
        throw new Error(`Got unknown common object type ${type}`);
    }

    return null;
  });

  handler.on("obj", ([id, pageIndex, type, imageData]) => {
    if (destroyed()) {
      // Ignore any pending requests if the worker was terminated.
      return;
    }

    let pageOrObjs = pages.get(pageIndex);
    if (!pageOrObjs) {
      // Do not discard the objects if we're rendering in the worker.
      if (renderInWorker) {
        pageOrObjs = new PDFObjects();
        pages.set(pageIndex, pageOrObjs);
      } else {
        return;
      }
    }

    const objs = pageOrObjs.objs || pageOrObjs;

    if (objs.has(id)) {
      return;
    }
    // Don't store data *after* cleanup has successfully run, see bug 1854145.
    // Only check _intentStates if this is a page object
    if (pageOrObjs._intentStates?.size === 0) {
      imageData?.bitmap?.close(); // Release any `ImageBitmap` data.
      return;
    }

    switch (type) {
      case "Image":
        objs.resolve(id, imageData);
        break;
      case "Pattern":
        const pattern = new PatternInfo(imageData);
        objs.resolve(id, pattern.getIR());
        break;
      default:
        throw new Error(`Got unknown object type ${type}`);
    }
  });
}

export { setupHandler };
