/* Copyright 2018 Mozilla Foundation
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

import { getVerbosityLevel, setVerbosityLevel } from "./shared/util.js";
import { Jbig2mage } from "./core/jbig2.js";
import { JpegImage } from "./core/jpg.js";
import { JpxImage } from "./core/jpx.js";

// To ensure that the standalone PDF.js image decoders have the same
// browser/environment compatibility as the regular PDF.js library,
// the standard set of polyfills are thus included in this build as well.
//
// Given that the (current) image decoders don't use all of the features
// of the complete PDF.js library, e.g. they are completely synchronous,
// some of the larger polyfills are thus unnecessary.
//
// In an attempt to reduce the size of the standalone PDF.js image decoders,
// the following polyfills are currently being excluded:
//  - ReadableStream
//  - Promise
//  - URL

// eslint-disable-next-line no-unused-vars
const pdfjsVersion = PDFJSDev.eval("BUNDLE_VERSION");
// eslint-disable-next-line no-unused-vars
const pdfjsBuild = PDFJSDev.eval("BUNDLE_BUILD");

export { Jbig2mage, JpegImage, JpxImage, getVerbosityLevel, setVerbosityLevel };
