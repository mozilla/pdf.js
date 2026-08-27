# PDF text is missing when rendering a document with a CFF font

PDF.js fails to display portions of the text in the attached PDF.

Open the provided PDF and compare the rendering with the attached reference images.

The first reference image shows the expected rendering, where the document text is visible.

The second reference image shows the problematic rendering, where substantial portions of the document text are missing.

Fix PDF.js so that the affected PDF renders its text correctly while preserving existing behavior for other PDFs.

The fix should address invalid reserved operator 9 values appearing in CFF charstrings. These values need to be removed from the charstring data before the data is passed through the font sanitization/conversion process.

Add or update regression coverage as appropriate to ensure the affected PDF and CFF charstrings are handled correctly.
