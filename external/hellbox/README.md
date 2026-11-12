## Build

Requires Docker. In a [Hellbox](https://github.com/mozilla/hellbox/) checkout, run:

```bash
node build.js -C
node build.js -co /pdf.js/external/hellbox/ --no-embedded-data --js-fallback
```

Copy `rust/data/LICENSE_*` here. Omit `Wingdings.hbgd`, which PDF.js doesn't use.

## Usage

`src/core/hellbox.js` generates TrueType substitutes for non-embedded standard
and XFA fonts. Viewer builds put `hellbox_bg.wasm` and
`hellbox_nowasm_fallback.js` in `wasm/`, and glyph data in `standard_fonts/`
(`standardFontDataUrl`).

Glyph data comes from [Arimo](https://github.com/googlefonts/arimo),
[Tinos](https://github.com/googlefonts/tinos),
[Liberation Mono](https://github.com/liberationfonts/liberation-fonts),
and [Noto](https://notofonts.github.io/) fonts.

## Licensing

- Hellbox: MPL-2.0 (`LICENSE_HELLBOX`).
- Font data: SIL Open Font License 1.1 (`LICENSE_ARIMO`, `LICENSE_TINOS`,
  `LICENSE_LIBERATION`, `LICENSE_NOTO`).
- `unicode.bin`: Unicode License v3 (`LICENSE_UNICODE`).
