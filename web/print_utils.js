/* Copyright 2021 Mozilla Foundation
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

import { CSS_UNITS } from "./ui_utils.js";
import { DefaultXfaLayerFactory } from "./xfa_layer_builder.js";
import { getXfaPageViewport } from "pdfjs-lib";

function getXfaHtmlForPrinting(printContainer, pdfDocument) {
  const xfaHtml = pdfDocument.allXfaHtml;
  const factory = new DefaultXfaLayerFactory();
  const scale = Math.round(CSS_UNITS * 100) / 100;

  for (const xfaPage of xfaHtml.children) {
    const page = document.createElement("div");
    page.className = "xfaPrintedPage";
    printContainer.appendChild(page);

    const builder = factory.createXfaLayerBuilder(
      /* pageDiv = */ page,
      /* pdfPage = */ null,
      /* annotationStorage = */ pdfDocument.annotationStorage,
      /* xfaHtml = */ xfaPage
    );
    const viewport = getXfaPageViewport(xfaPage, { scale });

    builder.render(viewport, "print");
  }
}

export { getXfaHtmlForPrinting };
