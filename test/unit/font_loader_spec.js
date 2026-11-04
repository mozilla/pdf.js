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

import { FontFaceObject, FontLoader } from "../../src/display/font_loader.js";
import { isNodeJS } from "../../src/shared/util.js";

describe("font_loader", function () {
  let nativeFontFace;

  beforeEach(function () {
    nativeFontFace = globalThis.FontFace;
  });

  afterEach(function () {
    globalThis.FontFace = nativeFontFace;
  });

  function createFont(properties) {
    return new FontFaceObject({
      data: new Uint8Array([0x00]),
      disableFontFace: false,
      fontExtraProperties: false,
      loadedName: "g_d0_f1",
      ...properties,
    });
  }

  it("loads generated fonts through CSS without the Font Loading API", async function () {
    const loader = new FontLoader({ ownerDocument: {} });
    spyOnProperty(loader, "isSyncFontLoadingSupported", "get").and.returnValue(
      true
    );
    const insertRule = spyOn(loader, "insertRule");

    for (const [loadedName, missingFile] of [
      ["g_d0_f1_generated", false],
      ["g_d0_f1", true],
    ]) {
      const font = createFont({
        generatedFontName: "g_d0_f1_generated",
        loadedName,
        missingFile,
      });
      await loader.bind(font);
      await loader.bind(font);

      expect(insertRule).toHaveBeenCalledOnceWith(
        jasmine.stringContaining('font-family:"g_d0_f1_generated";')
      );
      insertRule.calls.reset();
    }
  });

  it("falls back to paths only when a replacement font fails to load", async function () {
    globalThis.FontFace = class {
      constructor(family) {
        this.family = family;
        this.loaded = Promise.reject(new Error("Invalid font"));
      }
    };
    for (const missingFile of [false, true]) {
      const ownerDocument = { fonts: new Set() };
      const loader = new FontLoader({ ownerDocument });
      const font = createFont({
        generatedFontName: "g_d0_f1_generated",
        missingFile,
      });
      if (missingFile) {
        await expectAsync(loader.bind(font)).toBeResolved();
      } else {
        await expectAsync(loader.bind(font)).toBeRejectedWithError(
          "Invalid font"
        );
      }
      expect(font.disableFontFace).toBe(!missingFile);
      expect(ownerDocument.fonts.size).toEqual(0);
      loader.clear();
    }
  });

  describe("FontFaceObject", function () {
    function createFontFaceObject(fontFamily) {
      return createFont({
        cssFontInfo: { fontFamily, fontWeight: "400", italicAngle: "0" },
      });
    }

    function getFontFamily(rule) {
      const start = rule.indexOf("font-family:") + "font-family:".length;
      return rule.slice(start, rule.indexOf(";font-weight:", start));
    }

    it("creates a font-face rule", function () {
      expect(
        getFontFamily(createFontFaceObject("Foo-Bar").createFontFaceRule())
      ).toEqual(`"Foo-Bar"`);
    });

    it("keeps an injected rule inside the font family <string> (issue GHSA-wxrh-xgw3-3wqf)", function () {
      const fontFamily = `"};body{background-image:url(https://example.com/)};a{x:"`;
      const rule = createFontFaceObject(fontFamily).createFontFaceRule();

      // The value already is a well-formed <string>, hence it's kept as-is.
      expect(getFontFamily(rule)).toEqual(fontFamily);
    });

    it("serializes a font family which isn't a well-formed <string>", function () {
      expect(
        getFontFamily(
          createFontFaceObject(String.raw`Foo"Bar\Baz`).createFontFaceRule()
        )
      ).toEqual(String.raw`"Foo\"Bar\\Baz"`);

      // A trailing backslash would otherwise escape the closing quote.
      expect(
        getFontFamily(
          createFontFaceObject(
            String.raw`"};body{background-image:url(https://example.com/)};a{x:\"`
          ).createFontFaceRule()
        )
      ).toEqual(
        String.raw`"\"};body{background-image:url(https://example.com/)};a{x:\\\""`
      );

      // A trailing backslash would otherwise escape the following semi-colon,
      // thus swallowing the `font-weight` declaration.
      expect(
        getFontFamily(createFontFaceObject("Foo\\").createFontFaceRule())
      ).toEqual(String.raw`"Foo\\"`);
    });

    it("escapes CSS line terminators", function () {
      const rule = createFontFaceObject(
        "safe\f}body{background-image:url(https://example.com/)}/*"
      ).createFontFaceRule();

      expect(rule).not.toContain("\f");
      expect(getFontFamily(rule)).toEqual(
        String.raw`"safe\c }body{background-image:url(https://example.com/)}/*"`
      );
    });

    it("quotes generic families and CSS-wide keywords", function () {
      // Those are not valid font family names, hence the `font-family`
      // descriptor would be ignored if they were emitted unquoted.
      for (const fontFamily of ["serif", "monospace", "inherit", "initial"]) {
        expect(
          getFontFamily(createFontFaceObject(fontFamily).createFontFaceRule())
        ).toEqual(`"${fontFamily}"`);
      }
    });

    it("uses the same font family in both font loading paths", function () {
      globalThis.FontFace = function MockFontFace(family) {
        this.family = family;
      };
      for (const fontFamily of [`"Foo Bar"`, "Foo-Bar", "serif"]) {
        const font = createFontFaceObject(fontFamily);

        expect(font.createNativeFontFace().family).toEqual(
          getFontFamily(font.createFontFaceRule())
        );
      }
    });

    it("matches the generated font family and canvas style in both loading paths", function () {
      globalThis.FontFace = class {
        constructor(family, data, descriptors) {
          Object.assign(this, { family, descriptors });
        }
      };
      for (const italic of [false, true]) {
        for (const [bold, black, weight] of [
          [false, false, "normal"],
          [true, false, "bold"],
          [true, true, "900"],
        ]) {
          const font = createFont({
            generatedFontName: "g_d0_f1_generated",
            italic,
            bold,
            black,
          });
          const face = font.createNativeFontFace();
          const style = italic ? "italic" : "normal";
          expect(face.family).toEqual("g_d0_f1_generated");
          expect(face.descriptors).toEqual({ style, weight });

          const rule = font.createFontFaceRule();
          expect(rule).toContain('font-family:"g_d0_f1_generated";');
          expect(rule).toContain(`font-style: ${style};`);
          expect(rule).toContain(`font-weight: ${weight};`);
        }
      }
    });

    it("cannot escape the @font-face rule", function () {
      if (isNodeJS) {
        pending("Document is not supported in Node.js.");
      }
      const style = document.createElement("style");
      document.head.append(style);

      try {
        for (const fontFamily of [
          `"};body{background-image:url(https://example.com/)};a{x:"`,
          String.raw`"};body{background-image:url(https://example.com/)};a{x:\"`,
          "safe\f}body{background-image:url(https://example.com/)}/*",
          String.raw`Foo"Bar\Baz`,
          "Foo\\",
          "serif",
        ]) {
          const rule = createFontFaceObject(fontFamily).createFontFaceRule();
          style.sheet.insertRule(rule, style.sheet.cssRules.length);

          const cssRule = [...style.sheet.cssRules].at(-1);
          expect(cssRule.constructor.name)
            .withContext(fontFamily)
            .toEqual("CSSFontFaceRule");
          // The `font-family` descriptor must be both present and complete,
          // i.e. the value must not have been truncated nor dropped.
          expect(cssRule.style.getPropertyValue("font-family"))
            .withContext(fontFamily)
            .not.toEqual("");
        }
        // No additional rules were injected.
        expect(style.sheet.cssRules.length).toEqual(6);
      } finally {
        style.remove();
      }
    });
  });
});
