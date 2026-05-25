/* Copyright 2020 Mozilla Foundation
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

import { cursor } from "./constants.js";

globalThis.FullScreen = class FullScreen {
  #backgroundColor = [];

  #clickAdvances = true;

  #cursor = cursor.hidden;

  #defaultTransition = "";

  #escapeExits = true;

  #isFullScreen = true;

  #loop = false;

  #timeDelay = 3600;

  #usePageTiming = false;

  #useTimer = false;

  get backgroundColor() {
    return this.#backgroundColor;
  }

  set backgroundColor(_) {
    /* TODO or not */
  }

  get clickAdvances() {
    return this.#clickAdvances;
  }

  set clickAdvances(_) {
    /* TODO or not */
  }

  get cursor() {
    return this.#cursor;
  }

  set cursor(_) {
    /* TODO or not */
  }

  get defaultTransition() {
    return this.#defaultTransition;
  }

  set defaultTransition(_) {
    /* TODO or not */
  }

  get escapeExits() {
    return this.#escapeExits;
  }

  set escapeExits(_) {
    /* TODO or not */
  }

  get isFullScreen() {
    return this.#isFullScreen;
  }

  set isFullScreen(_) {
    /* TODO or not */
  }

  get loop() {
    return this.#loop;
  }

  set loop(_) {
    /* TODO or not */
  }

  get timeDelay() {
    return this.#timeDelay;
  }

  set timeDelay(_) {
    /* TODO or not */
  }

  get transitions() {
    // This list of possible value for transition has been found:
    // https://www.adobe.com/content/dam/acom/en/devnet/acrobat/pdfs/5186AcroJS.pdf#page=198
    return [
      "Replace",
      "WipeRight",
      "WipeLeft",
      "WipeDown",
      "WipeUp",
      "SplitHorizontalIn",
      "SplitHorizontalOut",
      "SplitVerticalIn",
      "SplitVerticalOut",
      "BlindsHorizontal",
      "BlindsVertical",
      "BoxIn",
      "BoxOut",
      "GlitterRight",
      "GlitterDown",
      "GlitterRightDown",
      "Dissolve",
      "Random",
    ];
  }

  set transitions(_) {
    throw new Error("fullscreen.transitions is read-only");
  }

  get usePageTiming() {
    return this.#usePageTiming;
  }

  set usePageTiming(_) {
    /* TODO or not */
  }

  get useTimer() {
    return this.#useTimer;
  }

  set useTimer(_) {
    /* TODO or not */
  }
};

export {};
