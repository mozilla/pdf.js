/* Copyright 2023 Mozilla Foundation
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

import { normalizeFontName } from "./fonts_utils.js";
import { validateFontName } from "./core_utils.js";

const NORMAL = {
  style: "normal",
  weight: "normal",
};
const BOLD = {
  style: "normal",
  weight: "bold",
};
const ITALIC = {
  style: "italic",
  weight: "normal",
};
const BOLDITALIC = {
  style: "italic",
  weight: "bold",
};

const substitutionMap = new Map([
  [
    "Times-Roman",
    {
      local: [
        "Times New Roman",
        "Times-Roman",
        "Times",
        "Liberation Serif",
        "Nimbus Roman",
        "Nimbus Roman L",
        "Tinos",
        "Thorndale",
        "TeX Gyre Termes",
        "FreeSerif",
        "DejaVu Serif",
        "Bitstream Vera Serif",
        "Ubuntu",
      ],
      style: NORMAL,
      ultimate: "serif",
    },
  ],
  [
    "Times-Bold",
    {
      local: {
        alias: "Times-Roman",
        append: "Bold",
      },
      style: BOLD,
      ultimate: "serif",
    },
  ],
  [
    "Times-Italic",
    {
      local: {
        alias: "Times-Roman",
        append: "Italic",
      },
      style: ITALIC,
      ultimate: "serif",
    },
  ],
  [
    "Times-BoldItalic",
    {
      local: {
        alias: "Times-Roman",
        append: "Bold Italic",
      },
      style: BOLDITALIC,
      ultimate: "serif",
    },
  ],
  [
    "Helvetica",
    {
      local: [
        "Helvetica",
        "Helvetica Neue",
        "Arial",
        "Arial Nova",
        "Liberation Sans",
        "Arimo",
        "Nimbus Sans",
        "Nimbus Sans L",
        "A030",
        "TeX Gyre Heros",
        "FreeSans",
        "DejaVu Sans",
        "Albany",
        "Bitstream Vera Sans",
        "Arial Unicode MS",
        "Microsoft Sans Serif",
        "Apple Symbols",
        "Cantarell",
      ],
      path: "LiberationSans-Regular.ttf",
      style: NORMAL,
      ultimate: "sans-serif",
    },
  ],
  [
    "Helvetica-Bold",
    {
      local: {
        alias: "Helvetica",
        append: "Bold",
      },
      path: "LiberationSans-Bold.ttf",
      style: BOLD,
      ultimate: "sans-serif",
    },
  ],
  [
    "Helvetica-Oblique",
    {
      local: {
        alias: "Helvetica",
        append: "Italic",
      },
      path: "LiberationSans-Italic.ttf",
      style: ITALIC,
      ultimate: "sans-serif",
    },
  ],
  [
    "Helvetica-BoldOblique",
    {
      local: {
        alias: "Helvetica",
        append: "Bold Italic",
      },
      path: "LiberationSans-BoldItalic.ttf",
      style: BOLDITALIC,
      ultimate: "sans-serif",
    },
  ],
  [
    "Courier",
    {
      local: [
        "Courier",
        "Courier New",
        "Liberation Mono",
        "Nimbus Mono",
        "Nimbus Mono L",
        "Cousine",
        "Cumberland",
        "TeX Gyre Cursor",
        "FreeMono",
      ],
      style: NORMAL,
      ultimate: "monospace",
    },
  ],
  [
    "Courier-Bold",
    {
      local: {
        alias: "Courier",
        append: "Bold",
      },
      style: BOLD,
      ultimate: "monospace",
    },
  ],
  [
    "Courier-Oblique",
    {
      local: {
        alias: "Courier",
        append: "Italic",
      },
      style: ITALIC,
      ultimate: "monospace",
    },
  ],
  [
    "Courier-BoldOblique",
    {
      local: {
        alias: "Courier",
        append: "Bold Italic",
      },
      style: BOLDITALIC,
      ultimate: "monospace",
    },
  ],
  [
    "ArialBlack",
    {
      prepend: ["Arial Black"],
      style: {
        style: "normal",
        weight: "900",
      },
      fallback: "Helvetica-Bold",
    },
  ],
  [
    "ArialBlack-Bold",
    {
      alias: "ArialBlack",
    },
  ],
  [
    "ArialBlack-Italic",
    {
      prepend: ["Arial Black Italic"],
      local: {
        alias: "ArialBlack",
        append: "Italic",
      },
      style: {
        style: "italic",
        weight: "900",
      },
      fallback: "Helvetica-BoldOblique",
    },
  ],
  [
    "ArialBlack-BoldItalic",
    {
      alias: "ArialBlack-Italic",
    },
  ],
  [
    "ArialNarrow",
    {
      prepend: [
        "Arial Narrow",
        "Liberation Sans Narrow",
        "Helvetica Condensed",
        "Nimbus Sans Narrow",
        "TeX Gyre Heros Cn",
      ],
      style: NORMAL,
      fallback: "Helvetica",
    },
  ],
  [
    "ArialNarrow-Bold",
    {
      local: {
        alias: "ArialNarrow",
        append: "Bold",
      },
      style: BOLD,
      fallback: "Helvetica-Bold",
    },
  ],
  [
    "ArialNarrow-Italic",
    {
      local: {
        alias: "ArialNarrow",
        append: "Italic",
      },
      style: ITALIC,
      fallback: "Helvetica-Oblique",
    },
  ],
  [
    "ArialNarrow-BoldItalic",
    {
      local: {
        alias: "ArialNarrow",
        append: "Bold Italic",
      },
      style: BOLDITALIC,
      fallback: "Helvetica-BoldOblique",
    },
  ],
  [
    "Calibri",
    {
      prepend: ["Calibri", "Carlito"],
      style: NORMAL,
      fallback: "Helvetica",
    },
  ],
  [
    "Calibri-Bold",
    {
      local: {
        alias: "Calibri",
        append: "Bold",
      },
      style: BOLD,
      fallback: "Helvetica-Bold",
    },
  ],
  [
    "Calibri-Italic",
    {
      local: {
        alias: "Calibri",
        append: "Italic",
      },
      style: ITALIC,
      fallback: "Helvetica-Oblique",
    },
  ],
  [
    "Calibri-BoldItalic",
    {
      local: {
        alias: "Calibri",
        append: "Bold Italic",
      },
      style: BOLDITALIC,
      fallback: "Helvetica-BoldOblique",
    },
  ],
]);

const fontAliases = new Map([["Arial-Black", "ArialBlack"]]);

/**
 * Create the src path to use to load a font (see FontFace).
 * @param {Array<String>} prepend A list of font names to search first.
 * @param {Array<String>|Object} local A list of font names to search. If an
 *   Object is passed, then local.alias is the name of an other substition font
 *   and local.append is a String to append to the list of fonts in the alias.
 *   For example if local.alias is "Foo" and local.append is "Bold" then the
 *   list of fonts will be "FooSubst1 Bold", "FooSubst2 Bold", etc.
 * @returns an String with the local fonts.
 */
