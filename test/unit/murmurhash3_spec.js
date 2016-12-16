/* globals MurmurHash3_64 */

'use strict';

describe('MurmurHash3_64', function() {
  it('instantiates without seed', function() {
    var hash = new MurmurHash3_64();
    expect(hash).toEqual(jasmine.any(MurmurHash3_64));
  });
  it('instantiates with seed', function() {
    var hash = new MurmurHash3_64(1);
    expect(hash).toEqual(jasmine.any(MurmurHash3_64));
  });

  var hexDigestExpected = 'f61cfdbfdae0f65e';
  var sourceText = 'test';
  var sourceCharCodes = [116, 101, 115, 116]; // 't','e','s','t'
  it('correctly generates a hash from a string', function() {
    var hash = new MurmurHash3_64();
    hash.update(sourceText);
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it('correctly generates a hash from a Uint8Array', function() {
    var hash = new MurmurHash3_64();
    hash.update(new Uint8Array(sourceCharCodes));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });
  it('correctly generates a hash from a Uint32Array', function() {
    var hash = new MurmurHash3_64();
    hash.update(new Uint32Array(sourceCharCodes));
    expect(hash.hexdigest()).toEqual(hexDigestExpected);
  });

  it('changes the hash after update without seed', function() {
    var hash = new MurmurHash3_64();
    var hexdigest1, hexdigest2;
    hash.update(sourceText);
    hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });
  it('changes the hash after update with seed', function() {
    var hash = new MurmurHash3_64(1);
    var hexdigest1, hexdigest2;
    hash.update(sourceText);
    hexdigest1 = hash.hexdigest();
    hash.update(sourceText);
    hexdigest2 = hash.hexdigest();
    expect(hexdigest1).not.toEqual(hexdigest2);
  });
});
