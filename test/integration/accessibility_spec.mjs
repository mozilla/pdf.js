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

import {
  awaitPromise,
  closePages,
  loadAndWait,
  waitForPageRendered,
} from "./test_utils.mjs";

const isStructTreeVisible = async page => {
  await page.waitForSelector(".structTree");
  return page.evaluate(() => {
    let elem = document.querySelector(".structTree");
    while (elem) {
      if (elem.getAttribute("aria-hidden") === "true") {
        return false;
      }
      elem = elem.parentElement;
    }
    return true;
  });
};

describe("accessibility", () => {
  describe("structure tree", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("structure_simple.pdf", ".structTree");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must build structure that maps to text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          expect(await isStructTreeVisible(page))
            .withContext(`In ${browserName}`)
            .toBeTrue();

          // Check the headings match up.
          const head1 = await page.$eval(
            ".structTree [role='heading'][aria-level='1'] span",
            el =>
              document.getElementById(el.getAttribute("aria-owns")).textContent
          );
          expect(head1).withContext(`In ${browserName}`).toEqual("Heading 1");
          const head2 = await page.$eval(
            ".structTree [role='heading'][aria-level='2'] span",
            el =>
              document.getElementById(el.getAttribute("aria-owns")).textContent
          );
          expect(head2).withContext(`In ${browserName}`).toEqual("Heading 2");

          // Check the order of the content.
          const texts = await page.$$eval(".structTree [aria-owns]", nodes =>
            nodes.map(
              el =>
                document.getElementById(el.getAttribute("aria-owns"))
                  .textContent
            )
          );
          expect(texts)
            .withContext(`In ${browserName}`)
            .toEqual([
              "Heading 1",
              "This paragraph 1.",
              "Heading 2",
              "This paragraph 2.",
            ]);
        })
      );
    });

    it("must check that the struct tree is still there after zooming", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          for (let i = 0; i < 8; i++) {
            expect(await isStructTreeVisible(page))
              .withContext(`In ${browserName}`)
              .toBeTrue();

            const handle = await waitForPageRendered(page);
            await page.click(`#zoom${i < 4 ? "In" : "Out"}Button`);
            await awaitPromise(handle);
          }
        })
      );
    });
  });

  describe("Annotation", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tracemonkey_a11y.pdf",
        ".textLayer .endOfContent"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    function getSpans(page) {
      return page.evaluate(() => {
        const elements = document.querySelectorAll(
          `.textLayer span[aria-owns]:not([role="presentation"])`
        );
        const results = [];
        for (const element of elements) {
          results.push(element.innerText);
        }
        return results;
      });
    }

    it("must check that some spans are linked to some annotations thanks to aria-owns", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const spanContents = await getSpans(page);

          expect(spanContents)
            .withContext(`In ${browserName}`)
            .toEqual(["Languages", "@intel.com", "Abstract", "Introduction"]);
        })
      );
    });
  });

  describe("Annotations order", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("fields_order.pdf", ".annotationLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the text fields are in the visual order", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const ids = await page.evaluate(() => {
            const elements = document.querySelectorAll(
              ".annotationLayer .textWidgetAnnotation"
            );
            const results = [];
            for (const element of elements) {
              results.push(element.getAttribute("data-annotation-id"));
            }
            return results;
          });

          expect(ids)
            .withContext(`In ${browserName}`)
            .toEqual(["32R", "30R", "31R", "34R", "29R", "33R"]);
        })
      );
    });
  });

  describe("Stamp annotation accessibility", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait(
        "tagged_stamp.pdf",
        ".annotationLayer #pdfjs_internal_id_21R"
      );
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check the id in aria-controls", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(".annotationLayer");
          const stampId = "pdfjs_internal_id_20R";
          await page.click(`#${stampId}`);

          const controlledId = await page.$eval(
            "#pdfjs_internal_id_21R",
            el => document.getElementById(el.getAttribute("aria-controls")).id
          );
          expect(controlledId)
            .withContext(`In ${browserName}`)
            .toEqual(stampId);
        })
      );
    });

    it("must check the aria-label linked to the stamp annotation", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(".annotationLayer");

          const ariaLabel = await page.$eval(
            ".annotationLayer section[role='img']",
            el => el.getAttribute("aria-label")
          );
          expect(ariaLabel)
            .withContext(`In ${browserName}`)
            .toEqual("Secondary text for stamp");
        })
      );
    });

    it("must check that the stamp annotation is linked to the struct tree", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          await page.waitForSelector(".structTree");

          const isLinkedToStampAnnotation = await page.$eval(
            ".structTree [role='figure']",
            el =>
              document
                .getElementById(el.getAttribute("aria-owns"))
                .classList.contains("stampAnnotation")
          );
          expect(isLinkedToStampAnnotation)
            .withContext(`In ${browserName}`)
            .toEqual(true);
        })
      );
    });
  });

  describe("Figure in the content stream", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1708040.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that an image is correctly inserted in the text layer", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          expect(await isStructTreeVisible(page))
            .withContext(`In ${browserName}`)
            .toBeTrue();

          const spanId = await page.evaluate(() => {
            const el = document.querySelector(
              `.structTree span[role="figure"]`
            );
            return el.getAttribute("aria-owns") || null;
          });

          expect(spanId).withContext(`In ${browserName}`).not.toBeNull();

          const ariaLabel = await page.evaluate(id => {
            const img = document.querySelector(`#${id} > span[role="img"]`);
            return img.getAttribute("aria-label");
          }, spanId);

          expect(ariaLabel)
            .withContext(`In ${browserName}`)
            .toEqual("A logo of a fox and a globe");
        })
      );
    });
  });

  describe("No undefined id", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("issue20102.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that span hasn't an 'undefined' id", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const id = await page.$eval("span.markedContent", span => span.id);
          expect(id).withContext(`In ${browserName}`).toBe("");
        })
      );
    });
  });

  describe("MathML in AF entry from LaTeX", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1937438_af_from_latex.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the MathML is correctly inserted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const isSanitizerSupported = await page.evaluate(() => {
            try {
              // eslint-disable-next-line no-undef
              return typeof Sanitizer !== "undefined";
            } catch {
              return false;
            }
          });
          if (isSanitizerSupported) {
            const mathML = await page.$eval(
              "span.structTree span[aria-owns='p58R_mc13'] > math",
              el => el?.innerHTML ?? ""
            );
            expect(mathML)
              .withContext(`In ${browserName}`)
              .toEqual(
                " <msqrt><msup><mi>x</mi><mn>2</mn></msup></msqrt> <mo>=</mo> <mrow><mo>|</mo><mi>x</mi><mo>|</mo></mrow> "
              );
          } else {
            pending(`Sanitizer API (in ${browserName}) is not supported`);
          }
        })
      );
    });
  });

  describe("MathML with some attributes in AF entry from LaTeX", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1997343.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the MathML is correctly inserted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const isSanitizerSupported = await page.evaluate(() => {
            try {
              // eslint-disable-next-line no-undef
              return typeof Sanitizer !== "undefined";
            } catch {
              return false;
            }
          });
          if (isSanitizerSupported) {
            const mathML = await page.$eval(
              "span.structTree span[aria-owns='p21R_mc64']",
              el => el?.innerHTML ?? ""
            );
            expect(mathML)
              .withContext(`In ${browserName}`)
              .toEqual(
                '<math display="block"> <msup> <mi>𝑛</mi> <mi>𝑝</mi> </msup> <mo lspace="0.278em" rspace="0.278em">=</mo> <mi>𝑛</mi> <mspace width="1.000em"></mspace> <mi> mod </mi> <mspace width="0.167em"></mspace> <mspace width="0.167em"></mspace> <mi>𝑝</mi> </math>'
              );
          } else {
            pending(`Sanitizer API (in ${browserName}) is not supported`);
          }
        })
      );
    });
  });

  describe("MathML tags in the struct tree", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1937438_mml_from_latex.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the MathML is correctly inserted", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const mathML = await page.$eval(
            "span.structTree span[role='group'] span[role='group']:last-child > span math",
            el => el?.innerHTML ?? ""
          );
          expect(mathML)
            .withContext(`In ${browserName}`)
            .toEqual(
              `<mi aria-owns="p76R_mc16"></mi><mo aria-owns="p76R_mc17"></mo><msqrt><mrow><msup><mi aria-owns="p76R_mc18"></mi><mn aria-owns="p76R_mc19"></mn></msup><mo aria-owns="p76R_mc20"></mo><msup><mi aria-owns="p76R_mc21"></mi><mn aria-owns="p76R_mc22"></mn></msup></mrow></msqrt>`
            );
        })
      );
    });
  });
});
