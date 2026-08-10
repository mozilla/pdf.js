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
  // Offset screen coordinates so origin tests catch screen/client mix-ups.
  const SCREEN_OFFSET = 1000;

  function makeTouch(identifier, x, y = 0) {
    return {
      identifier,
      screenX: x + SCREEN_OFFSET,
      screenY: y + SCREEN_OFFSET,
      clientX: x,
      clientY: y,
    };
  }

  class TouchManagerHelper {
    #ac = new AbortController();

    constructor(options = {}) {
      this.container = new EventTarget();
      this.pannings = [];
      this.pinchings = [];
      this.pinchStarts = 0;
      this.pinchEnds = 0;
      this.defaultPrevented = [];

      this.manager = new TouchManager({
        container: this.container,
        onPinchStart: () => {
          this.pinchStarts += 1;
        },
        onPinching: (origin, prevDistance, distance, panX, panY) => {
          this.pinchings.push({ origin, prevDistance, distance, panX, panY });
        },
        onPinchEnd: () => {
          this.pinchEnds += 1;
        },
        onPanning: (dx, dy) => {
          this.pannings.push([dx, dy]);
        },
        signal: this.#ac.signal,
        ...options,
      });
    }

    dispatch(type, touches, changedTouches, { cancelable = true } = {}) {
      const event = Object.assign(new Event(type, { cancelable }), {
        touches,
        changedTouches,
      });
      this.container.dispatchEvent(event);
      this.defaultPrevented.push(event.defaultPrevented);
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
        panX: 0,
        panY: 0,
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

  it("pans when both fingers move together", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 100, 100);
    const touch1 = makeTouch(1, 300, 100);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    const moved0 = makeTouch(0, 120, 130);
    const moved1 = makeTouch(1, 320, 130);
    helper.dispatch("touchmove", [moved0, moved1], [moved0, moved1]);

    expect(helper.pannings).toEqual([[20, 30]]);
    expect(helper.pinchings).toEqual([]);
    expect(helper.pinchStarts).toEqual(1);

    helper.destroy();
  });

  it("pans, without zooming, inside the dead zone", function () {
    const helper = new TouchManagerHelper();
    const { MIN_TOUCH_DISTANCE_TO_PINCH: minDistance } = helper.manager;
    expect(minDistance).toBeGreaterThan(0);
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    // Stay below the pinch threshold; only midpoint movement is reported.
    const nearly = makeTouch(1, 200 + minDistance - 1);
    helper.dispatch("touchmove", [touch0, nearly], [nearly]);
    expect(helper.pinchings).toEqual([]);
    expect(helper.pannings.length).toEqual(1);

    // The original distance baseline lets this move cross the threshold.
    const past = makeTouch(1, 200 + minDistance + 1);
    helper.dispatch("touchmove", [touch0, past], [past]);
    expect(helper.pinchings).toEqual([]);
    expect(helper.pannings.length).toEqual(2);

    const further = makeTouch(1, 200 + minDistance + 21);
    helper.dispatch("touchmove", [touch0, further], [further]);
    expect(helper.pinchings.length).toEqual(1);
    expect(
      helper.pinchings[0].distance - helper.pinchings[0].prevDistance
    ).toEqual(20);

    helper.destroy();
  });

  it("reports the previous midpoint, in client coordinates, as the origin", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 0, 500);
    const touch1 = makeTouch(1, 200, 500);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    // Spread the fingers past the dead zone, to start pinching.
    const spread0 = makeTouch(0, -100, 500);
    const spread1 = makeTouch(1, 300, 500);
    helper.dispatch("touchmove", [spread0, spread1], [spread0, spread1]);
    expect(helper.pinchings).toEqual([]);

    // Spread them further, while also translating them by (10, 20).
    const further0 = makeTouch(0, -190, 520);
    const further1 = makeTouch(1, 410, 520);
    helper.dispatch("touchmove", [further0, further1], [further0, further1]);

    expect(helper.pinchings.length).toEqual(1);
    const { origin, panX, panY } = helper.pinchings[0];
    // A screen-coordinate origin would be off by SCREEN_OFFSET.
    expect(origin).toEqual([100, 500]);
    expect([panX, panY]).toEqual([10, 20]);

    helper.destroy();
  });

  it("doesn't act on a non-cancelable touchmove", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    // Ignore moves that PDF.js cannot claim with `preventDefault()`, even when
    // they both translate the fingers and spread them past the dead zone.
    const spread1 = makeTouch(1, 400, 30);
    helper.dispatch("touchmove", [touch0, spread1], [spread1], {
      cancelable: false,
    });
    const spread2 = makeTouch(1, 600, 60);
    helper.dispatch("touchmove", [touch0, spread2], [spread2], {
      cancelable: false,
    });

    expect(helper.pannings).toEqual([]);
    expect(helper.pinchings).toEqual([]);

    helper.destroy();
  });

  it("takes the gesture back when the events are cancelable again", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 100, 100);
    const touch1 = makeTouch(1, 300, 100);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    const moved0 = makeTouch(0, 120, 130);
    const moved1 = makeTouch(1, 320, 130);
    helper.dispatch("touchmove", [moved0, moved1], [moved0, moved1], {
      cancelable: false,
    });

    // Re-baseline when the event becomes cancelable again.
    const back0 = makeTouch(0, 140, 160);
    const back1 = makeTouch(1, 340, 160);
    helper.dispatch("touchmove", [back0, back1], [back0, back1]);
    expect(helper.pannings).toEqual([]);

    // The next delta is relative to the new baseline.
    const next0 = makeTouch(0, 145, 170);
    const next1 = makeTouch(1, 345, 170);
    helper.dispatch("touchmove", [next0, next1], [next0, next1]);
    expect(helper.pannings).toEqual([[5, 10]]);
    expect(helper.defaultPrevented).toEqual([false, true, false, true, true]);

    helper.destroy();
  });

  it("re-baselines the panning when a third finger comes and goes", function () {
    const helper = new TouchManagerHelper();
    const touch0 = makeTouch(0, 100, 100);
    const touch1 = makeTouch(1, 300, 100);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    const moved0 = makeTouch(0, 110, 100);
    const moved1 = makeTouch(1, 310, 100);
    helper.dispatch("touchmove", [moved0, moved1], [moved0, moved1]);
    expect(helper.pannings).toEqual([[10, 0]]);

    // A third finger suspends the two-finger gesture.
    const touch2 = makeTouch(2, 500, 400);
    helper.dispatch("touchstart", [moved0, moved1, touch2], [touch2]);
    const three0 = makeTouch(0, 200, 100);
    const three1 = makeTouch(1, 400, 100);
    const threeFingersMove = helper.dispatch(
      "touchmove",
      [three0, three1, touch2],
      [three0, three1]
    );
    expect(helper.pannings.length).toEqual(1);
    // This manager only handles two-finger gestures.
    expect(threeFingersMove.defaultPrevented).toEqual(false);

    // Resume from the current positions, excluding the three-finger movement.
    helper.dispatch("touchend", [three0, three1], [touch2]);
    const last0 = makeTouch(0, 205, 100);
    const last1 = makeTouch(1, 405, 100);
    helper.dispatch("touchmove", [last0, last1], [last0, last1]);
    expect(helper.pannings).toEqual([
      [10, 0],
      [5, 0],
    ]);

    helper.destroy();
  });

  it("behaves as before when onPanning is omitted", function () {
    // Editors omit onPanning.
    const helper = new TouchManagerHelper({ onPanning: null });
    const touch0 = makeTouch(0, 0);
    const touch1 = makeTouch(1, 200);

    helper.dispatch("touchstart", [touch0], [touch0]);
    helper.dispatch("touchstart", [touch0, touch1], [touch1]);

    const spread0 = makeTouch(0, -100, 20);
    const spread1 = makeTouch(1, 300, 20);
    helper.dispatch("touchmove", [spread0, spread1], [spread0, spread1]);
    const further0 = makeTouch(0, -150, 40);
    const further1 = makeTouch(1, 350, 40);
    helper.dispatch("touchmove", [further0, further1], [further0, further1]);

    expect(helper.pannings).toEqual([]);
    expect(helper.pinchings.length).toEqual(1);
    const { prevDistance, distance } = helper.pinchings[0];
    expect(prevDistance).toEqual(400);
    expect(distance).toEqual(500);

    helper.destroy();
  });
});
