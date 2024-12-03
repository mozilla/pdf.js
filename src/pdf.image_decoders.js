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

import {
  getVerbosityLevel,
  setVerbosityLevel,
  VerbosityLevel,
} from "./shared/util.js";
import { Jbig2Error, Jbig2Image } from "./core/jbig2.js";
import { JpegError, JpegImage } from "./core/jpg.js";
import { JpxError, JpxImage } from "./core/jpx.js";

/* eslint-disable-next-line no-unused-vars */
const pdfjsVersion =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_VERSION") : void 0;
/* eslint-disable-next-line no-unused-vars */
const pdfjsBuild =
  typeof PDFJSDev !== "undefined" ? PDFJSDev.eval("BUNDLE_BUILD") : void 0;

export {
  getVerbosityLevel,
  Jbig2Error,
  Jbig2Image,
  JpegError,
  JpegImage,
  JpxError,
  JpxImage,
  setVerbosityLevel,
  VerbosityLevel,
};
