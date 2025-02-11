/* Copyright 2014 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** @typedef {import("./api").PDFPageProxy} PDFPageProxy */
/** @typedef {import("./display_utils").PageViewport} PageViewport */
// eslint-disable-next-line max-len
/** @typedef {import("../../web/text_accessibility.js").TextAccessibilityManager} TextAccessibilityManager */
// eslint-disable-next-line max-len
/** @typedef {import("../../web/interfaces").IDownloadManager} IDownloadManager */
/** @typedef {import("../../web/interfaces").IPDFLinkService} IPDFLinkService */
// eslint-disable-next-line max-len
/** @typedef {import("../src/display/editor/tools.js").AnnotationEditorUIManager} AnnotationEditorUIManager */
// eslint-disable-next-line max-len
/** @typedef {import("../../web/struct_tree_layer_builder.js").StructTreeLayerBuilder} StructTreeLayerBuilder */

import {
  AnnotationBorderStyleType,
  AnnotationEditorType,
  AnnotationPrefix,
  AnnotationType,
  FeatureTest,
  LINE_FACTOR,
  shadow,
  unreachable,
  Util,
  warn,
} from "../shared/util.js";
import { PDFDateString, setLayerDimensions } from "./display_utils.js";
import { AnnotationStorage } from "./annotation_storage.js";
import { ColorConverters } from "../shared/scripting_utils.js";
import { DOMSVGFactory } from "./svg_factory.js";
import { XfaLayer } from "./xfa_layer.js";

const DEFAULT_TAB_INDEX = 1000;
const DEFAULT_FONT_SIZE = 9;
const GetElementsByNameSet = new WeakSet();

/**
 * @typedef {Object} AnnotationElementParameters
 * @property {Object} data
 * @property {HTMLDivElement} layer
 * @property {IPDFLinkService} linkService
 * @property {IDownloadManager} [downloadManager]
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {Object} svgFactory
 * @property {boolean} [enableScripting]
 * @property {boolean} [hasJSActions]
 * @property {Object} [fieldObjects]
 */

class AnnotationElementFactory {
  /**
   * @param {AnnotationElementParameters} parameters
   * @returns {AnnotationElement}
   */
  static create(parameters) {
    const subtype = parameters.data.annotationType;

    switch (subtype) {
      case AnnotationType.LINK:
        return new LinkAnnotationElement(parameters);

      case AnnotationType.TEXT:
        return new TextAnnotationElement(parameters);

      case AnnotationType.WIDGET:
        const fieldType = parameters.data.fieldType;

        switch (fieldType) {
          case "Tx":
            return new TextWidgetAnnotationElement(parameters);
          case "Btn":
            if (parameters.data.radioButton) {
              return new RadioButtonWidgetAnnotationElement(parameters);
            } else if (parameters.data.checkBox) {
              return new CheckboxWidgetAnnotationElement(parameters);
            }
            return new PushButtonWidgetAnnotationElement(parameters);
          case "Ch":
            return new ChoiceWidgetAnnotationElement(parameters);
          case "Sig":
            return new SignatureWidgetAnnotationElement(parameters);
        }
        return new WidgetAnnotationElement(parameters);

      case AnnotationType.POPUP:
        return new PopupAnnotationElement(parameters);

      case AnnotationType.FREETEXT:
        return new FreeTextAnnotationElement(parameters);

      case AnnotationType.LINE:
        return new LineAnnotationElement(parameters);

      case AnnotationType.SQUARE:
        return new SquareAnnotationElement(parameters);

      case AnnotationType.CIRCLE:
        return new CircleAnnotationElement(parameters);

      case AnnotationType.POLYLINE:
        return new PolylineAnnotationElement(parameters);

      case AnnotationType.CARET:
        return new CaretAnnotationElement(parameters);

      case AnnotationType.INK:
        return new InkAnnotationElement(parameters);

      case AnnotationType.POLYGON:
        return new PolygonAnnotationElement(parameters);

      case AnnotationType.HIGHLIGHT:
        return new HighlightAnnotationElement(parameters);

      case AnnotationType.UNDERLINE:
        return new UnderlineAnnotationElement(parameters);

      case AnnotationType.SQUIGGLY:
        return new SquigglyAnnotationElement(parameters);

      case AnnotationType.STRIKEOUT:
        return new StrikeOutAnnotationElement(parameters);

      case AnnotationType.STAMP:
        return new StampAnnotationElement(parameters);

      case AnnotationType.FILEATTACHMENT:
        return new FileAttachmentAnnotationElement(parameters);

      default:
        return new AnnotationElement(parameters);
    }
  }
}

class AnnotationElement {
  #updates = null;

  #hasBorder = false;

  #popupElement = null;

  constructor(
    parameters,
    {
      isRenderable = false,
      ignoreBorder = false,
      createQuadrilaterals = false,
    } = {}
  ) {
    this.isRenderable = isRenderable;
    this.data = parameters.data;
    this.layer = parameters.layer;
    this.linkService = parameters.linkService;
    this.downloadManager = parameters.downloadManager;
    this.imageResourcesPath = parameters.imageResourcesPath;
    this.renderForms = parameters.renderForms;
    this.svgFactory = parameters.svgFactory;
    this.annotationStorage = parameters.annotationStorage;
    this.enableScripting = parameters.enableScripting;
    this.hasJSActions = parameters.hasJSActions;
    this._fieldObjects = parameters.fieldObjects;
    this.parent = parameters.parent;

    if (isRenderable) {
      this.container = this._createContainer(ignoreBorder);
    }
    if (createQuadrilaterals) {
      this._createQuadrilaterals();
    }
  }

  static _hasPopupData({ titleObj, contentsObj, richText }) {
    return !!(titleObj?.str || contentsObj?.str || richText?.str);
  }

  get _isEditable() {
    return this.data.isEditable;
  }

  get hasPopupData() {
    return AnnotationElement._hasPopupData(this.data);
  }

  updateEdited(params) {
    if (!this.container) {
      return;
    }

    this.#updates ||= {
      rect: this.data.rect.slice(0),
    };

    const { rect } = params;

    if (rect) {
      this.#setRectEdited(rect);
    }

