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

var FirefoxCom = (function FirefoxComClosure() {
  return {
    /**
     * Creates an event that the extension is listening for and will
     * synchronously respond to.
     * NOTE: It is reccomended to use request() instead since one day we may not
     * be able to synchronously reply.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @return {*} The response.
     */
    requestSync: function(action, data) {
      var request = document.createTextNode('');
      request.setUserData('action', action, null);
      request.setUserData('data', data, null);
      request.setUserData('sync', true, null);
      document.documentElement.appendChild(request);

      var sender = document.createEvent('Events');
      sender.initEvent('pdf.js.message', true, false);
      request.dispatchEvent(sender);
      var response = request.getUserData('response');
      document.documentElement.removeChild(request);
      return response;
    },
    /**
     * Creates an event that the extension is listening for and will
     * asynchronously respond by calling the callback.
     * @param {String} action The action to trigger.
     * @param {String} data Optional data to send.
     * @param {Function} callback Optional response callback that will be called
     * with one data argument.
     */
    request: function(action, data, callback) {
      var request = document.createTextNode('');
      request.setUserData('action', action, null);
      request.setUserData('data', data, null);
      request.setUserData('sync', false, null);
      if (callback) {
        request.setUserData('callback', callback, null);

        document.addEventListener('pdf.js.response', function listener(event) {
          var node = event.target,
              callback = node.getUserData('callback'),
              response = node.getUserData('response');

          document.documentElement.removeChild(node);

          document.removeEventListener('pdf.js.response', listener, false);
          return callback(response);
        }, false);
      }
      document.documentElement.appendChild(request);

      var sender = document.createEvent('HTMLEvents');
      sender.initEvent('pdf.js.message', true, false);
      return request.dispatchEvent(sender);
    }
  };
})();
