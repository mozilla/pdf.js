/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

describe('obj', function() {

  describe('Name', function() {
    it('should retain the given name', function() {
      var givenName = 'Font';
      var name = new Name(givenName);
      expect(name.name).toEqual(givenName);
    });
  });

  describe('Cmd', function() {
    it('should retain the given cmd name', function() {
      var givenCmd = 'BT';
      var cmd = new Cmd(givenCmd);
      expect(cmd.cmd).toEqual(givenCmd);
    });


    it('should create only one object for a command and cache it', function() {
      var firstBT = Cmd.get('BT');
      var secondBT = Cmd.get('BT');
      var firstET = Cmd.get('ET');
      var secondET = Cmd.get('ET');
      expect(firstBT).toBe(secondBT);
      expect(firstET).toBe(secondET);
      expect(firstBT).not.toBe(firstET);
    });
  });

  describe('Dict', function() {
    beforeEach(function() {
      this.checkInvalidHasValues = function(dict, key) {
        expect(dict.has()).toBeFalsy();
        expect(dict.has(key)).toBeFalsy();
      };
      this.checkInvalidKeyValues = function(dict, key) {
        expect(dict.get()).toBeUndefined();
        expect(dict.get(key)).toBeUndefined();
        expect(dict.get('Prev', 'Root')).toBeUndefined();

        // Note that the getter with three arguments breaks the pattern here.
        expect(dict.get('Encrypt', 'Info', 'ID')).toBeNull();
      };
    });

    it('should return invalid values for unknown keys', function() {
      var dict = new Dict();
      this.checkInvalidHasValues(dict, 'Size');
      this.checkInvalidKeyValues(dict, 'Size');
    });

    it('should return correct value for stored Size key', function() {
      var dict = new Dict();
      var storedSize = 42;
      dict.set('Size', storedSize);

      expect(dict.has('Size')).toBeTruthy();

      expect(dict.get('Size')).toEqual(storedSize);
      expect(dict.get('Prev', 'Size')).toEqual(storedSize);
      expect(dict.get('Prev', 'Root', 'Size')).toEqual(storedSize);
    });

    it('should return invalid values for unknown keys when Size key is stored',
       function() {
      var dict = new Dict();
      var storedSize = 42;
      dict.set('Size', storedSize);

      this.checkInvalidHasValues(dict, 'Prev');
      this.checkInvalidKeyValues(dict, 'Prev');
    });

    it('should return correct value for stored Size key with undefined value',
       function() {
      var dict = new Dict();
      dict.set('Size');

      expect(dict.has('Size')).toBeTruthy();

      this.checkInvalidKeyValues(dict, 'Size');
    });

    it('should return correct values for multiple stored keys', function() {
      var dict = new Dict();
      var storedSize = 42;
      var storedPrev = 4;
      var storedID = '[<06316BB1DF26984E89AFA8619B8722ED>' +
                     '<5E07F5458646544588630F1FD634FF2C>]';
      dict.set('Size', storedSize);
      dict.set('Prev', storedPrev);
      dict.set('ID', storedID);

      expect(dict.has('Size')).toBeTruthy();
      expect(dict.has('Prev')).toBeTruthy();
      expect(dict.has('ID')).toBeTruthy();

      expect(dict.get('ID')).toEqual(storedID);
      expect(dict.get('Prev', 'ID')).toEqual(storedPrev);
      expect(dict.get('Size', 'Prev', 'ID')).toEqual(storedSize);
    });

    it('should callback for each stored key', function() {
      var dict = new Dict();
      var storedSize = 42;
      var storedPrev = 4;
      var storedID = '[<06316BB1DF26984E89AFA8619B8722ED>' +
                     '<5E07F5458646544588630F1FD634FF2C>]';
      dict.set('Size', storedSize);
      dict.set('Prev', storedPrev);
      dict.set('ID', storedID);

      var callbackSpy = jasmine.createSpy('spy on callback in dictionary');

      dict.forEach(callbackSpy);

      expect(callbackSpy).wasCalled();
      expect(callbackSpy.argsForCall[0]).toEqual(['Size', storedSize]);
      expect(callbackSpy.argsForCall[1]).toEqual(['Prev', storedPrev]);
      expect(callbackSpy.argsForCall[2]).toEqual(['ID', storedID]);
      expect(callbackSpy.callCount).toEqual(3);
    });
  });

  describe('Ref', function() {
    it('should retain the stored values', function() {
      var storedNum = 42;
      var storedGen = "fortytwo";
      var ref = new Ref(storedNum, storedGen);
      expect(ref.num).toEqual(storedNum);
      expect(ref.gen).toEqual(storedGen);
    });
  });
});

