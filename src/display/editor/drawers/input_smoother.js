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

/**
 * Average pointer positions over a sliding time window to reduce jitter.
 * Based on Google Ink's sliding window input model (https://github.com/google/ink).
 */
class InputSmoother {
  // Half the averaging window, in ms.
  static #HALF_WINDOW = 10;

  // Target interval between smoothed points, in ms, subject to #MAX_DIVISIONS.
  static #UPSAMPLING_PERIOD = 1000 / 180;

  static #MAX_DIVISIONS = 100;

  // Offset (in ms) for non-increasing timestamps.
  static #TIME_EPSILON = 1e-3;

  // Flat input samples: [x, y, timestamp, ...].
  #samples;

  // Stroke start time, retained after old samples are discarded.
  #firstTime;

  // The time of the last stable smoothed point.
  #lastTime;

  constructor(x, y, timeStamp) {
    this.#samples = [x, y, timeStamp];
    this.#firstTime = this.#lastTime = timeStamp;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} timeStamp
   * @returns {Array<number>} new stable points as [x, y, ...].
   */
  add(x, y, timeStamp) {
    const samples = this.#samples;
    const lastTime = samples.at(-1);
    timeStamp =
      timeStamp > lastTime ? timeStamp : lastTime + InputSmoother.#TIME_EPSILON;
    samples.push(x, y, timeStamp);

    // Emit points whose averaging windows no longer depend on future samples.
    const points = this.#smooth(timeStamp - InputSmoother.#HALF_WINDOW, true);

    // Keep enough input for future averaging windows. Compact only when
    // at least half the buffer can be discarded.
    const start = this.#getSampleIndex(
      this.#lastTime - InputSmoother.#HALF_WINDOW
    );
    if (start >= samples.length / 2) {
      samples.copyWithin(0, start);
      samples.length -= start;
    }
    return points;
  }

  /**
   * @returns {Array<number>} unstable points as [x, y, ...], ending at the
   *   latest sample when nonempty.
   */
  get pendingPoints() {
    return this.#smooth(Infinity, false);
  }

  /**
   * @returns {Array<number>} remaining smoothed points as [x, y, ...].
   */
  end() {
    return this.#smooth(Infinity, true);
  }

  #smooth(maxTime, isStable) {
    const samples = this.#samples;
    const firstTime = this.#firstTime;
    const lastTime = samples.at(-1);
    const points = [];
    const time = this.#lastTime;
    for (let i = this.#getSampleIndex(time) + 3; i < samples.length; i += 3) {
      // Subdivide long gaps between samples.
      const startTime = samples[i - 1];
      const dt = samples[i + 2] - startTime;
      const n = Math.min(
        Math.ceil(dt / InputSmoother.#UPSAMPLING_PERIOD),
        InputSmoother.#MAX_DIVISIONS
      );
      for (let k = 1; k <= n; k++) {
        const t = k === n ? samples[i + 2] : startTime + (dt * k) / n;
        if (t <= time) {
          continue;
        }
        if (t > maxTime) {
          return points;
        }
        const halfWindow = Math.min(
          InputSmoother.#HALF_WINDOW,
          t - firstTime,
          lastTime - t
        );
        this.#average(t - halfWindow, t + halfWindow, points);
        if (isStable) {
          this.#lastTime = t;
        }
      }
    }
    return points;
  }

  /**
   * @returns {number} array offset of the last sample at or before `time`.
   *   Returns 0 if `time` precedes the first sample.
   */
  #getSampleIndex(time) {
    const samples = this.#samples;
    let start = 0;
    let end = samples.length / 3 - 1;
    while (start < end) {
      const middle = (start + end + 1) >> 1;
      if (samples[3 * middle + 2] <= time) {
        start = middle;
      } else {
        end = middle - 1;
      }
    }
    return 3 * start;
  }

  /**
   * Append the time average of the piecewise-linear input.
   */
  #average(startTime, endTime, points) {
    const samples = this.#samples;
    const index = this.#getSampleIndex(startTime);
    let sumX = 0,
      sumY = 0,
      duration = 0;
    for (
      let i = index;
      i < samples.length - 3 && samples[i + 2] < endTime;
      i += 3
    ) {
      const x1 = samples[i],
        y1 = samples[i + 1],
        t1 = samples[i + 2],
        t2 = samples[i + 5];
      const start = Math.max(t1, startTime);
      const end = Math.min(t2, endTime);
      if (end <= start) {
        continue;
      }
      // The trapezoidal rule is exact for a linear function.
      const dt = end - start;
      const ratio = (start + end - 2 * t1) / (t2 - t1);
      sumX += dt * (x1 + (ratio * (samples[i + 3] - x1)) / 2);
      sumY += dt * (y1 + (ratio * (samples[i + 4] - y1)) / 2);
      duration += dt;
    }
    if (duration === 0) {
      // Use the sample directly when the window has no duration.
      points.push(samples[index], samples[index + 1]);
    } else {
      points.push(sumX / duration, sumY / duration);
    }
  }
}

export { InputSmoother };
