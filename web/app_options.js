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

const OptionKind = {
  VIEWER: 'viewer',
  API: 'api',
  WORKER: 'worker',
};

/**
 * PLEASE NOTE: To avoid introducing unnecessary dependencies, we specify the
 *              values below *explicitly* rather than relying on imported types;
 *              compare with the format of `default_preferences.json`.
 */
const defaultOptions = {
};

const userOptions = Object.create(null);

class AppOptions {
  constructor() {
    throw new Error('Cannot initialize AppOptions.');
  }

  static get(name) {
    let defaultOption = defaultOptions[name], userOption = userOptions[name];
    if (userOption !== undefined) {
      return userOption;
    }
    return (defaultOption !== undefined ? defaultOption.value : undefined);
  }

  static getAll(kind = null) {
    let options = Object.create(null);
    for (let name in defaultOptions) {
      let defaultOption = defaultOptions[name], userOption = userOptions[name];
      if (kind && defaultOption.kind !== kind) {
        continue;
      }
      options[name] = (userOption !== undefined ?
                       userOption : defaultOption.value);
    }
    return options;
  }

  static set(name, value) {
    userOptions[name] = value;
  }

  static remove(name) {
    delete userOptions[name];
  }
}

export {
  AppOptions,
  OptionKind,
};
