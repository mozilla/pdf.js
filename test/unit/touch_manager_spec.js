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

import { TouchManager } from "../../src/display/touch_manager.js";

describe("TouchManager", function () {
  function makeTouch(identifier, x, y = 0) {
    return {
      identifier,
      screenX: x,
      screenY: y,
      clientX: x,
      clientY: y,
    };
  }

  class TouchManagerHelper {
    #ac = new AbortController();

    constructor() {
      this.container = new EventTarget();
      this.pinchings = [];
      this.pinchStarts = 0;
      this.pinchEnds = 0;

      this.manager = new TouchManager({
        container: this.container,
        onPinchStart: () => {
          this.pinchStarts += 1;
        },
        onPinching: (origin, prevDistance, distance) => {
          this.pinchings.push({ origin, prevDistance, distance });
        },
        onPinchEnd: () => {
          this.pinchEnds += 1;
        },
        signal: this.#ac.signal,
      });
    }

    dispatch(type, touches, changedTouches) {
      const event = Object.assign(new Event(type, { cancelable: true }), {
        touches,
        changedTouches,
      });
      this.container.dispatchEvent(event);
      return event;
    }

    destroy() {
      this.manager.destroy();
      this.#ac.abort();
    }
  }

  it("tracks only touches whose starts reach the container", function () {
    const helper = new TouchManagerHelper();
    const own0 = makeTouch(0, 100);
    const own1 = makeTouch(1, 300);
    const foreign = makeTouch(2, 500);

    helper.dispatch("touchstart", [own0], [own0]);
    helper.dispatch("touchstart", [own0, own1, foreign], [own1]);
    expect(helper.pinchStarts).toEqual(1);

    helper.dispatch("touchend", [own1, foreign], [own0]);
    expect(helper.pinchEnds).toEqual(1);

    // The end of own1 is not delivered. The next start must remove its stale
    // identifier before adding the newly changed touch.
    const own3 = makeTouch(3, 100);
    const own4 = makeTouch(4, 300);
    helper.dispatch("touchstart", [foreign, own3], [own3]);
    expect(helper.pinchStarts).toEqual(1);
    helper.dispatch("touchstart", [foreign, own3, own4], [own4]);
    expect(helper.pinchStarts).toEqual(2);

    helper.destroy();
  });

  it("re-baselines when exactly two tracked touches remain", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);
    const touch2 = makeTouch(2, 400);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);
    helper.dispatch("touchstart", [touch0, touch1, touch2], [touch2]);
    helper.dispatch("touchend", [touch0, touch1], [touch2]);

    const moved0 = makeTouch(0, -50);
    const moved1 = makeTouch(1, 250);
    helper.dispatch("touchmove", [moved0, moved1], [moved0, moved1]);
    expect(helper.pinchings).toEqual([]);

    const movedAgain0 = makeTouch(0, -100);
    const movedAgain1 = makeTouch(1, 300);
    helper.dispatch(
      "touchmove",
      [movedAgain0, movedAgain1],
      [movedAgain0, movedAgain1]
    );
    expect(helper.pinchings).toEqual([
      {
        origin: [100, 0],
        prevDistance: 300,
        distance: 400,
      },
    ]);

    helper.destroy();
  });

  it("doesn't report a scale change for a degenerate span", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    // Set a 160px scale baseline.
    const moved0 = makeTouch(0, 20);
    const moved1 = makeTouch(1, 180);
    helper.dispatch("touchmove", [moved0, moved1], [moved0, moved1]);
    expect(helper.pinchings).toEqual([]);

    // Ignore a zero span.
    const merged0 = makeTouch(0, 110);
    const merged1 = makeTouch(1, 110);
    helper.dispatch("touchmove", [merged0, merged1], [merged0, merged1]);
    expect(helper.pinchings).toEqual([]);

    // Resume from the 160px baseline.
    const spread0 = makeTouch(0, 20);
    const spread1 = makeTouch(1, 220);
    helper.dispatch("touchmove", [spread0, spread1], [spread0, spread1]);
    expect(helper.pinchings.length).toEqual(1);
    const { prevDistance, distance } = helper.pinchings[0];
    expect([prevDistance, distance]).toEqual([160, 200]);

    helper.destroy();
  });

  it("keeps pinching when the tracked pair changes", function () {
    const helper = new TouchManagerHelper();
    const { MIN_TOUCH_DISTANCE_TO_PINCH: minDistance } = helper.manager;
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    // Past the dead zone: the first move only re-baselines...
    const spread1 = makeTouch(1, 400);
    helper.dispatch("touchmove", [touch0, spread1], [spread1]);
    expect(helper.pinchings).toEqual([]);

    // ...and the second one is reported, hence pinching is in progress.
    const spread2 = makeTouch(1, 600);
    helper.dispatch("touchmove", [touch0, spread2], [spread2]);
    expect(helper.pinchings.length).toEqual(1);

    // A third finger lands and is lifted right away.
    const touch2 = makeTouch(2, 500, 400);
    helper.dispatch("touchstart", [touch0, spread2, touch2], [touch2]);
    helper.dispatch("touchend", [touch0, spread2], [touch2]);

    // The pinch is still in progress, hence a move well inside the dead zone is
    // still reported instead of having to earn it all over again.
    const nudge = minDistance / 2;
    const spread3 = makeTouch(1, 600 + nudge);
    helper.dispatch("touchmove", [touch0, spread3], [spread3]);
    expect(helper.pinchings.length).toEqual(2);
    expect(helper.pinchings[1].prevDistance).toEqual(600);
    expect(helper.pinchings[1].distance).toBeCloseTo(600 + nudge);

    helper.destroy();
  });

  it("doesn't keep pinching into the next gesture", function () {
    const helper = new TouchManagerHelper();
    const { MIN_TOUCH_DISTANCE_TO_PINCH: minDistance } = helper.manager;
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);
    const spread1 = makeTouch(1, 400);
    const spread2 = makeTouch(1, 600);
    helper.dispatch("touchmove", [touch0, spread1], [spread1]);
    helper.dispatch("touchmove", [touch0, spread2], [spread2]);
    expect(helper.pinchings.length).toEqual(1);

    // A third finger breaks the pair, and then everything is lifted.
    const touch2 = makeTouch(2, 500, 400);
    helper.dispatch("touchstart", [touch0, spread2, touch2], [touch2]);
    helper.dispatch("touchend", [touch0], [spread2, touch2]);
    helper.dispatch("touchend", [], [touch0]);
    expect(helper.pinchEnds).toEqual(1);

    // The next gesture must earn the dead zone again.
    const next0 = makeTouch(3, 0);
    const next1 = makeTouch(4, 200);
    helper.dispatch("touchstart", [next0], [next0]);
    helper.dispatch("touchstart", [next0, next1], [next1]);
    helper.dispatch(
      "touchmove",
      [next0, makeTouch(4, 200 + minDistance / 2)],
      []
    );
    expect(helper.pinchings.length).toEqual(1);

    helper.destroy();
  });

  it("ends the gesture in flight when destroyed", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 100);
    const touch1 = makeTouch(1, 300);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);
    expect(helper.pinchStarts).toEqual(1);
    expect(helper.pinchEnds).toEqual(0);

    // Destroy the manager while both touches are active.
    helper.manager.destroy();
    expect(helper.pinchEnds).toEqual(1);

    // A later `touchend` must not call `onPinchEnd` again.
    helper.dispatch("touchend", [], [touch0, touch1]);
    expect(helper.pinchEnds).toEqual(1);

    helper.destroy();
  });
});
