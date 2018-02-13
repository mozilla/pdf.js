/* Copyright 2017 Mozilla Foundation
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

import { VerbosityLevel } from '../shared/util';

const defaultOptions = {
  /**
   * Enables transfer usage in postMessage for ArrayBuffers.
   * @var {boolean}
   */
  postMessageTransfers: true,

  /**
   * Controls the logging level.
   * The constants from {VerbosityLevel} should be used:
   * - ERRORS
   * - WARNINGS [default]
   * - INFOS
   * @var {number}
   */
  verbosity: VerbosityLevel.WARNINGS,

  /**
   * Defines global port for worker process. Overrides the `workerSrc` option.
   * @var {Object}
   */
  workerPort: null,

  /**
   * Path and filename of the worker file. Required when the worker is enabled
   * in development mode. If unspecified in the production build, the worker
   * will be loaded based on the location of the `pdf.js` file.
   *
   * NOTE: The `workerSrc` should always be set in custom applications, in order
   *       to prevent issues caused by third-party frameworks and libraries.
   * @var {string}
   */
  workerSrc: '',
};

let userOptions = Object.create(null);

class WorkerOptions {
  constructor() {
    throw new Error('Cannot initialize WorkerOptions.');
  }

  static get(name) {
    let defaultOption = defaultOptions[name], userOption = userOptions[name];
    if (defaultOption === undefined) {
      console.error(`WorkerOptions.get: "${name}" is undefined.`);
      return;
    }
    return (userOption !== undefined ? userOption : defaultOption);
  }

  static getAll() {
    let options = Object.create(null);
    for (let name in defaultOptions) {
      let defaultOption = defaultOptions[name], userOption = userOptions[name];
      options[name] = (userOption !== undefined ? userOption : defaultOption);
    }
    return options;
  }

  static set(name, value) {
    let defaultOption = defaultOptions[name];
    if (defaultOption === undefined) {
      console.error(`WorkerOptions.set: "${name}" is undefined.`);
      return;
    }
    if (value === undefined) {
      console.error(`WorkerOptions.set: "${name}" has no value specified.`);
      return;
    }
    if (typeof value !== typeof defaultOption) {
      console.error(`WorkerOptions.set: "${value}" is a ${typeof value}, ` +
                    `expected a ${typeof defaultOption}.`);
      return;
    }
    userOptions[name] = value;
  }

  static remove(name) {
    if (defaultOptions[name] === undefined) {
      console.error(`WorkerOptions.remove: "${name}" is undefined.`);
      return;
    }
    delete userOptions[name];
  }
}

export {
  WorkerOptions,
};
