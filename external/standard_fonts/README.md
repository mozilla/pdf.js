## Foxit fonts

The pfb files in this directory were extracted from Pdfium

Original copyright notice:

```
Copyright 2014 PDFium Authors. All rights reserved.
 Use of this source code is governed by a BSD-style license that can be
 found in the LICENSE file.

Original code copyright 2014 Foxit Software Inc. http://www.foxitsoftware.com
```

See `LICENSE_FOXIT`.

## Liberation fonts

The `LiberationSans-*.ttf` files are the unmodified upstream release of
Liberation Sans **1.07.4**, which is licensed under the GNU General Public
License v2 with the Liberation font exception (see `LICENSE_LIBERATION`, a copy
of the `License.txt` and `COPYING` files shipped with that release):
https://fedoraproject.org/wiki/Licensing:LiberationFontLicense

Note that Liberation 2.0 and later are licensed under the SIL Open Font License
1.1 instead, so `LICENSE_LIBERATION` must be updated as well whenever these font
files are replaced.

The glyph order of these files is baked into `src/core/liberationsans_widths.js`
and into the per-glyph scale factors in `src/core/*_factors.js`, so those files
need to be regenerated when the fonts are updated.
