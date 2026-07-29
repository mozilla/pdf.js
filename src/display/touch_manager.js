/* Copyright 2024 Mozilla Foundation
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

import { OutputScale, stopEvent } from "./display_utils.js";

function preventDefault(evt) {
  evt.preventDefault();
}

class TouchManager {
  #container;

  #isPinching = false;

  #isPinchingStopped = null;

  #isPinchingDisabled;

  #onPinchStart;

  #onPinching;

  #onPinchEnd;

  #pointerDownAC = null;

  #signal;

  #touchIds = new Set();

  #touchInfo = null;

  #touchManagerAC;

  #touchMoveAC = null;

  constructor({
    container,
    isPinchingDisabled = null,
    isPinchingStopped = null,
    onPinchStart = null,
    onPinching = null,
    onPinchEnd = null,
    signal,
  }) {
    this.#container = container;
    this.#isPinchingStopped = isPinchingStopped;
    this.#isPinchingDisabled = isPinchingDisabled;
    this.#onPinchStart = onPinchStart;
    this.#onPinching = onPinching;
    this.#onPinchEnd = onPinchEnd;
    this.#touchManagerAC = new AbortController();
    this.#signal = AbortSignal.any([signal, this.#touchManagerAC.signal]);

    container.addEventListener("touchstart", this.#onTouchStart.bind(this), {
      passive: false,
      signal: this.#signal,
    });
  }

  /**
   * NOTE: Don't shadow this value since `devicePixelRatio` may change if the
   * window resolution changes, e.g. if the viewer is moved to another monitor.
   */
  get MIN_TOUCH_DISTANCE_TO_PINCH() {
    // The 35 is coming from:
    //  https://searchfox.org/mozilla-central/source/gfx/layers/apz/src/GestureEventListener.cpp#36
    //
    // The properties TouchEvent::screenX/Y are in screen CSS pixels:
    //  https://developer.mozilla.org/en-US/docs/Web/API/Touch/screenX#examples
    // MIN_TOUCH_DISTANCE_TO_PINCH is in CSS pixels.
    return 35 / OutputScale.pixelRatio;
  }

  #onTouchStart(evt) {
    if (this.#isPinchingDisabled?.()) {
      return;
    }

    this.#pruneTouchIds(evt);
    const touchIds = this.#touchIds;
    for (const { identifier } of evt.changedTouches) {
      touchIds.add(identifier);
    }

    if (touchIds.size === 1) {
      if (this.#pointerDownAC) {
        return;
      }
      const pointerDownAC = (this.#pointerDownAC = new AbortController());
      const signal = AbortSignal.any([this.#signal, pointerDownAC.signal]);
      const container = this.#container;

      // We want to have the events at the capture phase to make sure we can
      // cancel them.
      const opts = { capture: true, signal, passive: false };
      const cancelPointerDown = e => {
        if (e.pointerType === "touch") {
          this.#pointerDownAC?.abort();
          this.#pointerDownAC = null;
        }
      };
      container.addEventListener(
        "pointerdown",
        e => {
          if (e.pointerType === "touch") {
            // This is the second finger so we don't want it select something
            // or whatever.
            stopEvent(e);
            cancelPointerDown(e);
          }
        },
        opts
      );
      container.addEventListener("pointerup", cancelPointerDown, opts);
      container.addEventListener("pointercancel", cancelPointerDown, opts);
      return;
    }

    if (!this.#touchMoveAC) {
      this.#touchMoveAC = new AbortController();
      const signal = AbortSignal.any([this.#signal, this.#touchMoveAC.signal]);
      const container = this.#container;

      const opt = { signal, capture: false, passive: false };
      container.addEventListener(
        "touchmove",
        this.#onTouchMove.bind(this),
        opt
      );
      const onTouchEnd = this.#onTouchEnd.bind(this);
      container.addEventListener("touchend", onTouchEnd, opt);
      container.addEventListener("touchcancel", onTouchEnd, opt);

      opt.capture = true;
      container.addEventListener("pointerdown", stopEvent, opt);
      container.addEventListener("pointermove", stopEvent, opt);
      // `pointerup` and `pointercancel` are only default-prevented: a
      // `stopPropagation` in the capture phase also skips the bubble-phase
      // listeners of the very node it's called on, hence swallowing them here
      // would prevent any session in flight, e.g. an editor being resized, from
      // ever being ended.
      container.addEventListener("pointercancel", preventDefault, opt);
      container.addEventListener("pointerup", preventDefault, opt);
      this.#onPinchStart?.();
    }

    stopEvent(evt);
    this.#setTouchInfo(evt);
  }

  /**
   * Drop, from the tracked identifiers, the fingers which are no longer down.
   *
   * `evt.touches` lists every active touch in the document, whereas an element
   * listener only receives events targeted at that element or bubbling from
   * its descendants. Intersect with the document-wide list because an end
   * event for a tracked touch can be stopped before reaching this manager.
   * @param {TouchEvent} evt
   */
  #pruneTouchIds(evt) {
    const previous = this.#touchIds;
    if (previous.size === 0) {
      return;
    }
    const touchIds = (this.#touchIds = new Set());
    for (const { identifier } of evt.touches) {
      if (previous.has(identifier)) {
        touchIds.add(identifier);
      }
    }
  }

  /**
   * @param {TouchEvent} evt
   * @returns {Array<Touch>} The tracked fingers which are still down.
   */
  #getTrackedTouches(evt) {
    const touchIds = this.#touchIds;
    const touches = [];
    for (const touch of evt.touches) {
      if (touchIds.has(touch.identifier)) {
        touches.push(touch);
      }
    }
    return touches;
  }

  #setTouchInfo(evt) {
    const touches = this.#getTrackedTouches(evt);
    if (touches.length !== 2 || this.#isPinchingStopped?.()) {
      this.#touchInfo = null;
      this.#isPinching = false;
      return;
    }

    const [touch0, touch1] = touches;
    this.#touchInfo = {
      touch0X: touch0.screenX,
      touch0Y: touch0.screenY,
      touch1X: touch1.screenX,
      touch1Y: touch1.screenY,
    };
  }

  #onTouchMove(evt) {
    if (!this.#touchInfo) {
      return;
    }
    const touches = this.#getTrackedTouches(evt);
    if (touches.length !== 2) {
      return;
    }

    stopEvent(evt);

    const [touch0, touch1] = touches;
    const { screenX: screen0X, screenY: screen0Y } = touch0;
    const { screenX: screen1X, screenY: screen1Y } = touch1;
    const touchInfo = this.#touchInfo;
    const {
      touch0X: pTouch0X,
      touch0Y: pTouch0Y,
      touch1X: pTouch1X,
      touch1Y: pTouch1Y,
    } = touchInfo;

    const prevGapX = pTouch1X - pTouch0X;
    const prevGapY = pTouch1Y - pTouch0Y;
    const currGapX = screen1X - screen0X;
    const currGapY = screen1Y - screen0Y;

    const distance = Math.hypot(currGapX, currGapY) || 1;
    const pDistance = Math.hypot(prevGapX, prevGapY) || 1;
    if (
      !this.#isPinching &&
      Math.abs(pDistance - distance) <= this.MIN_TOUCH_DISTANCE_TO_PINCH
    ) {
      return;
    }

    touchInfo.touch0X = screen0X;
    touchInfo.touch0Y = screen0Y;
    touchInfo.touch1X = screen1X;
    touchInfo.touch1Y = screen1Y;

    if (!this.#isPinching) {
      // Start pinching.
      this.#isPinching = true;

      // We return here else the first pinch is a bit too much
      return;
    }

    // The distances are in screen CSS pixels, but the origin must be in client
    // coordinates, like the one coming from a wheel event.
    const origin = [
      (touch0.clientX + touch1.clientX) / 2,
      (touch0.clientY + touch1.clientY) / 2,
    ];
    this.#onPinching?.(origin, pDistance, distance);
  }

  #onTouchEnd(evt) {
    this.#pruneTouchIds(evt);
    if (this.#touchIds.size >= 2) {
      // Re-evaluate the remaining tracked touches; exactly two form a new
      // baseline.
      this.#setTouchInfo(evt);
      return;
    }
    // Fewer than two tracked touches remain, so this manager's gesture is over;
    // unrelated entries in the document-wide touch list must not keep it alive.
    // #touchMoveAC shouldn't be null but it seems that irl it can (see #19793).
    if (this.#touchMoveAC) {
      this.#touchMoveAC.abort();
      this.#touchMoveAC = null;
      this.#onPinchEnd?.();
    }

    if (!this.#touchInfo) {
      return;
    }
    stopEvent(evt);
    this.#touchInfo = null;
    this.#isPinching = false;
  }

  destroy() {
    this.#touchManagerAC?.abort();
    this.#touchManagerAC = null;
    this.#pointerDownAC?.abort();
    this.#pointerDownAC = null;
  }
}

export { TouchManager };
