/* Copyright 2012 Mozilla Foundation
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

class Console {
  constructor(consoleAPI) {
    this._consoleAPI = consoleAPI || window.console;
  }

  clear() {
    this._consoleAPI.clear();
  }

  hide() {
    // Disabled on purpose; not suitable in the context of a web application.
  }

  println(msg) {
    this._consoleAPI.log('PDF.js Console:: ' + msg);
  }

  show() {
    // Disabled on purpose; not suitable in the context of a web application.
  }
}

export {
  Console,
};
