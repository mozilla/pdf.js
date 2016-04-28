/* globals expect, it, describe, binarySearchFirstItem, EventBus */

'use strict';

describe('ui_utils', function() {
  describe('binary search', function() {
    function isTrue(boolean) {
      return boolean;
    }
    function isGreater3(number) {
      return number > 3;
    }

    it('empty array', function() {
      expect(binarySearchFirstItem([], isTrue)).toEqual(0);
    });
    it('single boolean entry', function() {
      expect(binarySearchFirstItem([false], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([true], isTrue)).toEqual(0);
    });
    it('three boolean entries', function() {
      expect(binarySearchFirstItem([true, true, true], isTrue)).toEqual(0);
      expect(binarySearchFirstItem([false, true, true], isTrue)).toEqual(1);
      expect(binarySearchFirstItem([false, false, true], isTrue)).toEqual(2);
      expect(binarySearchFirstItem([false, false, false], isTrue)).toEqual(3);
    });
    it('three numeric entries', function() {
      expect(binarySearchFirstItem([0, 1, 2], isGreater3)).toEqual(3);
      expect(binarySearchFirstItem([2, 3, 4], isGreater3)).toEqual(2);
      expect(binarySearchFirstItem([4, 5, 6], isGreater3)).toEqual(0);
    });
  });

  describe('EventBus', function () {
    it('dispatch event', function () {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch different event', function () {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('nottest');
      expect(count).toEqual(0);
    });
    it('dispatch event multiple times', function () {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.dispatch('test');
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch event to multiple handlers', function () {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached', function () {
      var eventBus = new EventBus();
      var count = 0;
      var listener = function () {
        count++;
      };
      eventBus.on('test', listener);
      eventBus.dispatch('test');
      eventBus.off('test', listener);
      eventBus.dispatch('test');
      expect(count).toEqual(1);
    });
    it('dispatch to wrong detached', function () {
      var eventBus = new EventBus();
      var count = 0;
      eventBus.on('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      eventBus.off('test', function () {
        count++;
      });
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
    it('dispatch to detached during handling', function () {
      var eventBus = new EventBus();
      var count = 0;
      var listener1 = function () {
        eventBus.off('test', listener2);
        count++;
      };
      var listener2 = function () {
        eventBus.off('test', listener1);
        count++;
      };
      eventBus.on('test', listener1);
      eventBus.on('test', listener2);
      eventBus.dispatch('test');
      eventBus.dispatch('test');
      expect(count).toEqual(2);
    });
  });
});

