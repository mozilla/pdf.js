/* globals describe, it, expect, checkProblematicCharRanges */

'use strict';

describe('Fonts', function() {
  it('checkProblematicCharRanges', function() {
    var EXPECTED_PERCENTAGE = 45;
    var result = checkProblematicCharRanges();

    expect(result.percentage).toBeLessThan(EXPECTED_PERCENTAGE);
  });
});
