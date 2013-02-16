/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
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

onmessage = function (e) {
  var data = e.data;
  switch (data.action) {
  case 'test':
    postMessage({action: 'test', result: data.data instanceof Uint8Array});
    break;
  case 'xhr':
    var xhr = new XMLHttpRequest();
    var responseExists = 'response' in xhr || 'mozResponse' in xhr ||
        'responseArrayBuffer' in xhr || 'mozResponseArrayBuffer' in xhr;
    postMessage({action: 'xhr', result: responseExists});
    break;
  case 'TextDecoder':
    postMessage({action: 'TextDecoder',
                 result: typeof TextDecoder !== 'undefined',
                 emulated: typeof FileReaderSync !== 'undefined'});
    break;
  }
};

