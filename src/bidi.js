function bidi(doc, str, startLevel) {
  if (str.length == 0) return str;

  var chars= new Array(str.length);
  var levels = new Array(str.length);
  var types = new Array(str.length);
  var oldtypes = new Array(str.length);

// get types, fill arrays

  for (var i = 0; i < str.length; ++i) {
    var c = str.charAt(i);
    chars[i] = c;
    levels[i] = startLevel;

    var t = "L";
    if ('\u0600' <= c && c <= '\u06ff') t = "AL";
    else if ('0' <= c && c <= '9') t = (c <= 5) ? "EN" : "AN";
    else if (c == '.' || c == ',' || c == ':') t = "CS";
    else if (c == '/') t = "ES";
    else if (c == '#' || c == '$' || c == '%' || c == '+' || c == '-') t = "ET"
    else if (c == '>') t = "L"
    else if (c == '<') t = "R"

    oldtypes[i] = types[i] = t;
  }

  var diffChars = new Array(str.length);
  var diffLevels = new Array(str.length);
  var diffTypes = new Array(str.length);

  showArray(doc, "Chars: ", chars, diffChars);
  showArray(doc, "Types: ", types, diffTypes);
  //alert("chars: " + chars.join(","));
  //alert("types: " + types.join(","));
  //alert("levels: " + levels.join(","));

/*
X1-X10: skip most of this, since we are NOT doing the embeddings.
*/

  var e = isOdd(startLevel) ? "R" : "L";
  var sor = e;
  var eor = sor;

/*
W1. Examine each non-spacing mark (NSM) in the level run, and change the type of the NSM to the type of the previous character. If the NSM is at the start of the level run, it will get the type of sor.
*/

  var lastType = sor;
  for (var i = 0; i < types.length; ++i) {
    if (types[i] == "NSM") types[i] = lastType;
    else lastType = types[i];
  }

  showArray(doc, "W1: ", types, diffTypes);

/*
W2. Search backwards from each instance of a European number until the first strong type (R, L, AL, or sor) is found.  If an AL is found, change the type of the European number to Arabic number.
*/

  var lastType = sor;
  for (var i = 0; i < types.length; ++i) {
    var t = types[i];
    if (t == "EN") types[i] = (lastType == "AL") ? "AN" : "EN";
    else if (t == "R" || t == "L" || t == "AL") lastType = t;
  }

  showArray(doc, "W2: ", types, diffTypes);

/*
W3. Change all ALs to R.
*/

  for (var i = 0; i < types.length; ++i) {
    var t = types[i];
    if (t == "AL") types[i] = "R";
  }

  showArray(doc, "W3: ", types, diffTypes);

/*
W4. A single European separator between two European numbers changes to a European number. A single common separator between two numbers of the same type changes to that type:
*/

  for (var i = 1; i < types.length - 1; ++i) {
    if (types[i] == "ES" && types[i-1] == "EN" && types[i+1] == "EN") types[i] = "EN";
    if (types[i] == "CS" && (types[i-1] == "EN" || types[i-1] == "AN")
      && types[i+1] == types[i-1]) types[i] = types[i-1];
  }

  showArray(doc, "W4: ", types, diffTypes);

/*
W5. A sequence of European terminators adjacent to European numbers changes to all European numbers:
*/

  for (var i = 0; i < types.length; ++i) {
    if (types[i] == "EN") {
      // do before
      for (j = i-1; j >= 0; --j) {
        if (types[j] == "ET") types[j] = "EN";
        else break;
      }
      // do after
      for (j = i+1; j < types.length; --j) {
        if (types[j] == "ET") types[j] = "EN";
        else break;
      }
    }
  }

  showArray(doc, "W5: ", types, diffTypes);


/*
W6. Otherwise, separators and terminators change to Other Neutral:
*/

  for (var i = 0; i < types.length; ++i) {
    var t = types[i];
    if (t == "ES" || t == "ET" || t == "CS") types[i] = "ON";
  }

  showArray(doc, "W6: ", types, diffTypes);

/*
W7. Search backwards from each instance of a European number until the first strong type (R, L, or sor) is found. If an L is found,  then change the type of the European number to L.
*/

  var lastType = sor;
  for (var i = 0; i < types.length; ++i) {
    var t = types[i];
    if (t == "EN") types[i] = (lastType == "L") ? "L" : "EN";
    else if (t == "R" || t == "L") lastType = t;
  }

  showArray(doc, "W7: ", types, diffTypes);

/*
N1. A sequence of neutrals takes the direction of the surrounding strong text if the text on both sides has the same direction. European and Arabic numbers are treated as though they were R. Start-of-level-run (sor) and end-of-level-run (eor) are used at level run boundaries.
*/

  for (var i = 0; i < types.length; ++i) {
    if (types[i] == "ON") {
      var end = findUnequal(types, i+1, "ON");
      var before = sor;
      if (i > 0) before = types[i-1];
      var after = eor;
      if (end+1 < types.length) after = types[end+1];
      if (before != "L") before = "R";
      if (after != "L") after = "R";
      if (before == after) setValues(types, i, end, before);
      i = end - 1; // reset to end (-1 so next iteration is ok)
    }
  }

  showArray(doc, "N1: ", types, diffTypes);

/*
N2. Any remaining neutrals take the embedding direction.
*/

  for (var i = 0; i < types.length; ++i) {
    if (types[i] == "ON") types[i] = e;
  }

  showArray(doc, "N2: ", types, diffTypes);

/*
I1. For all characters with an even (left-to-right) embedding direction, those of type R go up one level and those of type AN or EN go up two levels.
I2. For all characters with an odd (right-to-left) embedding direction, those of type L, EN or AN go up one level.
*/

  showArray(doc, "Levels: ", levels, diffLevels);

  for (var i = 0; i < types.length; ++i) {
    var t = types[i];
    if (isEven(levels[i])) {
      if (t == "R") {
        levels[i] += 1;
      } else if (t == "AN" || t == "EN") {
        levels[i] += 2;
      }
    } else { // isOdd, so
      if (t == "L" || t == "AN" || t == "EN") {
        levels[i] += 1;
      }
    }
  }

  showArray(doc, "I1/2: ", levels, diffLevels);


/*
L1. On each line, reset the embedding level of the following characters to the paragraph embedding level: 

segment separators, 
paragraph separators, 
any sequence of whitespace characters preceding a segment separator or paragraph separator, and 
any sequence of white space characters at the end of the line. 
*/

/*
  boolean atEnd = true;
  for (var i = levels.length - 1; i >= 0; --i) {
    var t = oldTypes[i];
    if (t == "B" || t == "S") {
      levels[i] = startLevel;
      atEnd = true;
    } else if (atEnd && t == "WS") {
      levels[i] = startLevel;
    }
  }
*/

  showArray(doc, "L1: ", levels, diffLevels);


/*
L2. From the highest level found in the text to the lowest odd level on each line, reverse any contiguous sequence of characters that are at that level or higher.
*/

  // find highest level & lowest odd level

  var highestLevel = -1;
  var lowestOddLevel = 99;
  // alert("Levels: " + levels.join(","));
  for (var i = 0; i < levels.length; ++i) {
    var level = levels[i];
    if (highestLevel < level) highestLevel = level;
    if (lowestOddLevel > level && isOdd(level)) lowestOddLevel = level;
  }
  // alert("highestLevel: " + highestLevel + "; lowestOddLevel: " + lowestOddLevel);

  // now reverse between those limits

  for (var level = highestLevel; level >= lowestOddLevel; --level) {
    // find segments to reverse
    var start = -1;
    for (var i = 0; i < levels.length; ++i) {
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

    showArray(doc, "L2 (" + level + "):", chars, diffChars);

  }


/*
L3. Combining marks applied to a right-to-left base character will at this point precede their base character. If the rendering engine expects them to follow the base characters in the final display process, then the ordering of the marks and the base character must be reversed.
*/

// don't bother for now

  showArray(doc, "L3: ", chars, diffChars);


/*
L4. A character that possesses the mirrored property as specified by Section 4.7, Mirrored, must be depicted by a mirrored glyph if the resolved directionality of that character is R.
*/

  for (var i = 0; i < chars.length; ++i) {
    chars[i] = mirrorGlyphs(chars[i]);
  }

  showArray(doc, "L4: ", chars, diffChars);

// Finally, return string

  var result = "";
  for (var i = 0; i < chars.length; ++i) {
    var ch = chars[i];
    if (ch != '<' && ch != '>') result += ch;
  }
  return result;
}


// UTILITIES

function isOdd(i) {
  return (i & 1) != 0;
}

function isEven(i) {
  return (i & 1) == 0;
}

function findUnequal(arr, start, value) {
  var j;
  for (var j = start; j < arr.length; ++j) {
    if (arr[j] != value) return j;
  }
  return j;
}

function setValues(arr, start, end, value) {
  for (var j = start; j < end; ++j) {
    arr[j] = value;
  }
}

function reverseValues(arr, start, end) {
  // alert("reverse: " + arr.join(",") + "; " + start + "; " + end);
  for (var i = start, j = end-1; i < j; ++i, --j) {
    var temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  // alert("reverse: " + chars.join(","));
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
    case '(': return ')';
    case ')': return '(';
    case '<': return '>';
    case '>': return '<';
    case ']': return '[';
    case '[': return ']';
    case '}': return '{';
    case '{': return '}';
    case '�': return '�';
    case '�': return '�';
    default: return c;
  }
}

function showArray(doc, title, arr, diffarr) {
  if (doc == null)
    return;
  var haveDiff = false;
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] != diffarr[i]) {
      haveDiff = true;
      diffarr[i] = arr[i];
    }
  }
  if (haveDiff) {
    doc.writeln("<tr><th>", title, "</th><td>", arr.join("</td><td>"), "</td></tr>");
  }
}


