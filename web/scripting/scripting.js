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

import { App } from './api/App';
import { Console } from './api/Console';

const Scripting = {
  getAPI(runtime, console, chromeObj) {
    chromeObj.app = new App(runtime);
    chromeObj.console = new Console(console);
    chromeObj.globals = {};
  },
};

export {
  Scripting,
};
