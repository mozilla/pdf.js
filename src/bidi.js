/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var bidi = PDFJS.bidi = (function bidiClosure() {
  // Character types for symbols from 0000 to 00FF.
  var baseTypes = [
    'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'S', 'B', 'S', 'WS',
    'B', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN',
    'BN', 'BN', 'B', 'B', 'B', 'S', 'WS', 'ON', 'ON', 'ET', 'ET', 'ET', 'ON',
    'ON', 'ON', 'ON', 'ON', 'ON', 'CS', 'ON', 'CS', 'ON', 'EN', 'EN', 'EN',
    'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'EN', 'ON', 'ON', 'ON', 'ON', 'ON',
    'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'ON', 'ON',
    'ON', 'ON', 'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'ON', 'ON', 'ON', 'ON', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'B', 'BN',
    'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN',
    'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN',
    'BN', 'CS', 'ON', 'ET', 'ET', 'ET', 'ET', 'ON', 'ON', 'ON', 'ON', 'L', 'ON',
    'ON', 'ON', 'ON', 'ON', 'ET', 'ET', 'EN', 'EN', 'ON', 'L', 'ON', 'ON', 'ON',
    'EN', 'L', 'ON', 'ON', 'ON', 'ON', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L',
    'L', 'L', 'L', 'ON', 'L', 'L', 'L', 'L', 'L', 'L', 'L', 'L'
  ];

  // Character types for symbols from 0600 to 06FF
  var arabicTypes = [
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'CS', 'AL', 'ON', 'ON', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM',
    'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN', 'AN',
    'AN', 'ET', 'AN', 'AN', 'AL', 'AL', 'AL', 'NSM', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM',
    'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'NSM', 'ON', 'NSM',
    'NSM', 'NSM', 'NSM', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL',
    'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL', 'AL'
  ];

  function isOdd(i) {
    return (i & 1) != 0;
  }

  function isEven(i) {
    return (i & 1) == 0;
  }

  function findUnequal(arr, start, value) {
    var j;
    for (var j = start, jj = arr.length; j < jj; ++j) {
      if (arr[j] != value)
        return j;
    }
    return j;
  }

  function setValues(arr, start, end, value) {
    for (var j = start; j < end; ++j) {
      arr[j] = value;
    }
  }

  function reverseValues(arr, start, end) {
    for (var i = start, j = end - 1; i < j; ++i, --j) {
      var temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
  }

  function mirrorGlyphs(c) {
    /*
     # BidiMirroring-1.txt
     0028; 0029 # LEFT PARENTHESIS
     0029; 0028 # RIGHT PARENTHESIS
     003C; 003E # LESS-THAN SIGN
     003E; 003C # GREATER-THAN SIGN
     005B; 005D # LEFT SQUARE BRACKET
     005D; 005B # RIGHT SQUARE BRACKET
     007B; 007D # LEFT CURLY BRACKET
     007D; 007B # RIGHT CURLY BRACKET
     00AB; 00BB # LEFT-POINTING DOUBLE ANGLE QUOTATION MARK
     00BB; 00AB # RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK
     */
    switch (c) {
      case '(':
        return ')';
      case ')':
        return '(';
      case '<':
        return '>';
      case '>':
        return '<';
      case ']':
        return '[';
      case '[':
        return ']';
      case '}':
        return '{';
      case '{':
        return '}';
      case '\u00AB':
        return '\u00BB';
      case '\u00BB':
        return '\u00AB';
      default:
        return c;
    }
  }

  function bidi(text, startLevel) {
    var str = text.str;
    var strLength = str.length;
    if (strLength == 0)
      return str;

    // get types, fill arrays

    var chars = [];
    var types = [];
    var oldtypes = [];
    var numBidi = 0;

    for (var i = 0; i < strLength; ++i) {
      chars[i] = str.charAt(i);

      var charCode = str.charCodeAt(i);
      var charType = 'L';
      if (charCode <= 0x00ff)
        charType = baseTypes[charCode];
      else if (0x0590 <= charCode && charCode <= 0x05f4)
        charType = 'R';
      else if (0x0600 <= charCode && charCode <= 0x06ff)
        charType = arabicTypes[charCode & 0xff];
      else if (0x0700 <= charCode && charCode <= 0x08AC)
        charType = 'AL';

      if (charType == 'R' || charType == 'AL' || charType == 'AN')
        numBidi++;

      oldtypes[i] = types[i] = charType;
    }

    // detect the bidi method
    //  if there are no rtl characters then no bidi needed
    //  if less than 30% chars are rtl then string is primarily ltr
    //  if more than 30% chars are rtl then string is primarily rtl
    if (numBidi == 0) {
      text.direction = 'ltr';
      return str;
    }

    if (startLevel == -1) {
      if ((strLength / numBidi) < 0.3) {
        text.direction = 'ltr';
        startLevel = 0;
      } else {
        text.direction = 'rtl';
        startLevel = 1;
      }
    }

    var levels = [];

    for (var i = 0; i < strLength; ++i) {
      levels[i] = startLevel;
    }

    /*
     X1-X10: skip most of this, since we are NOT doing the embeddings.
     */

    var e = isOdd(startLevel) ? 'R' : 'L';
    var sor = e;
    var eor = sor;

    /*
     W1. Examine each non-spacing mark (NSM) in the level run, and change the
     type of the NSM to the type of the previous character. If the NSM is at the
     start of the level run, it will get the type of sor.
     */

    var lastType = sor;
    for (var i = 0; i < strLength; ++i) {
      if (types[i] == 'NSM')
        types[i] = lastType;
      else
        lastType = types[i];
    }

    /*
     W2. Search backwards from each instance of a European number until the
     first strong type (R, L, AL, or sor) is found.  If an AL is found, change
     the type of the European number to Arabic number.
     */

    var lastType = sor;
    for (var i = 0; i < strLength; ++i) {
      var t = types[i];
      if (t == 'EN')
        types[i] = (lastType == 'AL') ? 'AN' : 'EN';
      else if (t == 'R' || t == 'L' || t == 'AL')
        lastType = t;
    }

    /*
     W3. Change all ALs to R.
     */

    for (var i = 0; i < strLength; ++i) {
      var t = types[i];
      if (t == 'AL')
        types[i] = 'R';
    }

    /*
     W4. A single European separator between two European numbers changes to a
     European number. A single common separator between two numbers of the same
     type changes to that type:
     */

    for (var i = 1; i < strLength - 1; ++i) {
      if (types[i] == 'ES' && types[i - 1] == 'EN' && types[i + 1] == 'EN')
        types[i] = 'EN';
      if (types[i] == 'CS' && (types[i - 1] == 'EN' || types[i - 1] == 'AN') &&
          types[i + 1] == types[i - 1])
        types[i] = types[i - 1];
    }

    /*
     W5. A sequence of European terminators adjacent to European numbers changes
     to all European numbers:
     */

    for (var i = 0; i < strLength; ++i) {
      if (types[i] == 'EN') {
        // do before
        for (var j = i - 1; j >= 0; --j) {
          if (types[j] != 'ET')
            break;
          types[j] = 'EN';
        }
        // do after
        for (var j = i + 1; j < strLength; --j) {
          if (types[j] != 'ET')
            break;
          types[j] = 'EN';
        }
      }
    }

    /*
     W6. Otherwise, separators and terminators change to Other Neutral:
     */

    for (var i = 0; i < strLength; ++i) {
      var t = types[i];
      if (t == 'WS' || t == 'ES' || t == 'ET' || t == 'CS')
        types[i] = 'ON';
    }

    /*
     W7. Search backwards from each instance of a European number until the
     first strong type (R, L, or sor) is found. If an L is found,  then change
     the type of the European number to L.
     */

    var lastType = sor;
    for (var i = 0; i < strLength; ++i) {
      var t = types[i];
      if (t == 'EN')
        types[i] = (lastType == 'L') ? 'L' : 'EN';
      else if (t == 'R' || t == 'L')
        lastType = t;
    }

    /*
     N1. A sequence of neutrals takes the direction of the surrounding strong
     text if the text on both sides has the same direction. European and Arabic
     numbers are treated as though they were R. Start-of-level-run (sor) and
     end-of-level-run (eor) are used at level run boundaries.
     */

    for (var i = 0; i < strLength; ++i) {
      if (types[i] == 'ON') {
        var end = findUnequal(types, i + 1, 'ON');
        var before = sor;
        if (i > 0)
          before = types[i - 1];
        var after = eor;
        if (end + 1 < strLength)
          after = types[end + 1];
        if (before != 'L')
          before = 'R';
        if (after != 'L')
          after = 'R';
        if (before == after)
          setValues(types, i, end, before);
        i = end - 1; // reset to end (-1 so next iteration is ok)
      }
    }

    /*
     N2. Any remaining neutrals take the embedding direction.
     */

    for (var i = 0; i < strLength; ++i) {
      if (types[i] == 'ON')
        types[i] = e;
    }

    /*
     I1. For all characters with an even (left-to-right) embedding direction,
     those of type R go up one level and those of type AN or EN go up two
     levels.
     I2. For all characters with an odd (right-to-left) embedding direction,
     those of type L, EN or AN go up one level.
     */

    for (var i = 0; i < strLength; ++i) {
      var t = types[i];
      if (isEven(levels[i])) {
        if (t == 'R') {
          levels[i] += 1;
        } else if (t == 'AN' || t == 'EN') {
          levels[i] += 2;
        }
      } else { // isOdd, so
        if (t == 'L' || t == 'AN' || t == 'EN') {
          levels[i] += 1;
        }
      }
    }

    /*
     L1. On each line, reset the embedding level of the following characters to
     the paragraph embedding level:

     segment separators,
     paragraph separators,
     any sequence of whitespace characters preceding a segment separator or
     paragraph separator, and any sequence of white space characters at the end
     of the line.
     */

    // don't bother as text is only single line

    /*
     L2. From the highest level found in the text to the lowest odd level on
     each line, reverse any contiguous sequence of characters that are at that
     level or higher.
     */

    // find highest level & lowest odd level

    var highestLevel = -1;
    var lowestOddLevel = 99;
    for (var i = 0, ii = levels.length; i < ii; ++i) {
      var level = levels[i];
      if (highestLevel < level)
        highestLevel = level;
      if (lowestOddLevel > level && isOdd(level))
        lowestOddLevel = level;
    }

    // now reverse between those limits

    for (var level = highestLevel; level >= lowestOddLevel; --level) {
      // find segments to reverse
      var start = -1;
      for (var i = 0, ii = levels.length; i < ii; ++i) {
        if (levels[i] < level) {
          if (start >= 0) {
            reverseValues(chars, start, i);
            start = -1;
          }
        } else if (start < 0) {
          start = i;
        }
      }
      if (start >= 0) {
        reverseValues(chars, start, levels.length);
      }
    }

    /*
     L3. Combining marks applied to a right-to-left base character will at this
     point precede their base character. If the rendering engine expects them to
     follow the base characters in the final display process, then the ordering
     of the marks and the base character must be reversed.
     */

    // don't bother for now

    /*
     L4. A character that possesses the mirrored property as specified by
     Section 4.7, Mirrored, must be depicted by a mirrored glyph if the resolved
     directionality of that character is R.
     */

    // don't mirror as characters are already mirrored in the pdf

    // Finally, return string

    var result = '';
    for (var i = 0, ii = chars.length; i < ii; ++i) {
      var ch = chars[i];
      if (ch != '<' && ch != '>')
        result += ch;
    }
    return result;
  }

  return bidi;
})();

