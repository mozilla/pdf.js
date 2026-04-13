/* Copyright 2026 Mozilla Foundation
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

import { isNodeJS, setVerbosityLevel } from "../shared/util.js";
import { MessageHandler } from "../shared/message_handler.js";

class RendererMessageHandler {
  static {
    // Worker thread (and not Node.js)?
    if (
      typeof window === "undefined" &&
      !isNodeJS &&
      typeof self !== "undefined" &&
      /* isMessagePort = */
      typeof self.postMessage === "function" &&
      "onmessage" in self
    ) {
      this.initializeFromPort(self);
    }
  }

  static initializeFromPort(port) {
    const handler = new MessageHandler("renderer", "main", port);
    this.setup(handler);
    handler.send("ready", null);
  }

  static setup(handler) {
    let testMessageProcessed = false;
    handler.on("test", data => {
      if (testMessageProcessed) {
        return;
      }
      testMessageProcessed = true;

      // Ensure that `TypedArray`s can be sent to the worker.
      handler.send("test", data instanceof Uint8Array);
    });

    handler.on("configure", data => {
      setVerbosityLevel(data.verbosity);
    });
  }
}

export { RendererMessageHandler };
