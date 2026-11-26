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

import { closePages, loadAndWait, switchToEditor } from "./test_utils.mjs";

describe("FreeText selection across a DOM move", function () {
  let pages;

  beforeEach(async () => {
    pages = await loadAndWait("empty.pdf", ".annotationEditorLayer");
  });

  afterEach(async () => {
    await closePages(pages);
  });

  for (const [name, anchor, focus, changeSelection, moveTwice] of [
    ["caret", 3, 3, false],
    ["forward selection", 1, 5, false],
    ["backward selection", 5, 1, false],
    ["later selection", 3, 3, true],
    ["selection across consecutive moves", 3, 3, false, true],
  ]) {
    it(`preserves the ${name} when committing and resuming editing`, async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await switchToEditor("FreeText", page);
          const { x, y } = await page.$eval(
            ".annotationEditorLayer",
            element => {
              const rect = element.getBoundingClientRect();
              return { x: rect.x, y: rect.y };
            }
          );
          for (const [dx, dy, text] of [
            [100, 100, "ABCDEF"],
            [220, 180, "GHIJKL"],
          ]) {
            await page.mouse.click(x + dx, y + dy);
            await page.keyboard.type(text);
            await page.keyboard.press("Escape");
            await page.waitForSelector(
              ".freeTextEditor.selectedEditor .overlay.enabled"
            );
          }

          const result = await page.evaluate(
            async (anchorOffset, focusOffset, change, consecutive) => {
              const manager =
                window.PDFViewerApplication.pdfViewer._layerProperties
                  .annotationEditorUIManager;
              const editor = manager.firstSelectedEditor;
              editor.enterInEditMode();
              const text = editor.div.querySelector('[contenteditable="true"]');
              text.textContent = "GHIJKL!";
              const node = text.firstChild;
              const selection = document.getSelection();
              selection.setBaseAndExtent(node, anchorOffset, node, focusOffset);
              manager.commitOrRemove();
              editor.enterInEditMode();
              selection.setBaseAndExtent(node, anchorOffset, node, focusOffset);
              if (consecutive) {
                editor.parent.moveEditorInDOM(editor);
                editor.parent.moveEditorInDOM(editor);
              }
              if (change) {
                // This runs after the move but before its focus timeout.
                setTimeout(
                  () => selection.setBaseAndExtent(node, 2, node, 4),
                  0
                );
              }
              // Let both the deferred move and its focus restoration finish.
              await new Promise(resolve => {
                setTimeout(resolve, 0);
              });
              await new Promise(resolve => {
                setTimeout(resolve, 0);
              });
              return {
                anchorOffset: selection.anchorOffset,
                focusOffset: selection.focusOffset,
                anchorIsText: selection.anchorNode === node,
                focusIsText: selection.focusNode === node,
                hasFocus: document.activeElement === text,
                editorCount:
                  document.querySelectorAll(".freeTextEditor").length,
              };
            },
            anchor,
            focus,
            changeSelection,
            !!moveTwice
          );
          expect(result)
            .withContext(browserName)
            .toEqual({
              anchorOffset: changeSelection ? 2 : anchor,
              focusOffset: changeSelection ? 4 : focus,
              anchorIsText: true,
              focusIsText: true,
              hasFocus: true,
              editorCount: 2,
            });
        })
      );
    });
  }
});