    this.#popupElement?.popup.updateEdited(params);
  }

  resetEdited() {
    if (!this.#updates) {
      return;
    }
    this.#setRectEdited(this.#updates.rect);
    this.#popupElement?.popup.resetEdited();
    this.#updates = null;
  }

  #setRectEdited(rect) {
    const {
      container: { style },
      data: { rect: currentRect, rotation },
      parent: {
        viewport: {
          rawDims: { pageWidth, pageHeight, pageX, pageY },
        },
      },
    } = this;
    currentRect?.splice(0, 4, ...rect);
    style.left = `${(100 * (rect[0] - pageX)) / pageWidth}%`;
    style.top = `${(100 * (pageHeight - rect[3] + pageY)) / pageHeight}%`;
    if (rotation === 0) {
      style.width = `${(100 * /* width = */ (rect[2] - rect[0])) / pageWidth}%`;
      style.height = `${(100 * /* height = */ (rect[3] - rect[1])) / pageHeight}%`;
    } else {
      this.setRotation(rotation);
    }
  }

  /**
   * Create an empty container for the annotation's HTML element.
   *
   * @private
   * @param {boolean} ignoreBorder
   * @memberof AnnotationElement
   * @returns {HTMLElement} A section element.
   */
  _createContainer(ignoreBorder) {
    const {
      data,
      parent: { page, viewport },
    } = this;

    const container = document.createElement("section");
    container.setAttribute("data-annotation-id", data.id);
    if (!(this instanceof WidgetAnnotationElement)) {
      container.tabIndex = DEFAULT_TAB_INDEX;
    }
    const { style } = container;

    // The accessibility manager will move the annotation in the DOM in
    // order to match the visual ordering.
    // But if an annotation is above an other one, then we must draw it
    // after the other one whatever the order is in the DOM, hence the
    // use of the z-index.
    style.zIndex = this.parent.zIndex++;

    if (data.alternativeText) {
      container.title = data.alternativeText;
    }

    if (data.noRotate) {
      container.classList.add("norotate");
    }

    if (!data.rect || this instanceof PopupAnnotationElement) {
      const { rotation } = data;
      if (!data.hasOwnCanvas && rotation !== 0) {
        this.setRotation(rotation, container);
      }
      return container;
    }
    const { width, height } = this;

    if (!ignoreBorder && data.borderStyle.width > 0) {
      style.borderWidth = `${data.borderStyle.width}px`;

      const horizontalRadius = data.borderStyle.horizontalCornerRadius;
      const verticalRadius = data.borderStyle.verticalCornerRadius;
      if (horizontalRadius > 0 || verticalRadius > 0) {
        const radius = `calc(${horizontalRadius}px * var(--total-scale-factor)) / calc(${verticalRadius}px * var(--total-scale-factor))`;
        style.borderRadius = radius;
      } else if (this instanceof RadioButtonWidgetAnnotationElement) {
        const radius = `calc(${width}px * var(--total-scale-factor)) / calc(${height}px * var(--total-scale-factor))`;
        style.borderRadius = radius;
      }

      switch (data.borderStyle.style) {
        case AnnotationBorderStyleType.SOLID:
          style.borderStyle = "solid";
          break;

        case AnnotationBorderStyleType.DASHED:
          style.borderStyle = "dashed";
          break;

        case AnnotationBorderStyleType.BEVELED:
          warn("Unimplemented border style: beveled");
          break;

        case AnnotationBorderStyleType.INSET:
          warn("Unimplemented border style: inset");
          break;

        case AnnotationBorderStyleType.UNDERLINE:
          style.borderBottomStyle = "solid";
          break;

        default:
          break;
      }

      const borderColor = data.borderColor || null;
      if (borderColor) {
        this.#hasBorder = true;
        style.borderColor = Util.makeHexColor(
          borderColor[0] | 0,
          borderColor[1] | 0,
          borderColor[2] | 0
        );
      } else {
        // Transparent (invisible) border, so do not draw it at all.
        style.borderWidth = 0;
      }
    }

    // Do *not* modify `data.rect`, since that will corrupt the annotation
    // position on subsequent calls to `_createContainer` (see issue 6804).
    const rect = Util.normalizeRect([
      data.rect[0],
      page.view[3] - data.rect[1] + page.view[1],
      data.rect[2],
      page.view[3] - data.rect[3] + page.view[1],
    ]);
    const { pageWidth, pageHeight, pageX, pageY } = viewport.rawDims;

    style.left = `${(100 * (rect[0] - pageX)) / pageWidth}%`;
    style.top = `${(100 * (rect[1] - pageY)) / pageHeight}%`;

    const { rotation } = data;
    if (data.hasOwnCanvas || rotation === 0) {
      style.width = `${(100 * width) / pageWidth}%`;
      style.height = `${(100 * height) / pageHeight}%`;
    } else {
      this.setRotation(rotation, container);
    }

    return container;
  }

  setRotation(angle, container = this.container) {
    if (!this.data.rect) {
      return;
    }
    const { pageWidth, pageHeight } = this.parent.viewport.rawDims;
    let { width, height } = this;

    if (angle % 180 !== 0) {
      [width, height] = [height, width];
    }
    container.style.width = `${(100 * width) / pageWidth}%`;
    container.style.height = `${(100 * height) / pageHeight}%`;

    container.setAttribute("data-main-rotation", (360 - angle) % 360);
  }

  get _commonActions() {
    const setColor = (jsName, styleName, event) => {
      const color = event.detail[jsName];
      const colorType = color[0];
      const colorArray = color.slice(1);
      event.target.style[styleName] =
        ColorConverters[`${colorType}_HTML`](colorArray);
      this.annotationStorage.setValue(this.data.id, {
        [styleName]: ColorConverters[`${colorType}_rgb`](colorArray),
      });
    };

    return shadow(this, "_commonActions", {
      display: event => {
        const { display } = event.detail;
        // See scripting/constants.js for the values of `Display`.
        // 0 = visible, 1 = hidden, 2 = noPrint and 3 = noView.
        const hidden = display % 2 === 1;
        this.container.style.visibility = hidden ? "hidden" : "visible";
        this.annotationStorage.setValue(this.data.id, {
          noView: hidden,
          noPrint: display === 1 || display === 2,
        });
      },
      print: event => {
        this.annotationStorage.setValue(this.data.id, {
          noPrint: !event.detail.print,
        });
      },
      hidden: event => {
        const { hidden } = event.detail;
        this.container.style.visibility = hidden ? "hidden" : "visible";
        this.annotationStorage.setValue(this.data.id, {
          noPrint: hidden,
          noView: hidden,
        });
      },
      focus: event => {
        setTimeout(() => event.target.focus({ preventScroll: false }), 0);
      },
      userName: event => {
        // tooltip
        event.target.title = event.detail.userName;
      },
      readonly: event => {
        event.target.disabled = event.detail.readonly;
      },
      required: event => {
        this._setRequired(event.target, event.detail.required);
      },
      bgColor: event => {
        setColor("bgColor", "backgroundColor", event);
      },
      fillColor: event => {
        setColor("fillColor", "backgroundColor", event);
      },
      fgColor: event => {
        setColor("fgColor", "color", event);
      },
      textColor: event => {
        setColor("textColor", "color", event);
      },
      borderColor: event => {
        setColor("borderColor", "borderColor", event);
      },
      strokeColor: event => {
        setColor("strokeColor", "borderColor", event);
      },
      rotation: event => {
        const angle = event.detail.rotation;
        this.setRotation(angle);
        this.annotationStorage.setValue(this.data.id, {
          rotation: angle,
        });
      },
    });
  }

  _dispatchEventFromSandbox(actions, jsEvent) {
    const commonActions = this._commonActions;
    for (const name of Object.keys(jsEvent.detail)) {
      const action = actions[name] || commonActions[name];
      action?.(jsEvent);
    }
  }

  _setDefaultPropertiesFromJS(element) {
    if (!this.enableScripting) {
      return;
    }

    // Some properties may have been updated thanks to JS.
    const storedData = this.annotationStorage.getRawValue(this.data.id);
    if (!storedData) {
      return;
    }

    const commonActions = this._commonActions;
    for (const [actionName, detail] of Object.entries(storedData)) {
      const action = commonActions[actionName];
      if (action) {
        const eventProxy = {
          detail: {
            [actionName]: detail,
          },
          target: element,
        };
        action(eventProxy);
        // The action has been consumed: no need to keep it.
        delete storedData[actionName];
      }
    }
  }

  /**
   * Create quadrilaterals from the annotation's quadpoints.
   *
   * @private
   * @memberof AnnotationElement
   */
  _createQuadrilaterals() {
    if (!this.container) {
      return;
    }
    const { quadPoints } = this.data;
    if (!quadPoints) {
      return;
    }

    const [rectBlX, rectBlY, rectTrX, rectTrY] = this.data.rect.map(x =>
      Math.fround(x)
    );

    if (quadPoints.length === 8) {
      const [trX, trY, blX, blY] = quadPoints.subarray(2, 6);
      if (
        rectTrX === trX &&
        rectTrY === trY &&
        rectBlX === blX &&
        rectBlY === blY
      ) {
        // The quadpoints cover the whole annotation rectangle, so no need to
        // create a quadrilateral.
        return;
      }
    }

    const { style } = this.container;
    let svgBuffer;
    if (this.#hasBorder) {
      const { borderColor, borderWidth } = style;
      style.borderWidth = 0;
      svgBuffer = [
        "url('data:image/svg+xml;utf8,",
        `<svg xmlns="http://www.w3.org/2000/svg"`,
        ` preserveAspectRatio="none" viewBox="0 0 1 1">`,
        `<g fill="transparent" stroke="${borderColor}" stroke-width="${borderWidth}">`,
      ];
      this.container.classList.add("hasBorder");
    }

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      this.container.classList.add("hasClipPath");
    }

    const width = rectTrX - rectBlX;
    const height = rectTrY - rectBlY;

    const { svgFactory } = this;
    const svg = svgFactory.createElement("svg");
    svg.classList.add("quadrilateralsContainer");
    svg.setAttribute("width", 0);
    svg.setAttribute("height", 0);
    const defs = svgFactory.createElement("defs");
    svg.append(defs);
    const clipPath = svgFactory.createElement("clipPath");
    const id = `clippath_${this.data.id}`;
    clipPath.setAttribute("id", id);
    clipPath.setAttribute("clipPathUnits", "objectBoundingBox");
    defs.append(clipPath);

    for (let i = 2, ii = quadPoints.length; i < ii; i += 8) {
      const trX = quadPoints[i];
      const trY = quadPoints[i + 1];
      const blX = quadPoints[i + 2];
      const blY = quadPoints[i + 3];
      const rect = svgFactory.createElement("rect");
      const x = (blX - rectBlX) / width;
      const y = (rectTrY - trY) / height;
      const rectWidth = (trX - blX) / width;
      const rectHeight = (trY - blY) / height;
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", rectWidth);
      rect.setAttribute("height", rectHeight);
      clipPath.append(rect);
      svgBuffer?.push(
        `<rect vector-effect="non-scaling-stroke" x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}"/>`
      );
    }

    if (this.#hasBorder) {
      svgBuffer.push(`</g></svg>')`);
      style.backgroundImage = svgBuffer.join("");
    }

    this.container.append(svg);
    this.container.style.clipPath = `url(#${id})`;
  }

  /**
   * Create a popup for the annotation's HTML element. This is used for
   * annotations that do not have a Popup entry in the dictionary, but
   * are of a type that works with popups (such as Highlight annotations).
   *
   * @private
   * @memberof AnnotationElement
   */
  _createPopup() {
    const { data } = this;

    const popup = (this.#popupElement = new PopupAnnotationElement({
      data: {
        color: data.color,
        titleObj: data.titleObj,
        modificationDate: data.modificationDate,
        contentsObj: data.contentsObj,
        richText: data.richText,
        parentRect: data.rect,
        borderStyle: 0,
        id: `popup_${data.id}`,
        rotation: data.rotation,
      },
      parent: this.parent,
      elements: [this],
    }));
    this.parent.div.append(popup.render());
  }

  /**
   * Render the annotation's HTML element(s).
   *
   * @public
   * @memberof AnnotationElement
   */
  render() {
    unreachable("Abstract method `AnnotationElement.render` called");
  }

  /**
   * @private
   * @returns {Array}
   */
  _getElementsByName(name, skipId = null) {
    const fields = [];

    if (this._fieldObjects) {
      const fieldObj = this._fieldObjects[name];
      if (fieldObj) {
        for (const { page, id, exportValues } of fieldObj) {
          if (page === -1) {
            continue;
          }
          if (id === skipId) {
            continue;
          }
          const exportValue =
            typeof exportValues === "string" ? exportValues : null;

          const domElement = document.querySelector(
            `[data-element-id="${id}"]`
          );
          if (domElement && !GetElementsByNameSet.has(domElement)) {
            warn(`_getElementsByName - element not allowed: ${id}`);
            continue;
          }
          fields.push({ id, exportValue, domElement });
        }
      }
      return fields;
    }
    // Fallback to a regular DOM lookup, to ensure that the standalone
    // viewer components won't break.
    for (const domElement of document.getElementsByName(name)) {
      const { exportValue } = domElement;
      const id = domElement.getAttribute("data-element-id");
      if (id === skipId) {
        continue;
      }
      if (!GetElementsByNameSet.has(domElement)) {
        continue;
      }
      fields.push({ id, exportValue, domElement });
    }
    return fields;
  }

  show() {
    if (this.container) {
      this.container.hidden = false;
    }
    this.popup?.maybeShow();
  }

  hide() {
    if (this.container) {
      this.container.hidden = true;
    }
    this.popup?.forceHide();
  }

  /**
   * Get the HTML element(s) which can trigger a popup when clicked or hovered.
   *
   * @public
   * @memberof AnnotationElement
   * @returns {Array<HTMLElement>|HTMLElement} An array of elements or an
   *          element.
   */
  getElementsToTriggerPopup() {
    return this.container;
  }

  addHighlightArea() {
    const triggers = this.getElementsToTriggerPopup();
    if (Array.isArray(triggers)) {
      for (const element of triggers) {
        element.classList.add("highlightArea");
      }
    } else {
      triggers.classList.add("highlightArea");
    }
  }

  _editOnDoubleClick() {
    if (!this._isEditable) {
      return;
    }
    const {
      annotationEditorType: mode,
      data: { id: editId },
    } = this;
    this.container.addEventListener("dblclick", () => {
      this.linkService.eventBus?.dispatch("switchannotationeditormode", {
        source: this,
        mode,
        editId,
      });
    });
  }

  get width() {
    return this.data.rect[2] - this.data.rect[0];
  }

  get height() {
    return this.data.rect[3] - this.data.rect[1];
  }
}

class LinkAnnotationElement extends AnnotationElement {
  constructor(parameters, options = null) {
    super(parameters, {
      isRenderable: true,
      ignoreBorder: !!options?.ignoreBorder,
      createQuadrilaterals: true,
    });
    this.isTooltipOnly = parameters.data.isTooltipOnly;
  }