function makeLocal(prepend, local) {
  let append = "";
  if (!Array.isArray(local)) {
    // We are getting our list of fonts in the alias and we'll append Bold,
    // Italic or both.
    append = ` ${local.append}`;
    local = substitutionMap.get(local.alias).local;
  }
  let prependedPaths = "";
  if (prepend) {
    prependedPaths = prepend.map(name => `local(${name})`).join(",") + ",";
  }
  return (
    prependedPaths + local.map(name => `local(${name}${append})`).join(",")
  );
}

/**
 * Get a font substitution for a given font.
 * The general idea is to have enough information to create a CSS rule like
 * this:
 *   @font-face {
 *    font-family: 'Times';
 *    src: local('Times New Roman'), local('Subst1'), local('Subst2'),
 *         url(.../TimesNewRoman.ttf)
 *    font-weight: normal;
 *    font-style: normal;
 *   }
 * or use the FontFace API.
 *
 * @param {Map} systemFontCache The cache of local fonts.
 * @param {Object} idFactory The ids factory.
 * @param {String} localFontPath Path to the fonts directory.
 * @param {String} baseFontName The font name to be substituted.
 * @param {String} standardFontName The standard font name to use if the base
 *   font is not available.
 * @returns an Object with the CSS, the loaded name, the src and the style.
 */
