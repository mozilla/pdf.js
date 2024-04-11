/* Copyright 2022 Mozilla Foundation
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

import { createIdFactory } from "./test_utils.js";
import { getFontSubstitution } from "../../src/core/font_substitutions.js";

describe("getFontSubstitution", function () {
  const idFactory = createIdFactory(0);
  const localFontPath = "/tmp/";

  it("should substitute an unknown font", () => {
    const fontName = "Foo";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: true,
        baseFontName: "Foo",
        src: "local(Foo)",
        style: {
          style: "normal",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+)$/);
  });

  it("should substitute an unknown font subset", () => {
    const fontName = "ABCDEF+Foo";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: true,
        baseFontName: "Foo",
        src: "local(Foo)",
        style: {
          style: "normal",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+)$/);
  });

  it("should substitute an unknown bold font", () => {
    const fontName = "Foo-Bold";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: true,
        baseFontName: "Foo-Bold",
        src: "local(Foo-Bold)",
        style: {
          style: "normal",
          weight: "bold",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+)$/);
  });

  it("should substitute an unknown italic font", () => {
    const fontName = "Foo-Italic";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: true,
        baseFontName: "Foo-Italic",
        src: "local(Foo-Italic)",
        style: {
          style: "italic",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+)$/);
  });

  it("should substitute an unknown bold italic font", () => {
    const fontName = "Foo-BoldItalic";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: true,
        baseFontName: "Foo-BoldItalic",
        src: "local(Foo-BoldItalic)",
        style: {
          style: "italic",
          weight: "bold",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+)$/);
  });

  it("should substitute an unknown font but with a standard font", () => {
    const fontName = "Foo";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      "Helvetica",
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Foo",
        src:
          "local(Foo),local(Helvetica),local(Helvetica Neue)," +
          "local(Arial),local(Arial Nova),local(Liberation Sans)," +
          "local(Arimo),local(Nimbus Sans),local(Nimbus Sans L)," +
          "local(A030),local(TeX Gyre Heros),local(FreeSans)," +
          "local(DejaVu Sans),local(Albany),local(Bitstream Vera Sans)," +
          "local(Arial Unicode MS),local(Microsoft Sans Serif)," +
          "local(Apple Symbols),local(Cantarell)," +
          "url(/tmp/LiberationSans-Regular.ttf)",
        style: {
          style: "normal",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+),sans-serif$/);
  });

  it("should substitute an unknown font but with a standard italic font", () => {
    const fontName = "Foo-Italic";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      "Helvetica-Oblique",
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Foo-Italic",
        src:
          "local(Foo-Italic),local(Helvetica Italic)," +
          "local(Helvetica Neue Italic),local(Arial Italic)," +
          "local(Arial Nova Italic),local(Liberation Sans Italic)," +
          "local(Arimo Italic),local(Nimbus Sans Italic)," +
          "local(Nimbus Sans L Italic),local(A030 Italic)," +
          "local(TeX Gyre Heros Italic),local(FreeSans Italic)," +
          "local(DejaVu Sans Italic),local(Albany Italic)," +
          "local(Bitstream Vera Sans Italic),local(Arial Unicode MS Italic)," +
          "local(Microsoft Sans Serif Italic),local(Apple Symbols Italic)," +
          "local(Cantarell Italic),url(/tmp/LiberationSans-Italic.ttf)",
        style: {
          style: "italic",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+),sans-serif$/);
  });

  it("should substitute an unknown font but with a standard bold font", () => {
    const fontName = "Foo-Bold";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      "Helvetica-Bold",
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Foo-Bold",
        src:
          "local(Foo-Bold),local(Helvetica Bold),local(Helvetica Neue Bold)," +
          "local(Arial Bold),local(Arial Nova Bold)," +
          "local(Liberation Sans Bold),local(Arimo Bold)," +
          "local(Nimbus Sans Bold),local(Nimbus Sans L Bold)," +
          "local(A030 Bold),local(TeX Gyre Heros Bold),local(FreeSans Bold)," +
          "local(DejaVu Sans Bold),local(Albany Bold)," +
          "local(Bitstream Vera Sans Bold),local(Arial Unicode MS Bold)," +
          "local(Microsoft Sans Serif Bold),local(Apple Symbols Bold)," +
          "local(Cantarell Bold),url(/tmp/LiberationSans-Bold.ttf)",
        style: {
          style: "normal",
          weight: "bold",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+),sans-serif$/);
  });

  it("should substitute an unknown font but with a standard bold italic font", () => {
    const fontName = "Foo-BoldItalic";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      "Helvetica-BoldOblique",
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Foo-BoldItalic",
        src:
          "local(Foo-BoldItalic),local(Helvetica Bold Italic)," +
          "local(Helvetica Neue Bold Italic),local(Arial Bold Italic)," +
          "local(Arial Nova Bold Italic),local(Liberation Sans Bold Italic)," +
          "local(Arimo Bold Italic),local(Nimbus Sans Bold Italic)," +
          "local(Nimbus Sans L Bold Italic),local(A030 Bold Italic)," +
          "local(TeX Gyre Heros Bold Italic),local(FreeSans Bold Italic)," +
          "local(DejaVu Sans Bold Italic),local(Albany Bold Italic)," +
          "local(Bitstream Vera Sans Bold Italic)," +
          "local(Arial Unicode MS Bold Italic)," +
          "local(Microsoft Sans Serif Bold Italic)," +
          "local(Apple Symbols Bold Italic),local(Cantarell Bold Italic)," +
          "url(/tmp/LiberationSans-BoldItalic.ttf)",
        style: {
          style: "italic",
          weight: "bold",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(/^"Foo",g_d(\d+)_sf(\d+),sans-serif$/);
  });

  it("should substitute Calibri", () => {
    const fontName = "Calibri";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Calibri",
        src:
          "local(Calibri),local(Carlito),local(Helvetica)," +
          "local(Helvetica Neue),local(Arial),local(Arial Nova)," +
          "local(Liberation Sans),local(Arimo),local(Nimbus Sans)," +
          "local(Nimbus Sans L),local(A030),local(TeX Gyre Heros)," +
          "local(FreeSans),local(DejaVu Sans),local(Albany)," +
          "local(Bitstream Vera Sans),local(Arial Unicode MS)," +
          "local(Microsoft Sans Serif),local(Apple Symbols)," +
          "local(Cantarell),url(/tmp/LiberationSans-Regular.ttf)",
        style: {
          style: "normal",
          weight: "normal",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(
      /^"Calibri",g_d(\d+)_sf(\d+),sans-serif$/
    );
  });

  it("should substitute Calibri-Bold", () => {
    const fontName = "Calibri-Bold";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "Calibri-Bold",
        src:
          "local(Calibri Bold),local(Carlito Bold),local(Helvetica Bold)," +
          "local(Helvetica Neue Bold),local(Arial Bold)," +
          "local(Arial Nova Bold),local(Liberation Sans Bold)," +
          "local(Arimo Bold),local(Nimbus Sans Bold)," +
          "local(Nimbus Sans L Bold),local(A030 Bold)," +
          "local(TeX Gyre Heros Bold),local(FreeSans Bold)," +
          "local(DejaVu Sans Bold),local(Albany Bold)," +
          "local(Bitstream Vera Sans Bold),local(Arial Unicode MS Bold)," +
          "local(Microsoft Sans Serif Bold),local(Apple Symbols Bold)," +
          "local(Cantarell Bold),url(/tmp/LiberationSans-Bold.ttf)",
        style: {
          style: "normal",
          weight: "bold",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(
      /^"Calibri",g_d(\d+)_sf(\d+),sans-serif$/
    );
  });

  it("should substitute Arial Black", () => {
    const fontName = "Arial Black";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "ArialBlack",
        src:
          "local(Arial Black),local(Helvetica Bold)," +
          "local(Helvetica Neue Bold),local(Arial Bold)," +
          "local(Arial Nova Bold),local(Liberation Sans Bold)," +
          "local(Arimo Bold),local(Nimbus Sans Bold)," +
          "local(Nimbus Sans L Bold),local(A030 Bold)," +
          "local(TeX Gyre Heros Bold),local(FreeSans Bold)," +
          "local(DejaVu Sans Bold),local(Albany Bold)," +
          "local(Bitstream Vera Sans Bold),local(Arial Unicode MS Bold)," +
          "local(Microsoft Sans Serif Bold),local(Apple Symbols Bold)," +
          "local(Cantarell Bold),url(/tmp/LiberationSans-Bold.ttf)",
        style: {
          style: "normal",
          weight: "900",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(
      /^"ArialBlack",g_d(\d+)_sf(\d+),sans-serif$/
    );
  });

  it("should substitute Arial Black Bold", () => {
    const fontName = "Arial-Black-Bold";
    const fontSubstitution = getFontSubstitution(
      new Map(),
      idFactory,
      localFontPath,
      fontName,
      undefined,
      "TrueType"
    );
    expect(fontSubstitution).toEqual(
      jasmine.objectContaining({
        guessFallback: false,
        baseFontName: "ArialBlack-Bold",
        src:
          "local(Arial Black),local(Helvetica Bold)," +
          "local(Helvetica Neue Bold),local(Arial Bold)," +
          "local(Arial Nova Bold),local(Liberation Sans Bold)," +
          "local(Arimo Bold),local(Nimbus Sans Bold)," +
          "local(Nimbus Sans L Bold),local(A030 Bold)," +
          "local(TeX Gyre Heros Bold),local(FreeSans Bold)," +
          "local(DejaVu Sans Bold),local(Albany Bold)," +
          "local(Bitstream Vera Sans Bold),local(Arial Unicode MS Bold)," +
          "local(Microsoft Sans Serif Bold),local(Apple Symbols Bold)," +
          "local(Cantarell Bold),url(/tmp/LiberationSans-Bold.ttf)",
        style: {
          style: "normal",
          weight: "900",
        },
      })
    );
    expect(fontSubstitution.css).toMatch(
      /^"ArialBlack",g_d(\d+)_sf(\d+),sans-serif$/
    );
  });
});
