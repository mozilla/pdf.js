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

const GlobalWorkerOptions = Object.create(null);

/**
 * Defines global port for worker process. Overrides the `workerSrc` option.
 * @var {Object}
 */
GlobalWorkerOptions.workerPort = (GlobalWorkerOptions.workerPort === undefined ?
                                  null : GlobalWorkerOptions.workerPort);

/**
 * Path and filename of the worker file. Required when workers are enabled in
 * development mode. If unspecified in production builds, the worker will be
 * loaded based on the location of the `pdf.js` file.
 *
 * NOTE: The `workerSrc` should always be set in custom applications, in order
 *       to prevent issues caused by third-party frameworks and libraries.
 * @var {string}
 */
GlobalWorkerOptions.workerSrc = (GlobalWorkerOptions.workerSrc === undefined ?
                                 '' : GlobalWorkerOptions.workerSrc);

export {
  GlobalWorkerOptions,
};
