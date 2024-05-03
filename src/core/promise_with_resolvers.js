/**
 * @typedef {Object} PromiseWithResolvers
 * @property {Promise} promise
 * @property {function} resolve
 * @property {function} reject
 */

/** @return {PromiseWithResolvers} */
function promiseWithResolvers() {
  const encapsulatedPromise = {};

  encapsulatedPromise.promise = new Promise((resolve, reject) => {
    encapsulatedPromise.resolve = resolve;
    encapsulatedPromise.reject = reject;
  });

  return encapsulatedPromise;
}

export { promiseWithResolvers };
