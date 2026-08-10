/* Copyright 2026 Mozilla Foundation
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

import { AnnotationType, isNodeJS } from "../../src/shared/util.js";
import { AnnotationLayer } from "../../src/display/annotation_layer.js";
import { PageViewport } from "../../src/display/page_viewport.js";

describe("AnnotationLayer", function () {
  async function renderTextAnnotation({
    color = new Uint8ClampedArray([255, 0, 0]),
    name = "Note",
  } = {}) {
    const div = document.createElement("div");
    const viewport = new PageViewport({
      viewBox: [0, 0, 100, 100],
      userUnit: 1,
      scale: 1,
      rotation: 0,
    });
    const annotationLayer = new AnnotationLayer({
      div,
      page: { view: [0, 0, 100, 100] },
      viewport,
    });

    await annotationLayer.render({
      annotations: [
        {
          annotationType: AnnotationType.TEXT,
          borderStyle: {
            width: 0,
            style: 1,
            horizontalCornerRadius: 0,
            verticalCornerRadius: 0,
          },
          color,
          contentsObj: { str: "Comment", dir: "ltr" },
          hasAppearance: false,
          hasOwnCanvas: true,
          id: "text_color",
          name,
          noRotate: true,
          popupRef: null,
          rect: [10, 10, 32, 32],
          rotation: 0,
          titleObj: { str: "Author", dir: "ltr" },
        },
      ],
      imageResourcesPath: "/web/images/",
      renderForms: false,
    });

    return { annotationLayer, div };
  }

  beforeEach(function () {
    if (isNodeJS) {
      pending("Document is not supported in Node.js.");
    }
  });

  it("uses the annotation color for a text annotation icon", async function () {
    const { annotationLayer, div } = await renderTextAnnotation();
    const image = div.querySelector(".textAnnotation img");
    const icon = div.querySelector(".textAnnotation svg");
    const use = icon.querySelector("use");

    expect(icon).not.toBeNull();
    expect(icon.style.color).toEqual("rgb(255, 0, 0)");
    expect(icon.ariaHidden).toEqual("true");
    expect(use.getAttribute("href")).toEqual(
      "/web/images/annotation-note.svg#annotation-icon"
    );
    expect(image.getAttribute("data-l10n-id")).toEqual(
      "pdfjs-text-annotation-type"
    );

    annotationLayer.destroy();
  });

  it("keeps the default color when a text annotation has no color", async function () {
    const { annotationLayer, div } = await renderTextAnnotation({
      color: null,
      name: "PushPin",
    });
    const icon = div.querySelector(".textAnnotation svg");

    expect(icon.style.color).toEqual("rgb(255, 255, 0)");
    expect(icon.querySelector("use").getAttribute("href")).toEqual(
      "/web/images/annotation-pushpin.svg#annotation-icon"
    );

    annotationLayer.destroy();
  });

  it("uses the annotation color only for the popup header", async function () {
    const { annotationLayer, div } = await renderTextAnnotation();
    div
      .querySelector(".textAnnotation")
      .dispatchEvent(new PointerEvent("pointerenter"));
    const popup = div.querySelector(".popup");
    const header = popup.querySelector(".header");
    const expected = document.createElement("span");
    expected.style.backgroundColor =
      "color-mix(in srgb, rgb(255, 0, 0) 30%, white)";

    expect(popup.style.backgroundColor).toEqual("");
    expect(header.style.backgroundColor).toEqual(
      expected.style.backgroundColor
    );

    annotationLayer.destroy();
  });
});
