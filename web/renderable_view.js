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

const RenderingStates = {
  INITIAL: 0,
  RUNNING: 1,
  PAUSED: 2,
  FINISHED: 3,
};

class RenderableView {
  /**
   * Unique ID for rendering queue.
   * @type {string}
   */
  renderingId = "";

  /**
   * @type {RenderTask | null}
   */
  renderTask = null;

  /**
   * @type {function | null}
   */
  resume = null;

  constructor() {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === RenderableView
    ) {
      throw new Error("Cannot initialize RenderableView.");
    }
  }

  /**
   * @type {RenderingStates}
   */
  get renderingState() {
    throw new Error("Abstract getter `renderingState` accessed");
  }

  /**
   * @param {RenderingStates}
   */
  set renderingState(state) {
    throw new Error("Abstract setter `renderingState` accessed");
  }

  /**
   * @returns {Promise} Resolved on draw completion.
   */
  async draw() {
    throw new Error("Not implemented: draw");
  }
}

export { RenderableView, RenderingStates };