  render() {
    const { data, linkService } = this;
    const link = document.createElement("a");
    link.setAttribute("data-element-id", data.id);
    let isBound = false;

    if (data.url) {
      linkService.addLinkAttributes(link, data.url, data.newWindow);
      isBound = true;
    } else if (data.action) {
      this._bindNamedAction(link, data.action);
      isBound = true;
    } else if (data.attachment) {
      this.#bindAttachment(link, data.attachment, data.attachmentDest);
      isBound = true;
    } else if (data.setOCGState) {
      this.#bindSetOCGState(link, data.setOCGState);
      isBound = true;
    } else if (data.dest) {
      this._bindLink(link, data.dest);
      isBound = true;
    } else {
      if (
        data.actions &&
        (data.actions.Action ||
          data.actions["Mouse Up"] ||
          data.actions["Mouse Down"]) &&
        this.enableScripting &&
        this.hasJSActions
      ) {
        this._bindJSAction(link, data);
        isBound = true;
      }

      if (data.resetForm) {
        this._bindResetFormAction(link, data.resetForm);
        isBound = true;
      } else if (this.isTooltipOnly && !isBound) {
        this._bindLink(link, "");
        isBound = true;
      }
    }

    this.container.classList.add("linkAnnotation");
    if (isBound) {
      this.container.append(link);
    }

    return this.container;
  }

  #setInternalLink() {
    this.container.setAttribute("data-internal-link", "");
  }

  /**
   * Bind internal links to the link element.
   *
   * @private
   * @param {Object} link
   * @param {Object} destination
   * @memberof LinkAnnotationElement
   */
  _bindLink(link, destination) {
    link.href = this.linkService.getDestinationHash(destination);
    link.onclick = () => {
      if (destination) {
        this.linkService.goToDestination(destination);
      }
      return false;
    };
    if (destination || destination === /* isTooltipOnly = */ "") {
      this.#setInternalLink();
    }
  }

  /**
   * Bind named actions to the link element.
   *
   * @private
   * @param {Object} link
   * @param {Object} action
   * @memberof LinkAnnotationElement
   */
  _bindNamedAction(link, action) {
    link.href = this.linkService.getAnchorUrl("");
    link.onclick = () => {
      this.linkService.executeNamedAction(action);
      return false;
    };
    this.#setInternalLink();
  }

  /**
   * Bind attachments to the link element.
   * @param {Object} link
   * @param {Object} attachment
   * @param {str} [dest]
   */
  #bindAttachment(link, attachment, dest = null) {
    link.href = this.linkService.getAnchorUrl("");
    if (attachment.description) {
      link.title = attachment.description;
    }
    link.onclick = () => {
      this.downloadManager?.openOrDownloadData(
        attachment.content,
        attachment.filename,
        dest
      );
      return false;
    };
    this.#setInternalLink();
  }

  /**
   * Bind SetOCGState actions to the link element.
   * @param {Object} link
   * @param {Object} action
   */
  #bindSetOCGState(link, action) {
    link.href = this.linkService.getAnchorUrl("");
    link.onclick = () => {
      this.linkService.executeSetOCGState(action);
      return false;
    };
    this.#setInternalLink();
  }

  /**
   * Bind JS actions to the link element.
   *
   * @private
   * @param {Object} link
   * @param {Object} data
   * @memberof LinkAnnotationElement
   */
  _bindJSAction(link, data) {
    link.href = this.linkService.getAnchorUrl("");
    const map = new Map([
      ["Action", "onclick"],
      ["Mouse Up", "onmouseup"],
      ["Mouse Down", "onmousedown"],
    ]);
    for (const name of Object.keys(data.actions)) {
      const jsName = map.get(name);
      if (!jsName) {
        continue;
      }
      link[jsName] = () => {
        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
          source: this,
          detail: {
            id: data.id,
            name,
          },
        });
        return false;
      };
    }

    if (!link.onclick) {
      link.onclick = () => false;
    }
    this.#setInternalLink();
  }

  _bindResetFormAction(link, resetForm) {
    const otherClickAction = link.onclick;
    if (!otherClickAction) {
      link.href = this.linkService.getAnchorUrl("");
    }
    this.#setInternalLink();

    if (!this._fieldObjects) {
      warn(
        `_bindResetFormAction - "resetForm" action not supported, ` +
          "ensure that the `fieldObjects` parameter is provided."
      );
      if (!otherClickAction) {
        link.onclick = () => false;
      }
      return;
    }

    link.onclick = () => {
      otherClickAction?.();

      const {
        fields: resetFormFields,
        refs: resetFormRefs,
        include,
      } = resetForm;

      const allFields = [];
      if (resetFormFields.length !== 0 || resetFormRefs.length !== 0) {
        const fieldIds = new Set(resetFormRefs);
        for (const fieldName of resetFormFields) {
          const fields = this._fieldObjects[fieldName] || [];
          for (const { id } of fields) {
            fieldIds.add(id);
          }
        }
        for (const fields of Object.values(this._fieldObjects)) {
          for (const field of fields) {
            if (fieldIds.has(field.id) === include) {
              allFields.push(field);
            }
          }
        }
      } else {
        for (const fields of Object.values(this._fieldObjects)) {
          allFields.push(...fields);
        }
      }

      const storage = this.annotationStorage;
      const allIds = [];
      for (const field of allFields) {
        const { id } = field;
        allIds.push(id);
        switch (field.type) {
          case "text": {
            const value = field.defaultValue || "";
            storage.setValue(id, { value });
            break;
          }
          case "checkbox":
          case "radiobutton": {
            const value = field.defaultValue === field.exportValues;
            storage.setValue(id, { value });
            break;
          }
          case "combobox":
          case "listbox": {
            const value = field.defaultValue || "";
            storage.setValue(id, { value });
            break;
          }
          default:
            continue;
        }

        const domElement = document.querySelector(`[data-element-id="${id}"]`);
        if (!domElement) {
          continue;
        } else if (!GetElementsByNameSet.has(domElement)) {
          warn(`_bindResetFormAction - element not allowed: ${id}`);
          continue;
        }
        domElement.dispatchEvent(new Event("resetform"));
      }

      if (this.enableScripting) {
        // Update the values in the sandbox.
        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
          source: this,
          detail: {
            id: "app",
            ids: allIds,
            name: "ResetForm",
          },
        });
      }

      return false;
    };
  }
}

class TextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: true });
  }

  render() {
    this.container.classList.add("textAnnotation");

    const image = document.createElement("img");
    image.src =
      this.imageResourcesPath +
      "annotation-" +
      this.data.name.toLowerCase() +
      ".svg";
    image.setAttribute("data-l10n-id", "pdfjs-text-annotation-type");
    image.setAttribute(
      "data-l10n-args",
      JSON.stringify({ type: this.data.name })
    );

    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.append(image);
    return this.container;
  }
}

class WidgetAnnotationElement extends AnnotationElement {
  render() {
    // Show only the container for unsupported field types.
    return this.container;
  }

  showElementAndHideCanvas(element) {
    if (this.data.hasOwnCanvas) {
      if (element.previousSibling?.nodeName === "CANVAS") {
        element.previousSibling.hidden = true;
      }
      element.hidden = false;
    }
  }

  _getKeyModifier(event) {
    return FeatureTest.platform.isMac ? event.metaKey : event.ctrlKey;
  }

  _setEventListener(element, elementData, baseName, eventName, valueGetter) {
    if (baseName.includes("mouse")) {
      // Mouse events
      element.addEventListener(baseName, event => {
        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
          source: this,
          detail: {
            id: this.data.id,
            name: eventName,
            value: valueGetter(event),
            shift: event.shiftKey,
            modifier: this._getKeyModifier(event),
          },
        });
      });
    } else {
      // Non-mouse events
      element.addEventListener(baseName, event => {
        if (baseName === "blur") {
          if (!elementData.focused || !event.relatedTarget) {
            return;
          }
          elementData.focused = false;
        } else if (baseName === "focus") {
          if (elementData.focused) {
            return;
          }
          elementData.focused = true;
        }

        if (!valueGetter) {
          return;
        }

        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
          source: this,
          detail: {
            id: this.data.id,
            name: eventName,
            value: valueGetter(event),
          },
        });
      });
    }
  }

  _setEventListeners(element, elementData, names, getter) {
    for (const [baseName, eventName] of names) {
      if (eventName === "Action" || this.data.actions?.[eventName]) {
        if (eventName === "Focus" || eventName === "Blur") {
          elementData ||= { focused: false };
        }
        this._setEventListener(
          element,
          elementData,
          baseName,
          eventName,
          getter
        );
        if (eventName === "Focus" && !this.data.actions?.Blur) {
          // Ensure that elementData will have the correct value.
          this._setEventListener(element, elementData, "blur", "Blur", null);
        } else if (eventName === "Blur" && !this.data.actions?.Focus) {
          this._setEventListener(element, elementData, "focus", "Focus", null);
        }
      }
    }
  }

  _setBackgroundColor(element) {
    const color = this.data.backgroundColor || null;
    element.style.backgroundColor =
      color === null
        ? "transparent"
        : Util.makeHexColor(color[0], color[1], color[2]);
  }

  /**
   * Apply text styles to the text in the element.
   *
   * @private
   * @param {HTMLDivElement} element
   * @memberof TextWidgetAnnotationElement
   */
  _setTextStyle(element) {
    const TEXT_ALIGNMENT = ["left", "center", "right"];
    const { fontColor } = this.data.defaultAppearanceData;
    const fontSize =
      this.data.defaultAppearanceData.fontSize || DEFAULT_FONT_SIZE;

    const style = element.style;

    // TODO: If the font-size is zero, calculate it based on the height and
    //       width of the element.
    // Not setting `style.fontSize` will use the default font-size for now.

    // We don't use the font, as specified in the PDF document, for the <input>
    // element. Hence using the original `fontSize` could look bad, which is why
    // it's instead based on the field height.
    // If the height is "big" then it could lead to a too big font size
    // so in this case use the one we've in the pdf (hence the min).
    let computedFontSize;
    const BORDER_SIZE = 2;
    const roundToOneDecimal = x => Math.round(10 * x) / 10;
    if (this.data.multiLine) {
      const height = Math.abs(
        this.data.rect[3] - this.data.rect[1] - BORDER_SIZE
      );
      const numberOfLines = Math.round(height / (LINE_FACTOR * fontSize)) || 1;
      const lineHeight = height / numberOfLines;
      computedFontSize = Math.min(
        fontSize,
        roundToOneDecimal(lineHeight / LINE_FACTOR)
      );
    } else {
      const height = Math.abs(
        this.data.rect[3] - this.data.rect[1] - BORDER_SIZE
      );
      computedFontSize = Math.min(
        fontSize,
        roundToOneDecimal(height / LINE_FACTOR)
      );
    }
    style.fontSize = `calc(${computedFontSize}px * var(--total-scale-factor))`;

    style.color = Util.makeHexColor(fontColor[0], fontColor[1], fontColor[2]);

    if (this.data.textAlignment !== null) {
      style.textAlign = TEXT_ALIGNMENT[this.data.textAlignment];
    }
  }

  _setRequired(element, isRequired) {
    if (isRequired) {
      element.setAttribute("required", true);
    } else {
      element.removeAttribute("required");
    }
    element.setAttribute("aria-required", isRequired);
  }
}

class TextWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    const isRenderable =
      parameters.renderForms ||
      parameters.data.hasOwnCanvas ||
      (!parameters.data.hasAppearance && !!parameters.data.fieldValue);
    super(parameters, { isRenderable });
  }

  setPropertyOnSiblings(base, key, value, keyInStorage) {
    const storage = this.annotationStorage;
    for (const element of this._getElementsByName(
      base.name,
      /* skipId = */ base.id
    )) {
      if (element.domElement) {
        element.domElement[key] = value;
      }
      storage.setValue(element.id, { [keyInStorage]: value });
    }
  }

  render() {
    const storage = this.annotationStorage;
    const id = this.data.id;

    this.container.classList.add("textWidgetAnnotation");

    let element = null;
    if (this.renderForms) {
      // NOTE: We cannot set the values using `element.value` below, since it
      //       prevents the AnnotationLayer rasterizer in `test/driver.js`
      //       from parsing the elements correctly for the reference tests.
      const storedData = storage.getValue(id, {
        value: this.data.fieldValue,
      });
      let textContent = storedData.value || "";
      const maxLen = storage.getValue(id, {
        charLimit: this.data.maxLen,
      }).charLimit;
      if (maxLen && textContent.length > maxLen) {
        textContent = textContent.slice(0, maxLen);
      }

      let fieldFormattedValues =
        storedData.formattedValue || this.data.textContent?.join("\n") || null;
      if (fieldFormattedValues && this.data.comb) {
        fieldFormattedValues = fieldFormattedValues.replaceAll(/\s+/g, "");
      }

      const elementData = {
        userValue: textContent,
        formattedValue: fieldFormattedValues,
        lastCommittedValue: null,
        commitKey: 1,
        focused: false,
      };

      if (this.data.multiLine) {
        element = document.createElement("textarea");
        element.textContent = fieldFormattedValues ?? textContent;
        if (this.data.doNotScroll) {
          element.style.overflowY = "hidden";
        }
      } else {
        element = document.createElement("input");
        element.type = this.data.password ? "password" : "text";
        element.setAttribute("value", fieldFormattedValues ?? textContent);
        if (this.data.doNotScroll) {
          element.style.overflowX = "hidden";
        }
      }
      if (this.data.hasOwnCanvas) {
        element.hidden = true;
      }
      GetElementsByNameSet.add(element);
      element.setAttribute("data-element-id", id);

      element.disabled = this.data.readOnly;
      element.name = this.data.fieldName;
      element.tabIndex = DEFAULT_TAB_INDEX;

      this._setRequired(element, this.data.required);

      if (maxLen) {
        element.maxLength = maxLen;
      }

      element.addEventListener("input", event => {
        storage.setValue(id, { value: event.target.value });
        this.setPropertyOnSiblings(
          element,
          "value",
          event.target.value,
          "value"
        );
        elementData.formattedValue = null;
      });

      element.addEventListener("resetform", event => {
        const defaultValue = this.data.defaultFieldValue ?? "";
        element.value = elementData.userValue = defaultValue;
        elementData.formattedValue = null;
      });

      let blurListener = event => {
        const { formattedValue } = elementData;
        if (formattedValue !== null && formattedValue !== undefined) {
          event.target.value = formattedValue;
        }
        // Reset the cursor position to the start of the field (issue 12359).
        event.target.scrollLeft = 0;
      };

      if (this.enableScripting && this.hasJSActions) {
        element.addEventListener("focus", event => {
          if (elementData.focused) {
            return;
          }
          const { target } = event;
          if (elementData.userValue) {
            target.value = elementData.userValue;
          }
          elementData.lastCommittedValue = target.value;
          elementData.commitKey = 1;
          if (!this.data.actions?.Focus) {
            elementData.focused = true;
          }
        });

        element.addEventListener("updatefromsandbox", jsEvent => {
          this.showElementAndHideCanvas(jsEvent.target);
          const actions = {
            value(event) {
              elementData.userValue = event.detail.value ?? "";
              storage.setValue(id, { value: elementData.userValue.toString() });
              event.target.value = elementData.userValue;
            },
            formattedValue(event) {
              const { formattedValue } = event.detail;
              elementData.formattedValue = formattedValue;
              if (
                formattedValue !== null &&
                formattedValue !== undefined &&
                event.target !== document.activeElement
              ) {
                // Input hasn't the focus so display formatted string
                event.target.value = formattedValue;
              }
              storage.setValue(id, {
                formattedValue,
              });
            },
            selRange(event) {
              event.target.setSelectionRange(...event.detail.selRange);
            },
            charLimit: event => {
              const { charLimit } = event.detail;
              const { target } = event;
              if (charLimit === 0) {
                target.removeAttribute("maxLength");
                return;
              }

              target.setAttribute("maxLength", charLimit);
              let value = elementData.userValue;
              if (!value || value.length <= charLimit) {
                return;
              }
              value = value.slice(0, charLimit);
              target.value = elementData.userValue = value;
              storage.setValue(id, { value });

              this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
                source: this,
                detail: {
                  id,
                  name: "Keystroke",
                  value,
                  willCommit: true,
                  commitKey: 1,
                  selStart: target.selectionStart,
                  selEnd: target.selectionEnd,
                },
              });
            },
          };
          this._dispatchEventFromSandbox(actions, jsEvent);
        });

        // Even if the field hasn't any actions
        // leaving it can still trigger some actions with Calculate
        element.addEventListener("keydown", event => {
          elementData.commitKey = 1;
          // If the key is one of Escape, Enter then the data are committed.
          // If we've a Tab then data will be committed on blur.
          let commitKey = -1;
          if (event.key === "Escape") {
            commitKey = 0;
          } else if (event.key === "Enter" && !this.data.multiLine) {
            // When we've a multiline field, "Enter" key is a key as the other
            // hence we don't commit the data (Acrobat behaves the same way)
            // (see issue #15627).
            commitKey = 2;
          } else if (event.key === "Tab") {
            elementData.commitKey = 3;
          }
          if (commitKey === -1) {
            return;
          }
          const { value } = event.target;
          if (elementData.lastCommittedValue === value) {
            return;
          }
          elementData.lastCommittedValue = value;
          // Save the entered value
          elementData.userValue = value;
          this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
            source: this,
            detail: {
              id,
              name: "Keystroke",
              value,
              willCommit: true,
              commitKey,
              selStart: event.target.selectionStart,
              selEnd: event.target.selectionEnd,
            },
          });
        });
        const _blurListener = blurListener;
        blurListener = null;
        element.addEventListener("blur", event => {
          if (!elementData.focused || !event.relatedTarget) {
            return;
          }
          if (!this.data.actions?.Blur) {
            elementData.focused = false;
          }
          const { value } = event.target;
          elementData.userValue = value;
          if (elementData.lastCommittedValue !== value) {
            this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
              source: this,
              detail: {
                id,
                name: "Keystroke",
                value,
                willCommit: true,
                commitKey: elementData.commitKey,
                selStart: event.target.selectionStart,
                selEnd: event.target.selectionEnd,
              },
            });
          }
          _blurListener(event);
        });

        if (this.data.actions?.Keystroke) {
          element.addEventListener("beforeinput", event => {
            elementData.lastCommittedValue = null;
            const { data, target } = event;
            const { value, selectionStart, selectionEnd } = target;

            let selStart = selectionStart,
              selEnd = selectionEnd;

            switch (event.inputType) {
              // https://rawgit.com/w3c/input-events/v1/index.html#interface-InputEvent-Attributes
              case "deleteWordBackward": {
                const match = value
                  .substring(0, selectionStart)
                  .match(/\w*[^\w]*$/);
                if (match) {
                  selStart -= match[0].length;
                }
                break;
              }
              case "deleteWordForward": {
                const match = value
                  .substring(selectionStart)
                  .match(/^[^\w]*\w*/);
                if (match) {
                  selEnd += match[0].length;
                }
                break;
              }
              case "deleteContentBackward":
                if (selectionStart === selectionEnd) {
                  selStart -= 1;
                }
                break;
              case "deleteContentForward":
                if (selectionStart === selectionEnd) {
                  selEnd += 1;
                }
                break;
            }

            // We handle the event ourselves.
            event.preventDefault();
            this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
              source: this,
              detail: {
                id,
                name: "Keystroke",
                value,
                change: data || "",
                willCommit: false,
                selStart,
                selEnd,
              },
            });
          });
        }

        this._setEventListeners(
          element,
          elementData,
          [
            ["focus", "Focus"],
            ["blur", "Blur"],
            ["mousedown", "Mouse Down"],
            ["mouseenter", "Mouse Enter"],
            ["mouseleave", "Mouse Exit"],
            ["mouseup", "Mouse Up"],
          ],
          event => event.target.value
        );
      }

      if (blurListener) {
        element.addEventListener("blur", blurListener);
      }

      if (this.data.comb) {
        const fieldWidth = this.data.rect[2] - this.data.rect[0];
        const combWidth = fieldWidth / maxLen;

        element.classList.add("comb");
        element.style.letterSpacing = `calc(${combWidth}px * var(--total-scale-factor) - 1ch)`;
      }
    } else {
      element = document.createElement("div");
      element.textContent = this.data.fieldValue;
      element.style.verticalAlign = "middle";
      element.style.display = "table-cell";

      if (this.data.hasOwnCanvas) {
        element.hidden = true;
      }
    }

    this._setTextStyle(element);
    this._setBackgroundColor(element);
    this._setDefaultPropertiesFromJS(element);

    this.container.append(element);
    return this.container;
  }
}

class SignatureWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: !!parameters.data.hasOwnCanvas });
  }
}

class CheckboxWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: parameters.renderForms });
  }

  render() {
    const storage = this.annotationStorage;
    const data = this.data;
    const id = data.id;
    let value = storage.getValue(id, {
      value: data.exportValue === data.fieldValue,
    }).value;
    if (typeof value === "string") {
      // The value has been changed through js and set in annotationStorage.
      value = value !== "Off";
      storage.setValue(id, { value });
    }

    this.container.classList.add("buttonWidgetAnnotation", "checkBox");

    const element = document.createElement("input");
    GetElementsByNameSet.add(element);
    element.setAttribute("data-element-id", id);

    element.disabled = data.readOnly;
    this._setRequired(element, this.data.required);
    element.type = "checkbox";
    element.name = data.fieldName;
    if (value) {
      element.setAttribute("checked", true);
    }
    element.setAttribute("exportValue", data.exportValue);
    element.tabIndex = DEFAULT_TAB_INDEX;

    element.addEventListener("change", event => {
      const { name, checked } = event.target;
      for (const checkbox of this._getElementsByName(name, /* skipId = */ id)) {
        const curChecked = checked && checkbox.exportValue === data.exportValue;
        if (checkbox.domElement) {
          checkbox.domElement.checked = curChecked;
        }
        storage.setValue(checkbox.id, { value: curChecked });
      }
      storage.setValue(id, { value: checked });
    });

    element.addEventListener("resetform", event => {
      const defaultValue = data.defaultFieldValue || "Off";
      event.target.checked = defaultValue === data.exportValue;
    });

    if (this.enableScripting && this.hasJSActions) {
      element.addEventListener("updatefromsandbox", jsEvent => {
        const actions = {
          value(event) {
            event.target.checked = event.detail.value !== "Off";
            storage.setValue(id, { value: event.target.checked });
          },
        };
        this._dispatchEventFromSandbox(actions, jsEvent);
      });

      this._setEventListeners(
        element,
        null,
        [
          ["change", "Validate"],
          ["change", "Action"],
          ["focus", "Focus"],
          ["blur", "Blur"],
          ["mousedown", "Mouse Down"],
          ["mouseenter", "Mouse Enter"],
          ["mouseleave", "Mouse Exit"],
          ["mouseup", "Mouse Up"],
        ],
        event => event.target.checked
      );
    }

    this._setBackgroundColor(element);
    this._setDefaultPropertiesFromJS(element);

    this.container.append(element);
    return this.container;
  }
}

class RadioButtonWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: parameters.renderForms });
  }

  render() {
    this.container.classList.add("buttonWidgetAnnotation", "radioButton");
    const storage = this.annotationStorage;
    const data = this.data;
    const id = data.id;
    let value = storage.getValue(id, {
      value: data.fieldValue === data.buttonValue,
    }).value;
    if (typeof value === "string") {
      // The value has been changed through js and set in annotationStorage.
      value = value !== data.buttonValue;
      storage.setValue(id, { value });
    }

    if (value) {
      // It's possible that multiple radio buttons are checked.
      // So if this one is checked we just reset the other ones.
      // (see bug 1864136). Then when the other ones will be rendered they will
      // unchecked (because of their value in the storage).
      // Consequently, the first checked radio button will be the only checked
      // one.
      for (const radio of this._getElementsByName(
        data.fieldName,
        /* skipId = */ id
      )) {
        storage.setValue(radio.id, { value: false });
      }
    }

    const element = document.createElement("input");
    GetElementsByNameSet.add(element);
    element.setAttribute("data-element-id", id);

    element.disabled = data.readOnly;
    this._setRequired(element, this.data.required);
    element.type = "radio";
    element.name = data.fieldName;
    if (value) {
      element.setAttribute("checked", true);
    }
    element.tabIndex = DEFAULT_TAB_INDEX;

    element.addEventListener("change", event => {
      const { name, checked } = event.target;
      for (const radio of this._getElementsByName(name, /* skipId = */ id)) {
        storage.setValue(radio.id, { value: false });
      }
      storage.setValue(id, { value: checked });
    });

    element.addEventListener("resetform", event => {
      const defaultValue = data.defaultFieldValue;
      event.target.checked =
        defaultValue !== null &&
        defaultValue !== undefined &&
        defaultValue === data.buttonValue;
    });

    if (this.enableScripting && this.hasJSActions) {
      const pdfButtonValue = data.buttonValue;
      element.addEventListener("updatefromsandbox", jsEvent => {
        const actions = {
          value: event => {
            const checked = pdfButtonValue === event.detail.value;
            for (const radio of this._getElementsByName(event.target.name)) {
              const curChecked = checked && radio.id === id;
              if (radio.domElement) {
                radio.domElement.checked = curChecked;
              }
              storage.setValue(radio.id, { value: curChecked });
            }
          },
        };
        this._dispatchEventFromSandbox(actions, jsEvent);
      });

      this._setEventListeners(
        element,
        null,
        [
          ["change", "Validate"],
          ["change", "Action"],
          ["focus", "Focus"],
          ["blur", "Blur"],
          ["mousedown", "Mouse Down"],
          ["mouseenter", "Mouse Enter"],
          ["mouseleave", "Mouse Exit"],
          ["mouseup", "Mouse Up"],
        ],
        event => event.target.checked
      );
    }

    this._setBackgroundColor(element);
    this._setDefaultPropertiesFromJS(element);

    this.container.append(element);
    return this.container;
  }
}

class PushButtonWidgetAnnotationElement extends LinkAnnotationElement {
  constructor(parameters) {
    super(parameters, { ignoreBorder: parameters.data.hasAppearance });
  }

  render() {
    // The rendering and functionality of a push button widget annotation is
    // equal to that of a link annotation, but may have more functionality, such
    // as performing actions on form fields (resetting, submitting, et cetera).
    const container = super.render();
    container.classList.add("buttonWidgetAnnotation", "pushButton");

    const linkElement = container.lastChild;
    if (this.enableScripting && this.hasJSActions && linkElement) {
      this._setDefaultPropertiesFromJS(linkElement);

      linkElement.addEventListener("updatefromsandbox", jsEvent => {
        this._dispatchEventFromSandbox({}, jsEvent);
      });
    }

    return container;
  }
}

class ChoiceWidgetAnnotationElement extends WidgetAnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: parameters.renderForms });
  }

  render() {
    this.container.classList.add("choiceWidgetAnnotation");
    const storage = this.annotationStorage;
    const id = this.data.id;

    const storedData = storage.getValue(id, {
      value: this.data.fieldValue,
    });

    const selectElement = document.createElement("select");
    GetElementsByNameSet.add(selectElement);
    selectElement.setAttribute("data-element-id", id);

    selectElement.disabled = this.data.readOnly;
    this._setRequired(selectElement, this.data.required);
    selectElement.name = this.data.fieldName;
    selectElement.tabIndex = DEFAULT_TAB_INDEX;

    let addAnEmptyEntry = this.data.combo && this.data.options.length > 0;

    if (!this.data.combo) {
      // List boxes have a size and (optionally) multiple selection.
      selectElement.size = this.data.options.length;
      if (this.data.multiSelect) {
        selectElement.multiple = true;
      }
    }

    selectElement.addEventListener("resetform", event => {
      const defaultValue = this.data.defaultFieldValue;
      for (const option of selectElement.options) {
        option.selected = option.value === defaultValue;
      }
    });

    // Insert the options into the choice field.
    for (const option of this.data.options) {
      const optionElement = document.createElement("option");
      optionElement.textContent = option.displayValue;
      optionElement.value = option.exportValue;
      if (storedData.value.includes(option.exportValue)) {
        optionElement.setAttribute("selected", true);
        addAnEmptyEntry = false;
      }
      selectElement.append(optionElement);
    }

    let removeEmptyEntry = null;
    if (addAnEmptyEntry) {
      const noneOptionElement = document.createElement("option");
      noneOptionElement.value = " ";
      noneOptionElement.setAttribute("hidden", true);
      noneOptionElement.setAttribute("selected", true);
      selectElement.prepend(noneOptionElement);

      removeEmptyEntry = () => {
        noneOptionElement.remove();
        selectElement.removeEventListener("input", removeEmptyEntry);
        removeEmptyEntry = null;
      };
      selectElement.addEventListener("input", removeEmptyEntry);
    }

    const getValue = isExport => {
      const name = isExport ? "value" : "textContent";
      const { options, multiple } = selectElement;
      if (!multiple) {
        return options.selectedIndex === -1
          ? null
          : options[options.selectedIndex][name];
      }
      return Array.prototype.filter
        .call(options, option => option.selected)
        .map(option => option[name]);
    };

    let selectedValues = getValue(/* isExport */ false);

    const getItems = event => {
      const options = event.target.options;
      return Array.prototype.map.call(options, option => ({
        displayValue: option.textContent,
        exportValue: option.value,
      }));
    };

    if (this.enableScripting && this.hasJSActions) {
      selectElement.addEventListener("updatefromsandbox", jsEvent => {
        const actions = {
          value(event) {
            removeEmptyEntry?.();
            const value = event.detail.value;
            const values = new Set(Array.isArray(value) ? value : [value]);
            for (const option of selectElement.options) {
              option.selected = values.has(option.value);
            }
            storage.setValue(id, {
              value: getValue(/* isExport */ true),
            });
            selectedValues = getValue(/* isExport */ false);
          },
          multipleSelection(event) {
            selectElement.multiple = true;
          },
          remove(event) {
            const options = selectElement.options;
            const index = event.detail.remove;
            options[index].selected = false;
            selectElement.remove(index);
            if (options.length > 0) {
              const i = Array.prototype.findIndex.call(
                options,
                option => option.selected
              );
              if (i === -1) {
                options[0].selected = true;
              }
            }
            storage.setValue(id, {
              value: getValue(/* isExport */ true),
              items: getItems(event),
            });
            selectedValues = getValue(/* isExport */ false);
          },
          clear(event) {
            while (selectElement.length !== 0) {
              selectElement.remove(0);
            }
            storage.setValue(id, { value: null, items: [] });
            selectedValues = getValue(/* isExport */ false);
          },
          insert(event) {
            const { index, displayValue, exportValue } = event.detail.insert;
            const selectChild = selectElement.children[index];
            const optionElement = document.createElement("option");
            optionElement.textContent = displayValue;
            optionElement.value = exportValue;

            if (selectChild) {
              selectChild.before(optionElement);
            } else {
              selectElement.append(optionElement);
            }
            storage.setValue(id, {
              value: getValue(/* isExport */ true),
              items: getItems(event),
            });
            selectedValues = getValue(/* isExport */ false);
          },
          items(event) {
            const { items } = event.detail;
            while (selectElement.length !== 0) {
              selectElement.remove(0);
            }
            for (const item of items) {
              const { displayValue, exportValue } = item;
              const optionElement = document.createElement("option");
              optionElement.textContent = displayValue;
              optionElement.value = exportValue;
              selectElement.append(optionElement);
            }
            if (selectElement.options.length > 0) {
              selectElement.options[0].selected = true;
            }
            storage.setValue(id, {
              value: getValue(/* isExport */ true),
              items: getItems(event),
            });
            selectedValues = getValue(/* isExport */ false);
          },
          indices(event) {
            const indices = new Set(event.detail.indices);
            for (const option of event.target.options) {
              option.selected = indices.has(option.index);
            }
            storage.setValue(id, {
              value: getValue(/* isExport */ true),
            });
            selectedValues = getValue(/* isExport */ false);
          },
          editable(event) {
            event.target.disabled = !event.detail.editable;
          },
        };
        this._dispatchEventFromSandbox(actions, jsEvent);
      });

      selectElement.addEventListener("input", event => {
        const exportValue = getValue(/* isExport */ true);
        const change = getValue(/* isExport */ false);
        storage.setValue(id, { value: exportValue });

        event.preventDefault();

        this.linkService.eventBus?.dispatch("dispatcheventinsandbox", {
          source: this,
          detail: {
            id,
            name: "Keystroke",
            value: selectedValues,
            change,
            changeEx: exportValue,
            willCommit: false,
            commitKey: 1,
            keyDown: false,
          },
        });
      });

      this._setEventListeners(
        selectElement,
        null,
        [
          ["focus", "Focus"],
          ["blur", "Blur"],
          ["mousedown", "Mouse Down"],
          ["mouseenter", "Mouse Enter"],
          ["mouseleave", "Mouse Exit"],
          ["mouseup", "Mouse Up"],
          ["input", "Action"],
          ["input", "Validate"],
        ],
        event => event.target.value
      );
    } else {
      selectElement.addEventListener("input", function (event) {
        storage.setValue(id, { value: getValue(/* isExport */ true) });
      });
    }

    if (this.data.combo) {
      this._setTextStyle(selectElement);
    } else {
      // Just use the default font size...
      // it's a bit hard to guess what is a good size.
    }
    this._setBackgroundColor(selectElement);
    this._setDefaultPropertiesFromJS(selectElement);

    this.container.append(selectElement);
    return this.container;
  }
}

class PopupAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    const { data, elements } = parameters;
    super(parameters, { isRenderable: AnnotationElement._hasPopupData(data) });
    this.elements = elements;
    this.popup = null;
  }

  render() {
    this.container.classList.add("popupAnnotation");

    const popup = (this.popup = new PopupElement({
      container: this.container,
      color: this.data.color,
      titleObj: this.data.titleObj,
      modificationDate: this.data.modificationDate,
      contentsObj: this.data.contentsObj,
      richText: this.data.richText,
      rect: this.data.rect,
      parentRect: this.data.parentRect || null,
      parent: this.parent,
      elements: this.elements,
      open: this.data.open,
    }));

    const elementIds = [];
    for (const element of this.elements) {
      element.popup = popup;
      element.container.ariaHasPopup = "dialog";
      elementIds.push(element.data.id);
      element.addHighlightArea();
    }

    this.container.setAttribute(
      "aria-controls",
      elementIds.map(id => `${AnnotationPrefix}${id}`).join(",")
    );

    return this.container;
  }
}

class PopupElement {
  #boundKeyDown = this.#keyDown.bind(this);

  #boundHide = this.#hide.bind(this);

  #boundShow = this.#show.bind(this);

  #boundToggle = this.#toggle.bind(this);

  #color = null;

  #container = null;

  #contentsObj = null;

  #dateObj = null;

  #elements = null;

  #parent = null;

  #parentRect = null;

  #pinned = false;

  #popup = null;

  #position = null;

  #rect = null;

  #richText = null;

  #titleObj = null;

  #updates = null;

  #wasVisible = false;

  constructor({
    container,
    color,
    elements,
    titleObj,
    modificationDate,
    contentsObj,
    richText,
    parent,
    rect,
    parentRect,
    open,
  }) {
    this.#container = container;
    this.#titleObj = titleObj;
    this.#contentsObj = contentsObj;
    this.#richText = richText;
    this.#parent = parent;
    this.#color = color;
    this.#rect = rect;
    this.#parentRect = parentRect;
    this.#elements = elements;

    // The modification date is shown in the popup instead of the creation
    // date if it is available and can be parsed correctly, which is
    // consistent with other viewers such as Adobe Acrobat.
    this.#dateObj = PDFDateString.toDateObject(modificationDate);

    this.trigger = elements.flatMap(e => e.getElementsToTriggerPopup());
    // Attach the event listeners to the trigger element.
    for (const element of this.trigger) {
      element.addEventListener("click", this.#boundToggle);
      element.addEventListener("mouseenter", this.#boundShow);
      element.addEventListener("mouseleave", this.#boundHide);
      element.classList.add("popupTriggerArea");
    }

    // Attach the event listener to toggle the popup with the keyboard.
    for (const element of elements) {
      element.container?.addEventListener("keydown", this.#boundKeyDown);
    }

    this.#container.hidden = true;
    if (open) {
      this.#toggle();
    }

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      // Since the popup is lazily created, we need to ensure that it'll be
      // created and displayed during reference tests.
      this.#parent.popupShow.push(async () => {
        if (this.#container.hidden) {
          this.#show();
        }
      });
    }
  }

  render() {
    if (this.#popup) {
      return;
    }

    const popup = (this.#popup = document.createElement("div"));
    popup.className = "popup";

    if (this.#color) {
      const baseColor = (popup.style.outlineColor = Util.makeHexColor(
        ...this.#color
      ));
      popup.style.backgroundColor = `color-mix(in srgb, ${baseColor} 30%, white)`;
    }

    const header = document.createElement("span");
    header.className = "header";
    const title = document.createElement("h1");
    header.append(title);
    ({ dir: title.dir, str: title.textContent } = this.#titleObj);
    popup.append(header);

    if (this.#dateObj) {
      const modificationDate = document.createElement("span");
      modificationDate.classList.add("popupDate");
      modificationDate.setAttribute(
        "data-l10n-id",
        "pdfjs-annotation-date-time-string"
      );
      modificationDate.setAttribute(
        "data-l10n-args",
        JSON.stringify({ dateObj: this.#dateObj.valueOf() })
      );
      header.append(modificationDate);
    }

    const html = this.#html;
    if (html) {
      XfaLayer.render({
        xfaHtml: html,
        intent: "richText",
        div: popup,
      });
      popup.lastChild.classList.add("richText", "popupContent");
    } else {
      const contents = this._formatContents(this.#contentsObj);
      popup.append(contents);
    }
    this.#container.append(popup);
  }

  get #html() {
    const richText = this.#richText;
    const contentsObj = this.#contentsObj;
    if (
      richText?.str &&
      (!contentsObj?.str || contentsObj.str === richText.str)
    ) {
      return this.#richText.html || null;
    }
    return null;
  }

  get #fontSize() {
    return this.#html?.attributes?.style?.fontSize || 0;
  }

  get #fontColor() {
    return this.#html?.attributes?.style?.color || null;
  }

  #makePopupContent(text) {
    const popupLines = [];
    const popupContent = {
      str: text,
      html: {
        name: "div",
        attributes: {
          dir: "auto",
        },
        children: [
          {
            name: "p",
            children: popupLines,
          },
        ],
      },
    };
    const lineAttributes = {
      style: {
        color: this.#fontColor,
        fontSize: this.#fontSize
          ? `calc(${this.#fontSize}px * var(--total-scale-factor))`
          : "",
      },
    };
    for (const line of text.split("\n")) {
      popupLines.push({
        name: "span",
        value: line,
        attributes: lineAttributes,
      });
    }
    return popupContent;
  }

  /**
   * Format the contents of the popup by adding newlines where necessary.
   *
   * @private
   * @param {Object<string, string>} contentsObj
   * @memberof PopupElement
   * @returns {HTMLParagraphElement}
   */
  _formatContents({ str, dir }) {
    const p = document.createElement("p");
    p.classList.add("popupContent");
    p.dir = dir;
    const lines = str.split(/(?:\r\n?|\n)/);
    for (let i = 0, ii = lines.length; i < ii; ++i) {
      const line = lines[i];
      p.append(document.createTextNode(line));
      if (i < ii - 1) {
        p.append(document.createElement("br"));
      }
    }
    return p;
  }

  #keyDown(event) {
    if (event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    if (event.key === "Enter" || (event.key === "Escape" && this.#pinned)) {
      this.#toggle();
    }
  }

  updateEdited({ rect, popupContent }) {
    this.#updates ||= {
      contentsObj: this.#contentsObj,
      richText: this.#richText,
    };
    if (rect) {
      this.#position = null;
    }
    if (popupContent) {
      this.#richText = this.#makePopupContent(popupContent);
      this.#contentsObj = null;
    }
    this.#popup?.remove();
    this.#popup = null;
  }

  resetEdited() {
    if (!this.#updates) {
      return;
    }
    ({ contentsObj: this.#contentsObj, richText: this.#richText } =
      this.#updates);
    this.#updates = null;
    this.#popup?.remove();
    this.#popup = null;
    this.#position = null;
  }

  #setPosition() {
    if (this.#position !== null) {
      return;
    }
    const {
      page: { view },
      viewport: {
        rawDims: { pageWidth, pageHeight, pageX, pageY },
      },
    } = this.#parent;

    let useParentRect = !!this.#parentRect;
    let rect = useParentRect ? this.#parentRect : this.#rect;
    for (const element of this.#elements) {
      if (!rect || Util.intersect(element.data.rect, rect) !== null) {
        rect = element.data.rect;
        useParentRect = true;
        break;
      }
    }

    const normalizedRect = Util.normalizeRect([
      rect[0],
      view[3] - rect[1] + view[1],
      rect[2],
      view[3] - rect[3] + view[1],
    ]);

    const HORIZONTAL_SPACE_AFTER_ANNOTATION = 5;
    const parentWidth = useParentRect
      ? rect[2] - rect[0] + HORIZONTAL_SPACE_AFTER_ANNOTATION
      : 0;
    const popupLeft = normalizedRect[0] + parentWidth;
    const popupTop = normalizedRect[1];
    this.#position = [
      (100 * (popupLeft - pageX)) / pageWidth,
      (100 * (popupTop - pageY)) / pageHeight,
    ];

    const { style } = this.#container;
    style.left = `${this.#position[0]}%`;
    style.top = `${this.#position[1]}%`;
  }

  /**
   * Toggle the visibility of the popup.
   */
  #toggle() {
    this.#pinned = !this.#pinned;
    if (this.#pinned) {
      this.#show();
      this.#container.addEventListener("click", this.#boundToggle);
      this.#container.addEventListener("keydown", this.#boundKeyDown);
    } else {
      this.#hide();
      this.#container.removeEventListener("click", this.#boundToggle);
      this.#container.removeEventListener("keydown", this.#boundKeyDown);
    }
  }

  /**
   * Show the popup.
   */
  #show() {
    if (!this.#popup) {
      this.render();
    }
    if (!this.isVisible) {
      this.#setPosition();
      this.#container.hidden = false;
      this.#container.style.zIndex =
        parseInt(this.#container.style.zIndex) + 1000;
    } else if (this.#pinned) {
      this.#container.classList.add("focused");
    }
  }

  /**
   * Hide the popup.
   */
  #hide() {
    this.#container.classList.remove("focused");
    if (this.#pinned || !this.isVisible) {
      return;
    }
    this.#container.hidden = true;
    this.#container.style.zIndex =
      parseInt(this.#container.style.zIndex) - 1000;
  }

  forceHide() {
    this.#wasVisible = this.isVisible;
    if (!this.#wasVisible) {
      return;
    }
    this.#container.hidden = true;
  }

  maybeShow() {
    if (!this.#wasVisible) {
      return;
    }
    if (!this.#popup) {
      this.#show();
    }
    this.#wasVisible = false;
    this.#container.hidden = false;
  }

  get isVisible() {
    return this.#container.hidden === false;
  }
}

class FreeTextAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
    this.textContent = parameters.data.textContent;
    this.textPosition = parameters.data.textPosition;
    this.annotationEditorType = AnnotationEditorType.FREETEXT;
  }

  render() {
    this.container.classList.add("freeTextAnnotation");

    if (this.textContent) {
      const content = document.createElement("div");
      content.classList.add("annotationTextContent");
      content.setAttribute("role", "comment");
      for (const line of this.textContent) {
        const lineSpan = document.createElement("span");
        lineSpan.textContent = line;
        content.append(lineSpan);
      }
      this.container.append(content);
    }

    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this._editOnDoubleClick();

    return this.container;
  }
}

