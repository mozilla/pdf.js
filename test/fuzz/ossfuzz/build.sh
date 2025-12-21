#!/bin/bash -eu
# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
################################################################################

# Install dependencies
npm install

# Install Jazzer.js for fuzzing
npm install --save-dev @jazzer.js/core

# Install gulp-cli for building
npm install -g gulp-cli

# Build the library for Node.js usage (legacy build for CommonJS support)
gulp lib-legacy

# Build image decoders
gulp image_decoders

# ============================================================================
# Compile fuzzers
# ============================================================================

# PDF Parser fuzzer - main attack surface
compile_javascript_fuzzer pdf-js test/fuzz/pdf_parser.fuzz.js

# Image decoder fuzzers
compile_javascript_fuzzer pdf-js test/fuzz/jpeg_image.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/jbig2_image.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/jpx_image.fuzz.js

# Stream decoder fuzzers
compile_javascript_fuzzer pdf-js test/fuzz/flate_stream.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/ccitt_stream.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/lzw_stream.fuzz.js

# Font parser fuzzers
compile_javascript_fuzzer pdf-js test/fuzz/cff_parser.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/type1_parser.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/cmap_parser.fuzz.js

# Crypto fuzzer
compile_javascript_fuzzer pdf-js test/fuzz/crypto.fuzz.js

# XFA/XML fuzzers
compile_javascript_fuzzer pdf-js test/fuzz/xfa_parser.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/xml_parser.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/formcalc_parser.fuzz.js

# Other parsers
compile_javascript_fuzzer pdf-js test/fuzz/ps_parser.fuzz.js
compile_javascript_fuzzer pdf-js test/fuzz/colorspace.fuzz.js

# ============================================================================
# Copy dictionaries
# ============================================================================

cp test/fuzz/dictionaries/pdf_parser.dict $OUT/pdf_parser.fuzz.dict
cp test/fuzz/dictionaries/jpeg_image.dict $OUT/jpeg_image.fuzz.dict
cp test/fuzz/dictionaries/jbig2_image.dict $OUT/jbig2_image.fuzz.dict
cp test/fuzz/dictionaries/jpx_image.dict $OUT/jpx_image.fuzz.dict
cp test/fuzz/dictionaries/flate_stream.dict $OUT/flate_stream.fuzz.dict
cp test/fuzz/dictionaries/ccitt_stream.dict $OUT/ccitt_stream.fuzz.dict
cp test/fuzz/dictionaries/lzw_stream.dict $OUT/lzw_stream.fuzz.dict
cp test/fuzz/dictionaries/cff_parser.dict $OUT/cff_parser.fuzz.dict
cp test/fuzz/dictionaries/type1_parser.dict $OUT/type1_parser.fuzz.dict
cp test/fuzz/dictionaries/cmap_parser.dict $OUT/cmap_parser.fuzz.dict
cp test/fuzz/dictionaries/crypto.dict $OUT/crypto.fuzz.dict
cp test/fuzz/dictionaries/xfa_parser.dict $OUT/xfa_parser.fuzz.dict
cp test/fuzz/dictionaries/xml_parser.dict $OUT/xml_parser.fuzz.dict
cp test/fuzz/dictionaries/formcalc_parser.dict $OUT/formcalc_parser.fuzz.dict
cp test/fuzz/dictionaries/ps_parser.dict $OUT/ps_parser.fuzz.dict
cp test/fuzz/dictionaries/colorspace.dict $OUT/colorspace.fuzz.dict

# ============================================================================
# Build seed corpora
# ============================================================================

# Zip corpus directories
for corpus_dir in test/fuzz/corpus/*/; do
    fuzzer_name=$(basename "$corpus_dir")
    if [ -d "$corpus_dir" ] && [ "$(ls -A "$corpus_dir" 2>/dev/null)" ]; then
        zip -j "$OUT/${fuzzer_name}.fuzz_seed_corpus.zip" "$corpus_dir"/* 2>/dev/null || true
    fi
done

# ============================================================================
# Copy options files
# ============================================================================

# Create options file for PDF parser (needs more time/memory)
cat > $OUT/pdf_parser.fuzz.options << EOF
[libfuzzer]
max_len = 524288
timeout = 60
rss_limit_mb = 2048
EOF

# Options for image decoders
for fuzzer in jpeg_image jbig2_image jpx_image; do
    cat > $OUT/${fuzzer}.fuzz.options << EOF
[libfuzzer]
max_len = 262144
timeout = 30
rss_limit_mb = 1024
EOF
done

# Options for stream decoders
for fuzzer in flate_stream ccitt_stream lzw_stream; do
    cat > $OUT/${fuzzer}.fuzz.options << EOF
[libfuzzer]
max_len = 131072
timeout = 30
rss_limit_mb = 1024
EOF
done

# Options for font parsers
for fuzzer in cff_parser type1_parser cmap_parser; do
    cat > $OUT/${fuzzer}.fuzz.options << EOF
[libfuzzer]
max_len = 262144
timeout = 30
rss_limit_mb = 1024
EOF
done

# Options for XFA (complex XML parsing)
cat > $OUT/xfa_parser.fuzz.options << EOF
[libfuzzer]
max_len = 262144
timeout = 60
rss_limit_mb = 2048
EOF

echo "Build complete! $(ls $OUT/*.fuzz 2>/dev/null | wc -l) fuzzers built."
