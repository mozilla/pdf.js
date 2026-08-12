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
            ".structTree [role='heading'][aria-level='1'] [aria-owns]",
            el =>
              document.getElementById(el.getAttribute("aria-owns")).textContent
          );
          expect(head1).withContext(`In ${browserName}`).toEqual("Heading 1");
          const head2 = await page.$eval(
            ".structTree [role='heading'][aria-level='2'] [aria-owns]",
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

          const owners = await page.$$eval(
            `[aria-owns~="pdfjs_internal_id_20R"]`,
            elements =>
              elements.map(element => element.closest(".structTree") !== null)
          );
          expect(owners).withContext(`In ${browserName}`).toEqual([true]);
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
          const mathML = await page.$eval(
            "span.structTree span[aria-owns='p58R_mc13'] > math",
            el => el?.innerHTML ?? ""
          );
          expect(mathML)
            .withContext(`In ${browserName}`)
            .toEqual(
              ` <msqrt><msup><mi>x</mi><mn>2</mn></msup></msqrt> <mo>=</mo> <mrow intent="absolute-value($x)"><mo>|</mo><mi arg="x">x</mi><mo>|</mo></mrow> `
            );

          // Check that the math corresponding element is hidden in the text
          // layer.
          const ariaHidden = await page.$eval("span#p58R_mc13", el =>
            el.getAttribute("aria-hidden")
          );
          expect(ariaHidden).withContext(`In ${browserName}`).toEqual("true");
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
          const mathML = await page.$eval(
            "span.structTree span[aria-owns='p21R_mc64']",
            el => el?.innerHTML ?? ""
          );
          expect(mathML)
            .withContext(`In ${browserName}`)
            .toEqual(
              '<math display="block"> <msup> <mi>𝑛</mi> <mi>𝑝</mi> </msup> <mo lspace="0.278em" rspace="0.278em">=</mo> <mi>𝑛</mi> <mspace width="1.000em"></mspace> <mi> mod </mi> <mspace width="0.167em"></mspace> <mspace width="0.167em"></mspace> <mi>𝑝</mi> </math>'
            );
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
              `<mi aria-owns="p76R_mc16">𝑐</mi><mo aria-owns="p76R_mc17">=</mo><msqrt><mrow><msup><mi aria-owns="p76R_mc18">𝑎</mi><mn aria-owns="p76R_mc19">2</mn></msup><mo aria-owns="p76R_mc20">+</mo><msup><mi aria-owns="p76R_mc21">𝑏</mi><mn aria-owns="p76R_mc22">2</mn></msup></mrow></msqrt>`
            );
          const ariaHidden = await page.$eval("span#p76R_mc16", el =>
            el.getAttribute("aria-hidden")
          );
          expect(ariaHidden).withContext(`In ${browserName}`).toEqual("true");
        })
      );
    });
  });

  describe("Artifacts must be aria-hidden", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug1937438_mml_from_latex.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that some artifacts are aria-hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const parentSquareRootHidden = await page.evaluate(() => {
            for (const span of document.querySelectorAll(".textLayer span")) {
              if (span.textContent === "√") {
                return span.parentElement.getAttribute("aria-hidden");
              }
            }
            return false;
          });
          expect(parentSquareRootHidden)
            .withContext(`In ${browserName}`)
            .toEqual("true");
        })
      );
    });
  });

  describe("No alt-text with MathML", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug2004951.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that there's no alt-text on the MathML node", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const ariaLabel = await page.$eval(
            "span[aria-owns='p3R_mc2']",
            el => el.getAttribute("aria-label") || ""
          );
          expect(ariaLabel).withContext(`In ${browserName}`).toEqual("");
        })
      );
    });
  });

  describe("Text elements must be aria-hidden when there's MathML and annotations", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug2009627.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the text in text layer is aria-hidden", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          const ariaHidden = await page.evaluate(() =>
            Array.from(
              document.querySelectorAll(".structTree :has(> math)"),
              el =>
                document
                  .getElementById(el.getAttribute("aria-owns"))
                  .getAttribute("aria-hidden")
            )
          );
          expect(ariaHidden)
            .withContext(`In ${browserName}`)
            .toEqual(["true", "true", "true"]);
        })
      );
    });
  });

  describe("MathML in AF entry with struct tree children must not be duplicated", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug2025674.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the MathML is not duplicated in the struct tree", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          // The Formula node has both AF MathML and struct tree children.
          // When AF MathML is present, children must not be walked to avoid
          // rendering the math content twice in the accessibility tree.
          const mathCount = await page.evaluate(
            () => document.querySelectorAll(".structTree math").length
          );
          expect(mathCount).withContext(`In ${browserName}`).toBe(1);

          // All text layer elements referenced by the formula subtree must
          // be aria-hidden so screen readers don't read both the MathML and
          // the underlying text content.
          const allHidden = await page.evaluate(() => {
            const ids = [];
            for (const el of document.querySelectorAll(
              ".structTree [aria-owns]"
            )) {
              if (el.closest("math")) {
                ids.push(el.getAttribute("aria-owns"));
              }
            }
            // Also collect ids from the formula span itself.
            for (const el of document.querySelectorAll(
              ".structTree span:has(> math)"
            )) {
              const owned = el.getAttribute("aria-owns");
              if (owned) {
                ids.push(owned);
              }
            }
            return ids.every(
              id =>
                document.getElementById(id)?.getAttribute("aria-hidden") ===
                "true"
            );
          });
          expect(allHidden).withContext(`In ${browserName}`).toBeTrue();
        })
      );
    });
  });

  describe("A TH in a TR itself in a TBody is rowheader", () => {
    let pages;

    beforeEach(async () => {
      pages = await loadAndWait("bug2014080.pdf", ".textLayer");
    });

    afterEach(async () => {
      await closePages(pages);
    });

    it("must check that the table has the right structure", async () => {
      await Promise.all(
        pages.map(async ([browserName, page]) => {
          let elementRole = await page.evaluate(() =>
            Array.from(
              document.querySelector(".structTree [role='table']").children,
              child => child.getAttribute("role")
            )
          );

          // THeader and TBody must be rowgroup.
          expect(elementRole)
            .withContext(`In ${browserName}`)
            .toEqual(["rowgroup", "rowgroup"]);

          elementRole = await page.evaluate(() =>
            Array.from(
              document.querySelector(
                ".structTree [role='table'] > [role='rowgroup'] > [role='row']"
              ).children,
              child => child.getAttribute("role")
            )
          );

          // THeader has 3 columnheader.
          expect(elementRole)
            .withContext(`In ${browserName}`)
            .toEqual(["columnheader", "columnheader", "columnheader"]);

          elementRole = await page.evaluate(() =>
            Array.from(
              document.querySelector(
                ".structTree [role='table'] > [role='rowgroup']:nth-child(2)"
              ).children,
              child => child.getAttribute("role")
            )
          );

          // TBody has 5 rows.
          expect(elementRole)
            .withContext(`In ${browserName}`)
            .toEqual(["row", "row", "row", "row", "row"]);

          elementRole = await page.evaluate(() =>
            Array.from(
              document.querySelector(
                ".structTree [role='table'] > [role='rowgroup']:nth-child(2) > [role='row']:first-child"
              ).children,
              child => child.getAttribute("role")
            )
          );
          // First row has a rowheader and 2 cells.
          expect(elementRole)
            .withContext(`In ${browserName}`)
            .toEqual(["rowheader", "cell", "cell"]);
        })
      );
    });
  });
});