class LineAnnotationElement extends AnnotationElement {
  #line = null;

  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
  }

  render() {
    this.container.classList.add("lineAnnotation");

    // Create an invisible line with the same starting and ending coordinates
    // that acts as the trigger for the popup. Only the line itself should
    // trigger the popup, not the entire container.
    const { data, width, height } = this;
    const svg = this.svgFactory.create(
      width,
      height,
      /* skipDimensions = */ true
    );

    // PDF coordinates are calculated from a bottom left origin, so transform
    // the line coordinates to a top left origin for the SVG element.
    const line = (this.#line = this.svgFactory.createElement("svg:line"));
    line.setAttribute("x1", data.rect[2] - data.lineCoordinates[0]);
    line.setAttribute("y1", data.rect[3] - data.lineCoordinates[1]);
    line.setAttribute("x2", data.rect[2] - data.lineCoordinates[2]);
    line.setAttribute("y2", data.rect[3] - data.lineCoordinates[3]);
    // Ensure that the 'stroke-width' is always non-zero, since otherwise it
    // won't be possible to open/close the popup (note e.g. issue 11122).
    line.setAttribute("stroke-width", data.borderStyle.width || 1);
    line.setAttribute("stroke", "transparent");
    line.setAttribute("fill", "transparent");

    svg.append(line);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the line instead
    // of to the entire container (which is the default).
    if (!data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    return this.container;
  }

  getElementsToTriggerPopup() {
    return this.#line;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}

class SquareAnnotationElement extends AnnotationElement {
  #square = null;

  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
  }

  render() {
    this.container.classList.add("squareAnnotation");

    // Create an invisible square with the same rectangle that acts as the
    // trigger for the popup. Only the square itself should trigger the
    // popup, not the entire container.
    const { data, width, height } = this;
    const svg = this.svgFactory.create(
      width,
      height,
      /* skipDimensions = */ true
    );

    // The browser draws half of the borders inside the square and half of
    // the borders outside the square by default. This behavior cannot be
    // changed programmatically, so correct for that here.
    const borderWidth = data.borderStyle.width;
    const square = (this.#square = this.svgFactory.createElement("svg:rect"));
    square.setAttribute("x", borderWidth / 2);
    square.setAttribute("y", borderWidth / 2);
    square.setAttribute("width", width - borderWidth);
    square.setAttribute("height", height - borderWidth);
    // Ensure that the 'stroke-width' is always non-zero, since otherwise it
    // won't be possible to open/close the popup (note e.g. issue 11122).
    square.setAttribute("stroke-width", borderWidth || 1);
    square.setAttribute("stroke", "transparent");
    square.setAttribute("fill", "transparent");

    svg.append(square);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the square instead
    // of to the entire container (which is the default).
    if (!data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    return this.container;
  }

  getElementsToTriggerPopup() {
    return this.#square;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}

class CircleAnnotationElement extends AnnotationElement {
  #circle = null;

  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
  }

  render() {
    this.container.classList.add("circleAnnotation");

    // Create an invisible circle with the same ellipse that acts as the
    // trigger for the popup. Only the circle itself should trigger the
    // popup, not the entire container.
    const { data, width, height } = this;
    const svg = this.svgFactory.create(
      width,
      height,
      /* skipDimensions = */ true
    );

    // The browser draws half of the borders inside the circle and half of
    // the borders outside the circle by default. This behavior cannot be
    // changed programmatically, so correct for that here.
    const borderWidth = data.borderStyle.width;
    const circle = (this.#circle =
      this.svgFactory.createElement("svg:ellipse"));
    circle.setAttribute("cx", width / 2);
    circle.setAttribute("cy", height / 2);
    circle.setAttribute("rx", width / 2 - borderWidth / 2);
    circle.setAttribute("ry", height / 2 - borderWidth / 2);
    // Ensure that the 'stroke-width' is always non-zero, since otherwise it
    // won't be possible to open/close the popup (note e.g. issue 11122).
    circle.setAttribute("stroke-width", borderWidth || 1);
    circle.setAttribute("stroke", "transparent");
    circle.setAttribute("fill", "transparent");

    svg.append(circle);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the circle instead
    // of to the entire container (which is the default).
    if (!data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    return this.container;
  }

  getElementsToTriggerPopup() {
    return this.#circle;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}

class PolylineAnnotationElement extends AnnotationElement {
  #polyline = null;

  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });

    this.containerClassName = "polylineAnnotation";
    this.svgElementName = "svg:polyline";
  }

  render() {
    this.container.classList.add(this.containerClassName);

    // Create an invisible polyline with the same points that acts as the
    // trigger for the popup. Only the polyline itself should trigger the
    // popup, not the entire container.
    const {
      data: { rect, vertices, borderStyle, popupRef },
      width,
      height,
    } = this;
    if (!vertices) {
      return this.container;
    }
    const svg = this.svgFactory.create(
      width,
      height,
      /* skipDimensions = */ true
    );

    // Convert the vertices array to a single points string that the SVG
    // polyline element expects ("x1,y1 x2,y2 ..."). PDF coordinates are
    // calculated from a bottom left origin, so transform the polyline
    // coordinates to a top left origin for the SVG element.
    let points = [];
    for (let i = 0, ii = vertices.length; i < ii; i += 2) {
      const x = vertices[i] - rect[0];
      const y = rect[3] - vertices[i + 1];
      points.push(`${x},${y}`);
    }
    points = points.join(" ");

    const polyline = (this.#polyline = this.svgFactory.createElement(
      this.svgElementName
    ));
    polyline.setAttribute("points", points);
    // Ensure that the 'stroke-width' is always non-zero, since otherwise it
    // won't be possible to open/close the popup (note e.g. issue 11122).
    polyline.setAttribute("stroke-width", borderStyle.width || 1);
    polyline.setAttribute("stroke", "transparent");
    polyline.setAttribute("fill", "transparent");

    svg.append(polyline);
    this.container.append(svg);

    // Create the popup ourselves so that we can bind it to the polyline
    // instead of to the entire container (which is the default).
    if (!popupRef && this.hasPopupData) {
      this._createPopup();
    }

    return this.container;
  }

  getElementsToTriggerPopup() {
    return this.#polyline;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}

class PolygonAnnotationElement extends PolylineAnnotationElement {
  constructor(parameters) {
    // Polygons are specific forms of polylines, so reuse their logic.
    super(parameters);

    this.containerClassName = "polygonAnnotation";
    this.svgElementName = "svg:polygon";
  }
}

class CaretAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
  }

  render() {
    this.container.classList.add("caretAnnotation");

    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }
    return this.container;
  }
}

class InkAnnotationElement extends AnnotationElement {
  #polylinesGroupElement = null;

  #polylines = [];

  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });

    this.containerClassName = "inkAnnotation";

    // Use the polyline SVG element since it allows us to use coordinates
    // directly and to draw both straight lines and curves.
    this.svgElementName = "svg:polyline";

    this.annotationEditorType =
      this.data.it === "InkHighlight"
        ? AnnotationEditorType.HIGHLIGHT
        : AnnotationEditorType.INK;
  }

  #getTransform(rotation, rect) {
    // PDF coordinates are calculated from a bottom left origin, so
    // transform the polyline coordinates to a top left origin for the
    // SVG element.
    switch (rotation) {
      case 90:
        return {
          transform: `rotate(90) translate(${-rect[0]},${rect[1]}) scale(1,-1)`,
          width: rect[3] - rect[1],
          height: rect[2] - rect[0],
        };
      case 180:
        return {
          transform: `rotate(180) translate(${-rect[2]},${rect[1]}) scale(1,-1)`,
          width: rect[2] - rect[0],
          height: rect[3] - rect[1],
        };
      case 270:
        return {
          transform: `rotate(270) translate(${-rect[2]},${rect[3]}) scale(1,-1)`,
          width: rect[3] - rect[1],
          height: rect[2] - rect[0],
        };
      default:
        return {
          transform: `translate(${-rect[0]},${rect[3]}) scale(1,-1)`,
          width: rect[2] - rect[0],
          height: rect[3] - rect[1],
        };
    }
  }

  render() {
    this.container.classList.add(this.containerClassName);

    // Create an invisible polyline with the same points that acts as the
    // trigger for the popup.
    const {
      data: { rect, rotation, inkLists, borderStyle, popupRef },
    } = this;
    const { transform, width, height } = this.#getTransform(rotation, rect);

    const svg = this.svgFactory.create(
      width,
      height,
      /* skipDimensions = */ true
    );
    const g = (this.#polylinesGroupElement =
      this.svgFactory.createElement("svg:g"));
    svg.append(g);
    // Ensure that the 'stroke-width' is always non-zero, since otherwise it
    // won't be possible to open/close the popup (note e.g. issue 11122).
    g.setAttribute("stroke-width", borderStyle.width || 1);
    g.setAttribute("stroke-linecap", "round");
    g.setAttribute("stroke-linejoin", "round");
    g.setAttribute("stroke-miterlimit", 10);
    g.setAttribute("stroke", "transparent");
    g.setAttribute("fill", "transparent");
    g.setAttribute("transform", transform);

    for (let i = 0, ii = inkLists.length; i < ii; i++) {
      const polyline = this.svgFactory.createElement(this.svgElementName);
      this.#polylines.push(polyline);
      polyline.setAttribute("points", inkLists[i].join(","));
      g.append(polyline);
    }

    if (!popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.append(svg);
    this._editOnDoubleClick();

    return this.container;
  }

  updateEdited(params) {
    super.updateEdited(params);
    const { thickness, points, rect } = params;
    const g = this.#polylinesGroupElement;
    if (thickness >= 0) {
      g.setAttribute("stroke-width", thickness || 1);
    }
    if (points) {
      for (let i = 0, ii = this.#polylines.length; i < ii; i++) {
        this.#polylines[i].setAttribute("points", points[i].join(","));
      }
    }
    if (rect) {
      const { transform, width, height } = this.#getTransform(
        this.data.rotation,
        rect
      );
      const root = g.parentElement;
      root.setAttribute("viewBox", `0 0 ${width} ${height}`);
      g.setAttribute("transform", transform);
    }
  }

  getElementsToTriggerPopup() {
    return this.#polylines;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }
}

class HighlightAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, {
      isRenderable: true,
      ignoreBorder: true,
      createQuadrilaterals: true,
    });
    this.annotationEditorType = AnnotationEditorType.HIGHLIGHT;
  }

  render() {
    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.classList.add("highlightAnnotation");
    this._editOnDoubleClick();

    return this.container;
  }
}

class UnderlineAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, {
      isRenderable: true,
      ignoreBorder: true,
      createQuadrilaterals: true,
    });
  }

  render() {
    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.classList.add("underlineAnnotation");
    return this.container;
  }
}

class SquigglyAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, {
      isRenderable: true,
      ignoreBorder: true,
      createQuadrilaterals: true,
    });
  }

  render() {
    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.classList.add("squigglyAnnotation");
    return this.container;
  }
}

class StrikeOutAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, {
      isRenderable: true,
      ignoreBorder: true,
      createQuadrilaterals: true,
    });
  }

  render() {
    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }

    this.container.classList.add("strikeoutAnnotation");
    return this.container;
  }
}

class StampAnnotationElement extends AnnotationElement {
  constructor(parameters) {
    super(parameters, { isRenderable: true, ignoreBorder: true });
    this.annotationEditorType = AnnotationEditorType.STAMP;
  }

  render() {
    this.container.classList.add("stampAnnotation");
    this.container.setAttribute("role", "img");

    if (!this.data.popupRef && this.hasPopupData) {
      this._createPopup();
    }
    this._editOnDoubleClick();

    return this.container;
  }
}

class FileAttachmentAnnotationElement extends AnnotationElement {
  #trigger = null;

  constructor(parameters) {
    super(parameters, { isRenderable: true });

    const { file } = this.data;
    this.filename = file.filename;
    this.content = file.content;

    this.linkService.eventBus?.dispatch("fileattachmentannotation", {
      source: this,
      ...file,
    });
  }

  render() {
    this.container.classList.add("fileAttachmentAnnotation");

    const { container, data } = this;
    let trigger;
    if (data.hasAppearance || data.fillAlpha === 0) {
      trigger = document.createElement("div");
    } else {
      // Unfortunately it seems that it's not clearly specified exactly what
      // names are actually valid, since Table 184 contains:
      //   Conforming readers shall provide predefined icon appearances for at
      //   least the following standard names: GraphPushPin, PaperclipTag.
      //   Additional names may be supported as well. Default value: PushPin.
      trigger = document.createElement("img");
      trigger.src = `${this.imageResourcesPath}annotation-${
        /paperclip/i.test(data.name) ? "paperclip" : "pushpin"
      }.svg`;

      if (data.fillAlpha && data.fillAlpha < 1) {
        trigger.style = `filter: opacity(${Math.round(
          data.fillAlpha * 100
        )}%);`;

        if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
          this.container.classList.add("hasFillAlpha");
        }
      }
    }
    trigger.addEventListener("dblclick", this.#download.bind(this));
    this.#trigger = trigger;

    const { isMac } = FeatureTest.platform;
    container.addEventListener("keydown", evt => {
      if (evt.key === "Enter" && (isMac ? evt.metaKey : evt.ctrlKey)) {
        this.#download();
      }
    });

    if (!data.popupRef && this.hasPopupData) {
      this._createPopup();
    } else {
      trigger.classList.add("popupTriggerArea");
    }

    container.append(trigger);
    return container;
  }

  getElementsToTriggerPopup() {
    return this.#trigger;
  }

  addHighlightArea() {
    this.container.classList.add("highlightArea");
  }

  /**
   * Download the file attachment associated with this annotation.
   */
  #download() {
    this.downloadManager?.openOrDownloadData(this.content, this.filename);
  }
}

/**
 * @typedef {Object} AnnotationLayerParameters
 * @property {PageViewport} viewport
 * @property {HTMLDivElement} div
 * @property {Array} annotations
 * @property {PDFPageProxy} page
 * @property {IPDFLinkService} linkService
 * @property {IDownloadManager} [downloadManager]
 * @property {AnnotationStorage} [annotationStorage]
 * @property {string} [imageResourcesPath] - Path for image resources, mainly
 *   for annotation icons. Include trailing slash.
 * @property {boolean} renderForms
 * @property {boolean} [enableScripting] - Enable embedded script execution.
 * @property {boolean} [hasJSActions] - Some fields have JS actions.
 *   The default value is `false`.
 * @property {Object<string, Array<Object>> | null} [fieldObjects]
 * @property {Map<string, HTMLCanvasElement>} [annotationCanvasMap]
 * @property {TextAccessibilityManager} [accessibilityManager]
 * @property {AnnotationEditorUIManager} [annotationEditorUIManager]
 * @property {StructTreeLayerBuilder} [structTreeLayer]
 */

/**
 * Manage the layer containing all the annotations.
 */
class AnnotationLayer {
  #accessibilityManager = null;

  #annotationCanvasMap = null;

  #editableAnnotations = new Map();

  #structTreeLayer = null;

  constructor({
    div,
    accessibilityManager,
    annotationCanvasMap,
    annotationEditorUIManager,
    page,
    viewport,
    structTreeLayer,
  }) {
    this.div = div;
    this.#accessibilityManager = accessibilityManager;
    this.#annotationCanvasMap = annotationCanvasMap;
    this.#structTreeLayer = structTreeLayer || null;
    this.page = page;
    this.viewport = viewport;
    this.zIndex = 0;
    this._annotationEditorUIManager = annotationEditorUIManager;

    if (typeof PDFJSDev !== "undefined" && PDFJSDev.test("TESTING")) {
      // For testing purposes.
      Object.defineProperty(this, "showPopups", {
        value: async () => {
          for (const show of this.popupShow) {
            await show();
          }
        },
      });
      this.popupShow = [];
    }
  }

  hasEditableAnnotations() {
    return this.#editableAnnotations.size > 0;
  }

  async #appendElement(element, id) {
    const contentElement = element.firstChild || element;
    const annotationId = (contentElement.id = `${AnnotationPrefix}${id}`);
    const ariaAttributes =
      await this.#structTreeLayer?.getAriaAttributes(annotationId);
    if (ariaAttributes) {
      for (const [key, value] of ariaAttributes) {
        contentElement.setAttribute(key, value);
      }
    }

    this.div.append(element);
    this.#accessibilityManager?.moveElementInDOM(
      this.div,
      element,
      contentElement,
      /* isRemovable = */ false
    );
  }

  /**
   * Render a new annotation layer with all annotation elements.
   *
   * @param {AnnotationLayerParameters} params
   * @memberof AnnotationLayer
   */
  async render(params) {
    const { annotations } = params;
    const layer = this.div;
    setLayerDimensions(layer, this.viewport);

    const popupToElements = new Map();
    const elementParams = {
      data: null,
      layer,
      linkService: params.linkService,
      downloadManager: params.downloadManager,
      imageResourcesPath: params.imageResourcesPath || "",
      renderForms: params.renderForms !== false,
      svgFactory: new DOMSVGFactory(),
      annotationStorage: params.annotationStorage || new AnnotationStorage(),
      enableScripting: params.enableScripting === true,
      hasJSActions: params.hasJSActions,
      fieldObjects: params.fieldObjects,
      parent: this,
      elements: null,
    };

    for (const data of annotations) {
      if (data.noHTML) {
        continue;
      }
      const isPopupAnnotation = data.annotationType === AnnotationType.POPUP;
      if (!isPopupAnnotation) {
        if (data.rect[2] === data.rect[0] || data.rect[3] === data.rect[1]) {
          continue; // Ignore empty annotations.
        }
      } else {
        const elements = popupToElements.get(data.id);
        if (!elements) {
          // Ignore popup annotations without a corresponding annotation.
          continue;
        }
        elementParams.elements = elements;
      }
      elementParams.data = data;
      const element = AnnotationElementFactory.create(elementParams);

      if (!element.isRenderable) {
        continue;
      }

      if (!isPopupAnnotation && data.popupRef) {
        const elements = popupToElements.get(data.popupRef);
        if (!elements) {
          popupToElements.set(data.popupRef, [element]);
        } else {
          elements.push(element);
        }
      }

      const rendered = element.render();
      if (data.hidden) {
        rendered.style.visibility = "hidden";
      }
      await this.#appendElement(rendered, data.id);

      if (element._isEditable) {
        this.#editableAnnotations.set(element.data.id, element);
        this._annotationEditorUIManager?.renderAnnotationElement(element);
      }
    }

    this.#setAnnotationCanvasMap();
  }

  /**
   * Add link annotations to the annotation layer.
   *
   * @param {Array<Object>} annotations
   * @param {IPDFLinkService} linkService
   * @memberof AnnotationLayer
   */
  async addLinkAnnotations(annotations, linkService) {
    const elementParams = {
      data: null,
      layer: this.div,
      linkService,
      svgFactory: new DOMSVGFactory(),
      parent: this,
    };
    for (const data of annotations) {
      data.borderStyle ||= AnnotationLayer._defaultBorderStyle;

      elementParams.data = data;
      const element = AnnotationElementFactory.create(elementParams);

      if (!element.isRenderable) {
        continue;
      }
      const rendered = element.render();
      await this.#appendElement(rendered, data.id);
    }
  }

  /**
   * Update the annotation elements on existing annotation layer.
   *
   * @param {AnnotationLayerParameters} viewport
   * @memberof AnnotationLayer
   */
  update({ viewport }) {
    const layer = this.div;
    this.viewport = viewport;
    setLayerDimensions(layer, { rotation: viewport.rotation });

    this.#setAnnotationCanvasMap();
    layer.hidden = false;
  }

  #setAnnotationCanvasMap() {
    if (!this.#annotationCanvasMap) {
      return;
    }
    const layer = this.div;
    for (const [id, canvas] of this.#annotationCanvasMap) {
      const element = layer.querySelector(`[data-annotation-id="${id}"]`);
      if (!element) {
        continue;
      }

      canvas.className = "annotationContent";
      const { firstChild } = element;
      if (!firstChild) {
        element.append(canvas);
      } else if (firstChild.nodeName === "CANVAS") {
        firstChild.replaceWith(canvas);
      } else if (!firstChild.classList.contains("annotationContent")) {
        firstChild.before(canvas);
      } else {
        firstChild.after(canvas);
      }

      const editableAnnotation = this.#editableAnnotations.get(id);
      if (!editableAnnotation) {
        continue;
      }
      if (editableAnnotation._hasNoCanvas) {
        // The canvas wasn't available when the annotation was created.
        this._annotationEditorUIManager?.setMissingCanvas(
          id,
          element.id,
          canvas
        );
        editableAnnotation._hasNoCanvas = false;
      } else {
        editableAnnotation.canvas = canvas;
      }
    }
    this.#annotationCanvasMap.clear();
  }

  getEditableAnnotations() {
    return Array.from(this.#editableAnnotations.values());
  }

  getEditableAnnotation(id) {
    return this.#editableAnnotations.get(id);
  }

  /**
   * @private
   */
  static get _defaultBorderStyle() {
    return shadow(
      this,
      "_defaultBorderStyle",
      Object.freeze({
        width: 1,
        rawWidth: 1,
        style: AnnotationBorderStyleType.SOLID,
        dashArray: [3],
        horizontalCornerRadius: 0,
        verticalCornerRadius: 0,
      })
    );
  }
}

export {
  AnnotationLayer,
  FreeTextAnnotationElement,
  HighlightAnnotationElement,
  InkAnnotationElement,
  StampAnnotationElement,
};