function getFontSubstitution(
  systemFontCache,
  idFactory,
  localFontPath,
  baseFontName,
  standardFontName
) {
  let mustAddBaseFont = false;

  // It's possible to have a font name with spaces, commas or dashes, hence we
  // just replace them by a dash.
  baseFontName = normalizeFontName(baseFontName);

  const key = baseFontName;
  let substitutionInfo = systemFontCache.get(key);
  if (substitutionInfo) {
    return substitutionInfo;
  }

  // First, check if we've a substitution for the base font.
  let substitution = substitutionMap.get(baseFontName);
  if (!substitution) {
    // Check if we've an alias for the base font, Arial-Black is the same as
    // ArialBlack
    for (const [alias, subst] of fontAliases) {
      if (baseFontName.startsWith(alias)) {
        baseFontName = `${subst}${baseFontName.substring(alias.length)}`;
        substitution = substitutionMap.get(baseFontName);
        break;
      }
    }
  }

  if (!substitution) {
    // If not, check if we've a substitution for the standard font.
    substitution = substitutionMap.get(standardFontName);
    mustAddBaseFont = true;
  }

  const loadedName = `${idFactory.getDocId()}_sf_${idFactory.createFontId()}`;
  if (!substitution) {
    if (!validateFontName(baseFontName)) {
      systemFontCache.set(key, null);
      // If the baseFontName is not valid we don't want to use it.
      return null;
    }
    // Maybe we'll be lucky and the OS will have the font.
    const bold = /bold/gi.test(baseFontName);
    const italic = /oblique|italic/gi.test(baseFontName);
    const style =
      (bold && italic && BOLDITALIC) ||
      (bold && BOLD) ||
      (italic && ITALIC) ||
      NORMAL;
    substitutionInfo = {
      css: `${loadedName},sans-serif`,
      loadedName,
      src: `local(${baseFontName})`,
      style,
    };
    systemFontCache.set(key, substitutionInfo);
    return substitutionInfo;
  }

  while (substitution.alias) {
    // If we've an alias, use the substitution for the alias.
    // For example, ArialBlack-Bold is an alias for ArialBlack because the bold
    // version of Arial Black is not available.
    substitution = substitutionMap.get(substitution.alias);
  }

  const { fallback, style } = substitution;

  // Prepend the fonts to test before the fallback font.
  let prepend = substitution.prepend;

  if (fallback) {
    // We've a fallback font: this one is a standard font we want to use in case
    // nothing has been found from the prepend list.
    prepend ||= substitutionMap.get(substitution.local.alias).prepend;
    substitution = substitutionMap.get(fallback);
  }

  const { local, path, ultimate } = substitution;
  let src = makeLocal(prepend, local);
  if (path && localFontPath !== null) {
    // PDF.js embeds some fonts we can use.
    src += `,url(${localFontPath}${path})`;
  }

  // Maybe the OS will have the exact font we want so just prepend it to the
  // list.
  if (mustAddBaseFont && validateFontName(baseFontName)) {
    src = `local(${baseFontName}),${src}`;
  }

  substitutionInfo = {
    css: `${loadedName},${ultimate}`,
    loadedName,
    src,
    style,
  };
  systemFontCache.set(key, substitutionInfo);
  return substitutionInfo;
}

export { getFontSubstitution };
