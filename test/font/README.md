# Font tests

The font tests check if PDF.js can read font data correctly. For validation
the `ttx` tool (from the Python `fonttools` library) is used that can convert
font data to an XML format that we can easily use for assertions in the tests.
In the font tests we let PDF.js read font data and pass the PDF.js-interpreted
font data through `ttx` to check its correctness. The font tests are successful
if PDF.js can successfully read the font data and `ttx` can successfully read
the PDF.js-interpreted font data back, proving that PDF.js does not apply any
transformations that break the font data.

The suite also uses `pyots` to check that OpenType Sanitizer accepts the fonts
generated for the text layer without reporting any diagnostics.

## Running the font tests

The font tests are run on GitHub Actions using the workflow defined in
`.github/workflows/font_tests.yml`, but it is also possible to run the font
tests locally. The current stable versions of the following dependencies are
required to be installed on the system:

- Python 3.10–3.14 (versions with `pyots` wheels)
- `fonttools` (see https://pypi.org/project/fonttools and https://github.com/fonttools/fonttools)
- `pyots` (see https://pypi.org/project/pyots/)

Install both packages in a virtual environment so that `python` and `ttx` on
`PATH` come from the same environment:

```
python3 -m venv venv
source venv/bin/activate
pip install -r .github/font_tests_requirements.txt
npx gulp fonttest
```
