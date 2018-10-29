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

import "jasmine";

// Helper functions that make Jasmine tests more async/await friendly.

function makeSafeFn(fn?: () => Promise<void> | void) {
  return async (done: DoneFn) => {
    try {
      fn && (await fn());
      done();
    } catch (err) {
      done.fail(err);
    }
  };
}

export function expectFieldType(obj: object, field: string, type: string) {
  expect(`${field}: ${typeof obj[field]}`).toBe(`${field}: ${type}`);
}

type callback = () => Promise<void> | void;

export function test(msg: string, fn?: callback, timeout?: number) {
  it(msg, makeSafeFn(fn), timeout);
}

export let asyncTest = test;

export function asyncBeforeAll(action: callback, timeout?: number) {
  beforeAll(makeSafeFn(action), timeout);
}

export function asyncAfterAll(action: callback, timeout?: number) {
  afterAll(makeSafeFn(action), timeout);
}

export function asyncBeforeEach(action: callback, timeout?: number) {
  beforeEach(makeSafeFn(action), timeout);
}

export function asyncAfterEach(action: callback, timeout?: number) {
  afterEach(makeSafeFn(action), timeout);
}


// Utility functions to perform type verification for array types.

export function expectArray(a: any[], len?: number) {
  expect(a).toEqual(jasmine.any(Array));
  if(len) {
    expect(a.length).toBe(len);
  }
}

export function expectNumberArray(a: number[], len?: number) {
  expectArray(a, len);
  expect(typeof a[0]).toBe('number');
}

export function expectTypedArray(a: Uint8Array) {
  expect(a).toEqual(jasmine.any(Uint8Array));
}

export function expectTransform(m: number[]) {
  expectNumberArray(m, 6);
}

export function expectPoint(point: number[]) {
  expectNumberArray(point, 2);
}

export function expectRect(rect: number[]) {
  expectNumberArray(rect, 4);
}
