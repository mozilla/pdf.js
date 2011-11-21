/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var isWorker = (typeof window == 'undefined');

/**
 * Maximum time to wait for a font to be loaded by font-face rules.
 */
var kMaxWaitForFontFace = 1000;

// Unicode Private Use Area
var kCmapGlyphOffset = 0xE000;
var kSizeOfGlyphArea = 0x1900;

// PDF Glyph Space Units are one Thousandth of a TextSpace Unit
// except for Type 3 fonts
var kPDFGlyphSpaceUnits = 1000;

// Until hinting is fully supported this constant can be used
var kHintingEnabled = false;

var Encodings = {
  get ExpertEncoding() {
    return shadow(this, 'ExpertEncoding', ['', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', 'space', 'exclamsmall', 'Hungarumlautsmall', '',
      'dollaroldstyle', 'dollarsuperior', 'ampersandsmall', 'Acutesmall',
      'parenleftsuperior', 'parenrightsuperior', 'twodotenleader',
      'onedotenleader', 'comma', 'hyphen', 'period', 'fraction',
      'zerooldstyle', 'oneoldstyle', 'twooldstyle', 'threeoldstyle',
      'fouroldstyle', 'fiveoldstyle', 'sixoldstyle', 'sevenoldstyle',
      'eightoldstyle', 'nineoldstyle', 'colon', 'semicolon', 'commasuperior',
      'threequartersemdash', 'periodsuperior', 'questionsmall', '',
      'asuperior', 'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', '',
      '', 'isuperior', '', '', 'lsuperior', 'msuperior', 'nsuperior',
      'osuperior', '', '', 'rsuperior', 'ssuperior', 'tsuperior', '', 'ff',
      'fi', 'fl', 'ffi', 'ffl', 'parenleftinferior', '', 'parenrightinferior',
      'Circumflexsmall', 'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall',
      'Csmall', 'Dsmall', 'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall',
      'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall',
      'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall',
      'Xsmall', 'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah',
      'Tildesmall', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', 'exclamdownsmall', 'centoldstyle', 'Lslashsmall', '', '',
      'Scaronsmall', 'Zcaronsmall', 'Dieresissmall', 'Brevesmall',
      'Caronsmall', '', 'Dotaccentsmall', '', '', 'Macronsmall', '', '',
      'figuredash', 'hypheninferior', '', '', 'Ogoneksmall', 'Ringsmall',
      'Cedillasmall', '', '', '', 'onequarter', 'onehalf', 'threequarters',
      'questiondownsmall', 'oneeighth', 'threeeighths', 'fiveeighths',
      'seveneighths', 'onethird', 'twothirds', '', '', 'zerosuperior',
      'onesuperior', 'twosuperior', 'threesuperior', 'foursuperior',
      'fivesuperior', 'sixsuperior', 'sevensuperior', 'eightsuperior',
      'ninesuperior', 'zeroinferior', 'oneinferior', 'twoinferior',
      'threeinferior', 'fourinferior', 'fiveinferior', 'sixinferior',
      'seveninferior', 'eightinferior', 'nineinferior', 'centinferior',
      'dollarinferior', 'periodinferior', 'commainferior', 'Agravesmall',
      'Aacutesmall', 'Acircumflexsmall', 'Atildesmall', 'Adieresissmall',
      'Aringsmall', 'AEsmall', 'Ccedillasmall', 'Egravesmall', 'Eacutesmall',
      'Ecircumflexsmall', 'Edieresissmall', 'Igravesmall', 'Iacutesmall',
      'Icircumflexsmall', 'Idieresissmall', 'Ethsmall', 'Ntildesmall',
      'Ogravesmall', 'Oacutesmall', 'Ocircumflexsmall', 'Otildesmall',
      'Odieresissmall', 'OEsmall', 'Oslashsmall', 'Ugravesmall', 'Uacutesmall',
      'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall', 'Thornsmall',
      'Ydieresissmall'
    ]);
  },
  get MacExpertEncoding() {
    return shadow(this, 'MacExpertEncoding', ['', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', 'space', 'exclamsmall', 'Hungarumlautsmall',
      'centoldstyle', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall',
      'Acutesmall', 'parenleftsuperior', 'parenrightsuperior',
      'twodotenleader', 'onedotenleader', 'comma', 'hyphen', 'period',
      'fraction', 'zerooldstyle', 'oneoldstyle', 'twooldstyle',
      'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle',
      'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'colon', 'semicolon',
      '', 'threequartersemdash', '', 'questionsmall', '', '', '', '',
      'Ethsmall', '', '', 'onequarter', 'onehalf', 'threequarters',
      'oneeighth', 'threeeighths', 'fiveeighths', 'seveneighths', 'onethird',
      'twothirds', '', '', '', '', '', '', 'ff', 'fi', 'fl', 'ffi', 'ffl',
      'parenleftinferior', '', 'parenrightinferior', 'Circumflexsmall',
      'hypheninferior', 'Gravesmall', 'Asmall', 'Bsmall', 'Csmall', 'Dsmall',
      'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall', 'Jsmall', 'Ksmall',
      'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall', 'Qsmall', 'Rsmall',
      'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall', 'Xsmall', 'Ysmall',
      'Zsmall', 'colonmonetary', 'onefitted', 'rupiah', 'Tildesmall', '', '',
      'asuperior', 'centsuperior', '', '', '', '', 'Aacutesmall',
      'Agravesmall', 'Acircumflexsmall', 'Adieresissmall', 'Atildesmall',
      'Aringsmall', 'Ccedillasmall', 'Eacutesmall', 'Egravesmall',
      'Ecircumflexsmall', 'Edieresissmall', 'Iacutesmall', 'Igravesmall',
      'Icircumflexsmall', 'Idieresissmall', 'Ntildesmall', 'Oacutesmall',
      'Ogravesmall', 'Ocircumflexsmall', 'Odieresissmall', 'Otildesmall',
      'Uacutesmall', 'Ugravesmall', 'Ucircumflexsmall', 'Udieresissmall', '',
      'eightsuperior', 'fourinferior', 'threeinferior', 'sixinferior',
      'eightinferior', 'seveninferior', 'Scaronsmall', '', 'centinferior',
      'twoinferior', '', 'Dieresissmall', '', 'Caronsmall', 'osuperior',
      'fiveinferior', '', 'commainferior', 'periodinferior', 'Yacutesmall', '',
      'dollarinferior', '', 'Thornsmall', '', 'nineinferior', 'zeroinferior',
      'Zcaronsmall', 'AEsmall', 'Oslashsmall', 'questiondownsmall',
      'oneinferior', 'Lslashsmall', '', '', '', '', '', '', 'Cedillasmall', '',
      '', '', '', '', 'OEsmall', 'figuredash', 'hyphensuperior', '', '', '',
      '', 'exclamdownsmall', '', 'Ydieresissmall', '', 'onesuperior',
      'twosuperior', 'threesuperior', 'foursuperior', 'fivesuperior',
      'sixsuperior', 'sevensuperior', 'ninesuperior', 'zerosuperior', '',
      'esuperior', 'rsuperior', 'tsuperior', '', '', 'isuperior', 'ssuperior',
      'dsuperior', '', '', '', '', '', 'lsuperior', 'Ogoneksmall',
      'Brevesmall', 'Macronsmall', 'bsuperior', 'nsuperior', 'msuperior',
      'commasuperior', 'periodsuperior', 'Dotaccentsmall', 'Ringsmall'
    ]);
  },
  get MacRomanEncoding() {
    return shadow(this, 'MacRomanEncoding', ['', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', 'space', 'exclam', 'quotedbl', 'numbersign',
      'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft',
      'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
      'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question',
      'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore',
      'grave', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'braceleft', 'bar', 'braceright', 'asciitilde', '', 'Adieresis', 'Aring',
      'Ccedilla', 'Eacute', 'Ntilde', 'Odieresis', 'Udieresis', 'aacute',
      'agrave', 'acircumflex', 'adieresis', 'atilde', 'aring', 'ccedilla',
      'eacute', 'egrave', 'ecircumflex', 'edieresis', 'iacute', 'igrave',
      'icircumflex', 'idieresis', 'ntilde', 'oacute', 'ograve', 'ocircumflex',
      'odieresis', 'otilde', 'uacute', 'ugrave', 'ucircumflex', 'udieresis',
      'dagger', 'degree', 'cent', 'sterling', 'section', 'bullet', 'paragraph',
      'germandbls', 'registered', 'copyright', 'trademark', 'acute',
      'dieresis', 'notequal', 'AE', 'Oslash', 'infinity', 'plusminus',
      'lessequal', 'greaterequal', 'yen', 'mu', 'partialdiff', 'summation',
      'product', 'pi', 'integral', 'ordfeminine', 'ordmasculine', 'Omega',
      'ae', 'oslash', 'questiondown', 'exclamdown', 'logicalnot', 'radical',
      'florin', 'approxequal', 'Delta', 'guillemotleft', 'guillemotright',
      'ellipsis', 'space', 'Agrave', 'Atilde', 'Otilde', 'OE', 'oe', 'endash',
      'emdash', 'quotedblleft', 'quotedblright', 'quoteleft', 'quoteright',
      'divide', 'lozenge', 'ydieresis', 'Ydieresis', 'fraction', 'currency',
      'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'daggerdbl',
      'periodcentered', 'quotesinglbase', 'quotedblbase', 'perthousand',
      'Acircumflex', 'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave', 'Iacute',
      'Icircumflex', 'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple',
      'Ograve', 'Uacute', 'Ucircumflex', 'Ugrave', 'dotlessi', 'circumflex',
      'tilde', 'macron', 'breve', 'dotaccent', 'ring', 'cedilla',
      'hungarumlaut', 'ogonek', 'caron'
    ]);
  },
  get StandardEncoding() {
    return shadow(this, 'StandardEncoding', ['', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', 'space', 'exclam', 'quotedbl', 'numbersign',
      'dollar', 'percent', 'ampersand', 'quoteright', 'parenleft',
      'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
      'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question',
      'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore',
      'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l',
      'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'braceleft', 'bar', 'braceright', 'asciitilde', '', '', 'exclamdown',
      'cent', 'sterling', 'fraction', 'yen', 'florin', 'section', 'currency',
      'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft',
      'guilsinglright', 'fi', 'fl', '', 'endash', 'dagger', 'daggerdbl',
      'periodcentered', '', 'paragraph', 'bullet', 'quotesinglbase',
      'quotedblbase', 'quotedblright', 'guillemotright', 'ellipsis',
      'perthousand', '', 'questiondown', '', 'grave', 'acute', 'circumflex',
      'tilde', 'macron', 'breve', 'dotaccent', 'dieresis', '', 'ring',
      'cedilla', '', 'hungarumlaut', 'ogonek', 'caron', 'emdash', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', 'AE', '',
      'ordfeminine', '', '', '', '', 'Lslash', 'Oslash', 'OE', 'ordmasculine',
      '', '', '', '', '', 'ae', '', '', '', 'dotlessi', '', '', 'lslash',
      'oslash', 'oe', 'germandbls'
    ]);
  },
  get WinAnsiEncoding() {
    return shadow(this, 'WinAnsiEncoding', ['', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', 'space', 'exclam', 'quotedbl', 'numbersign',
      'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft',
      'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
      'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
      'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question',
      'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'bracketleft', 'backslash', 'bracketright', 'asciicircum', 'underscore',
      'grave', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
      'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
      'braceleft', 'bar', 'braceright', 'asciitilde', 'bullet', 'Euro',
      'bullet', 'quotesinglbase', 'florin', 'quotedblbase', 'ellipsis',
      'dagger', 'daggerdbl', 'circumflex', 'perthousand', 'Scaron',
      'guilsinglleft', 'OE', 'bullet', 'Zcaron', 'bullet', 'bullet',
      'quoteleft', 'quoteright', 'quotedblleft', 'quotedblright', 'bullet',
      'endash', 'emdash', 'tilde', 'trademark', 'scaron', 'guilsinglright',
      'oe', 'bullet', 'zcaron', 'Ydieresis', 'space', 'exclamdown', 'cent',
      'sterling', 'currency', 'yen', 'brokenbar', 'section', 'dieresis',
      'copyright', 'ordfeminine', 'guillemotleft', 'logicalnot', 'hyphen',
      'registered', 'macron', 'degree', 'plusminus', 'twosuperior',
      'threesuperior', 'acute', 'mu', 'paragraph', 'periodcentered',
      'cedilla', 'onesuperior', 'ordmasculine', 'guillemotright', 'onequarter',
      'onehalf', 'threequarters', 'questiondown', 'Agrave', 'Aacute',
      'Acircumflex', 'Atilde', 'Adieresis', 'Aring', 'AE', 'Ccedilla',
      'Egrave', 'Eacute', 'Ecircumflex', 'Edieresis', 'Igrave', 'Iacute',
      'Icircumflex', 'Idieresis', 'Eth', 'Ntilde', 'Ograve', 'Oacute',
      'Ocircumflex', 'Otilde', 'Odieresis', 'multiply', 'Oslash', 'Ugrave',
      'Uacute', 'Ucircumflex', 'Udieresis', 'Yacute', 'Thorn', 'germandbls',
      'agrave', 'aacute', 'acircumflex', 'atilde', 'adieresis', 'aring', 'ae',
      'ccedilla', 'egrave', 'eacute', 'ecircumflex', 'edieresis', 'igrave',
      'iacute', 'icircumflex', 'idieresis', 'eth', 'ntilde', 'ograve',
      'oacute', 'ocircumflex', 'otilde', 'odieresis', 'divide', 'oslash',
      'ugrave', 'uacute', 'ucircumflex', 'udieresis', 'yacute', 'thorn',
      'ydieresis'
    ]);
  },
  get symbolsEncoding() {
    return shadow(this, 'symbolsEncoding', ['', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', 'space', 'exclam', 'universal', 'numbersign',
      'existential', 'percent', 'ampersand', 'suchthat', 'parenleft',
      'parenright', 'asteriskmath', 'plus', 'comma', 'minus', 'period',
      'slash', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
      'eight', 'nine', 'colon', 'semicolon', 'less', 'equal', 'greater',
      'question', 'congruent', 'Alpha', 'Beta', 'Chi', 'Delta', 'Epsilon',
      'Phi', 'Gamma', 'Eta', 'Iota', 'theta1', 'Kappa', 'Lambda', 'Mu', 'Nu',
      'Omicron', 'Pi', 'Theta', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'sigma1',
      'Omega', 'Xi', 'Psi', 'Zeta', 'bracketleft', 'therefore', 'bracketright',
      'perpendicular', 'underscore', 'radicalex', 'alpha', 'beta', 'chi',
      'delta', 'epsilon', 'phi', 'gamma', 'eta', 'iota', 'phi1', 'kappa',
      'lambda', 'mu', 'nu', 'omicron', 'pi', 'theta', 'rho', 'sigma', 'tau',
      'upsilon', 'omega1', 'omega', 'xi', 'psi', 'zeta', 'braceleft', 'bar',
      'braceright', 'similar', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', 'Euro', 'Upsilon1', 'minute', 'lessequal', 'fraction',
      'infinity', 'florin', 'club', 'diamond', 'heart', 'spade', 'arrowboth',
      'arrowleft', 'arrowup', 'arrowright', 'arrowdown', 'degree', 'plusminus',
      'second', 'greaterequal', 'multiply', 'proportional', 'partialdiff',
      'bullet', 'divide', 'notequal', 'equivalence', 'approxequal', 'ellipsis',
      'arrowvertex', 'arrowhorizex', 'carriagereturn', 'aleph', 'Ifraktur',
      'Rfraktur', 'weierstrass', 'circlemultiply', 'circleplus', 'emptyset',
      'intersection', 'union', 'propersuperset', 'reflexsuperset', 'notsubset',
      'propersubset', 'reflexsubset', 'element', 'notelement', 'angle',
      'gradient', 'registerserif', 'copyrightserif', 'trademarkserif',
      'product', 'radical', 'dotmath', 'logicalnot', 'logicaland', 'logicalor',
      'arrowdblboth', 'arrowdblleft', 'arrowdblup', 'arrowdblright',
      'arrowdbldown', 'lozenge', 'angleleft', 'registersans', 'copyrightsans',
      'trademarksans', 'summation', 'parenlefttp', 'parenleftex',
      'parenleftbt', 'bracketlefttp', 'bracketleftex', 'bracketleftbt',
      'bracelefttp', 'braceleftmid', 'braceleftbt', 'braceex', '',
      'angleright', 'integral', 'integraltp', 'integralex', 'integralbt',
      'parenrighttp', 'parenrightex', 'parenrightbt', 'bracketrighttp',
      'bracketrightex', 'bracketrightbt', 'bracerighttp', 'bracerightmid',
      'bracerightbt'
    ]);
  },
  get zapfDingbatsEncoding() {
    return shadow(this, 'zapfDingbatsEncoding', ['', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', 'space', 'a1', 'a2', 'a202', 'a3', 'a4',
      'a5', 'a119', 'a118', 'a117', 'a11', 'a12', 'a13', 'a14', 'a15', 'a16',
      'a105', 'a17', 'a18', 'a19', 'a20', 'a21', 'a22', 'a23', 'a24', 'a25',
      'a26', 'a27', 'a28', 'a6', 'a7', 'a8', 'a9', 'a10', 'a29', 'a30', 'a31',
      'a32', 'a33', 'a34', 'a35', 'a36', 'a37', 'a38', 'a39', 'a40', 'a41',
      'a42', 'a43', 'a44', 'a45', 'a46', 'a47', 'a48', 'a49', 'a50', 'a51',
      'a52', 'a53', 'a54', 'a55', 'a56', 'a57', 'a58', 'a59', 'a60', 'a61',
      'a62', 'a63', 'a64', 'a65', 'a66', 'a67', 'a68', 'a69', 'a70', 'a71',
      'a72', 'a73', 'a74', 'a203', 'a75', 'a204', 'a76', 'a77', 'a78', 'a79',
      'a81', 'a82', 'a83', 'a84', 'a97', 'a98', 'a99', 'a100', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
      '', '', '', '', '', '', '', '', '', '', '', '', 'a101', 'a102', 'a103',
      'a104', 'a106', 'a107', 'a108', 'a112', 'a111', 'a110', 'a109', 'a120',
      'a121', 'a122', 'a123', 'a124', 'a125', 'a126', 'a127', 'a128', 'a129',
      'a130', 'a131', 'a132', 'a133', 'a134', 'a135', 'a136', 'a137', 'a138',
      'a139', 'a140', 'a141', 'a142', 'a143', 'a144', 'a145', 'a146', 'a147',
      'a148', 'a149', 'a150', 'a151', 'a152', 'a153', 'a154', 'a155', 'a156',
      'a157', 'a158', 'a159', 'a160', 'a161', 'a163', 'a164', 'a196', 'a165',
      'a192', 'a166', 'a167', 'a168', 'a169', 'a170', 'a171', 'a172', 'a173',
      'a162', 'a174', 'a175', 'a176', 'a177', 'a178', 'a179', 'a193', 'a180',
      'a199', 'a181', 'a200', 'a182', '', 'a201', 'a183', 'a184', 'a197',
      'a185', 'a194', 'a198', 'a186', 'a195', 'a187', 'a188', 'a189', 'a190',
      'a191'
    ]);
  }
};

/**
 * Hold a map of decoded fonts and of the standard fourteen Type1
 * fonts and their acronyms.
 */
var stdFontMap = {
  'ArialNarrow': 'Helvetica',
  'ArialNarrow-Bold': 'Helvetica-Bold',
  'ArialNarrow-BoldItalic': 'Helvetica-BoldOblique',
  'ArialNarrow-Italic': 'Helvetica-Oblique',
  'ArialBlack': 'Helvetica',
  'ArialBlack-Bold': 'Helvetica-Bold',
  'ArialBlack-BoldItalic': 'Helvetica-BoldOblique',
  'ArialBlack-Italic': 'Helvetica-Oblique',
  'Arial': 'Helvetica',
  'Arial-Bold': 'Helvetica-Bold',
  'Arial-BoldItalic': 'Helvetica-BoldOblique',
  'Arial-Italic': 'Helvetica-Oblique',
  'Arial-BoldItalicMT': 'Helvetica-BoldOblique',
  'Arial-BoldMT': 'Helvetica-Bold',
  'Arial-ItalicMT': 'Helvetica-Oblique',
  'ArialMT': 'Helvetica',
  'Courier-Bold': 'Courier-Bold',
  'Courier-BoldItalic': 'Courier-BoldOblique',
  'Courier-Italic': 'Courier-Oblique',
  'CourierNew': 'Courier',
  'CourierNew-Bold': 'Courier-Bold',
  'CourierNew-BoldItalic': 'Courier-BoldOblique',
  'CourierNew-Italic': 'Courier-Oblique',
  'CourierNewPS-BoldItalicMT': 'Courier-BoldOblique',
  'CourierNewPS-BoldMT': 'Courier-Bold',
  'CourierNewPS-ItalicMT': 'Courier-Oblique',
  'CourierNewPSMT': 'Courier',
  'Helvetica-Bold': 'Helvetica-Bold',
  'Helvetica-BoldItalic': 'Helvetica-BoldOblique',
  'Helvetica-Italic': 'Helvetica-Oblique',
  'Symbol-Bold': 'Symbol',
  'Symbol-BoldItalic': 'Symbol',
  'Symbol-Italic': 'Symbol',
  'TimesNewRoman': 'Times-Roman',
  'TimesNewRoman-Bold': 'Times-Bold',
  'TimesNewRoman-BoldItalic': 'Times-BoldItalic',
  'TimesNewRoman-Italic': 'Times-Italic',
  'TimesNewRomanPS': 'Times-Roman',
  'TimesNewRomanPS-Bold': 'Times-Bold',
  'TimesNewRomanPS-BoldItalic': 'Times-BoldItalic',
  'TimesNewRomanPS-BoldItalicMT': 'Times-BoldItalic',
  'TimesNewRomanPS-BoldMT': 'Times-Bold',
  'TimesNewRomanPS-Italic': 'Times-Italic',
  'TimesNewRomanPS-ItalicMT': 'Times-Italic',
  'TimesNewRomanPSMT': 'Times-Roman',
  'TimesNewRomanPSMT-Bold': 'Times-Bold',
  'TimesNewRomanPSMT-BoldItalic': 'Times-BoldItalic',
  'TimesNewRomanPSMT-Italic': 'Times-Italic'
};

var serifFonts = {
  'Adobe Jenson': true, 'Adobe Text': true, 'Albertus': true,
  'Aldus': true, 'Alexandria': true, 'Algerian': true,
  'American Typewriter': true, 'Antiqua': true, 'Apex': true,
  'Arno': true, 'Aster': true, 'Aurora': true,
  'Baskerville': true, 'Bell': true, 'Bembo': true,
  'Bembo Schoolbook': true, 'Benguiat': true, 'Berkeley Old Style': true,
  'Bernhard Modern': true, 'Berthold City': true, 'Bodoni': true,
  'Bauer Bodoni': true, 'Book Antiqua': true, 'Bookman': true,
  'Bordeaux Roman': true, 'Californian FB': true, 'Calisto': true,
  'Calvert': true, 'Capitals': true, 'Cambria': true,
  'Cartier': true, 'Caslon': true, 'Catull': true,
  'Centaur': true, 'Century Old Style': true, 'Century Schoolbook': true,
  'Chaparral': true, 'Charis SIL': true, 'Cheltenham': true,
  'Cholla Slab': true, 'Clarendon': true, 'Clearface': true,
  'Cochin': true, 'Colonna': true, 'Computer Modern': true,
  'Concrete Roman': true, 'Constantia': true, 'Cooper Black': true,
  'Corona': true, 'Ecotype': true, 'Egyptienne': true,
  'Elephant': true, 'Excelsior': true, 'Fairfield': true,
  'FF Scala': true, 'Folkard': true, 'Footlight': true,
  'FreeSerif': true, 'Friz Quadrata': true, 'Garamond': true,
  'Gentium': true, 'Georgia': true, 'Gloucester': true,
  'Goudy Old Style': true, 'Goudy Schoolbook': true, 'Goudy Pro Font': true,
  'Granjon': true, 'Guardian Egyptian': true, 'Heather': true,
  'Hercules': true, 'High Tower Text': true, 'Hiroshige': true,
  'Hoefler Text': true, 'Humana Serif': true, 'Imprint': true,
  'Ionic No. 5': true, 'Janson': true, 'Joanna': true,
  'Korinna': true, 'Lexicon': true, 'Liberation Serif': true,
  'Linux Libertine': true, 'Literaturnaya': true, 'Lucida': true,
  'Lucida Bright': true, 'Melior': true, 'Memphis': true,
  'Miller': true, 'Minion': true, 'Modern': true,
  'Mona Lisa': true, 'Mrs Eaves': true, 'MS Serif': true,
  'Museo Slab': true, 'New York': true, 'Nimbus Roman': true,
  'NPS Rawlinson Roadway': true, 'Palatino': true, 'Perpetua': true,
  'Plantin': true, 'Plantin Schoolbook': true, 'Playbill': true,
  'Poor Richard': true, 'Rawlinson Roadway': true, 'Renault': true,
  'Requiem': true, 'Rockwell': true, 'Roman': true,
  'Rotis Serif': true, 'Sabon': true, 'Scala': true,
  'Seagull': true, 'Sistina': true, 'Souvenir': true,
  'STIX': true, 'Stone Informal': true, 'Stone Serif': true,
  'Sylfaen': true, 'Times': true, 'Trajan': true,
  'Trinité': true, 'Trump Mediaeval': true, 'Utopia': true,
  'Vale Type': true, 'Bitstream Vera': true, 'Vera Serif': true,
  'Versailles': true, 'Wanted': true, 'Weiss': true,
  'Wide Latin': true, 'Windsor': true, 'XITS': true
};

var FontLoader = {
  listeningForFontLoad: false,

  bind: function fontLoaderBind(fonts, callback) {
    function checkFontsLoaded() {
      for (var i = 0, ii = objs.length; i < ii; i++) {
        var fontObj = objs[i];
        if (fontObj.loading) {
          return false;
        }
      }

      document.documentElement.removeEventListener(
        'pdfjsFontLoad', checkFontsLoaded, false);

      callback();
      return true;
    }

    var rules = [], names = [], objs = [];

    for (var i = 0, ii = fonts.length; i < ii; i++) {
      var font = fonts[i];

      // If there is already a fontObj on the font, then it was loaded/attached
      // to the page already and we don't have to do anything for this font
      // here future.
      if (font.fontObj) {
        continue;
      }

      var obj = new Font(font.name, font.file, font.properties);

      // Store the fontObj on the font such that `setFont` in CanvasGraphics
      // can reuse it later again.
      font.fontObj = obj;

      objs.push(obj);

      var str = '';
      var data = obj.data;
      if (data) {
        var length = data.length;
        for (var j = 0; j < length; j++)
          str += String.fromCharCode(data[j]);

        var rule = isWorker ? obj.bindWorker(str) : obj.bindDOM(str);
        if (rule) {
          rules.push(rule);
          names.push(obj.loadedName);
        }
      }
    }

    this.listeningForFontLoad = false;
    if (!isWorker && rules.length) {
      FontLoader.prepareFontLoadEvent(rules, names, objs);
    }

    if (!checkFontsLoaded()) {
      document.documentElement.addEventListener(
        'pdfjsFontLoad', checkFontsLoaded, false);
    }

    return objs;
  },
  // Set things up so that at least one pdfjsFontLoad event is
  // dispatched when all the @font-face |rules| for |names| have been
  // loaded in a subdocument.  It's expected that the load of |rules|
  // has already started in this (outer) document, so that they should
  // be ordered before the load in the subdocument.
  prepareFontLoadEvent: function fontLoaderPrepareFontLoadEvent(rules, names,
                                                                objs) {
      /** Hack begin */
      // There's no event when a font has finished downloading so the
      // following code is a dirty hack to 'guess' when a font is
      // ready.  This code will be obsoleted by Mozilla bug 471915.
      //
      // The only reliable way to know if a font is loaded in Gecko
      // (at the moment) is document.onload in a document with
      // a @font-face rule defined in a "static" stylesheet.  We use a
      // subdocument in an <iframe>, set up properly, to know when
      // our @font-face rule was loaded.  However, the subdocument and
      // outer document can't share CSS rules, so the inner document
      // is only part of the puzzle.  The second piece is an invisible
      // div created in order to force loading of the @font-face in
      // the *outer* document.  (The font still needs to be loaded for
      // its metrics, for reflow).  We create the div first for the
      // outer document, then create the iframe.  Unless something
      // goes really wonkily, we expect the @font-face for the outer
      // document to be processed before the inner.  That's still
      // fragile, but seems to work in practice.
      //
      // The postMessage() hackery was added to work around chrome bug
      // 82402.

      var div = document.createElement('div');
      div.setAttribute('style',
                       'visibility: hidden;' +
                       'width: 10px; height: 10px;' +
                       'position: absolute; top: 0px; left: 0px;');
      var html = '';
      for (var i = 0, ii = names.length; i < ii; ++i) {
        html += '<span style="font-family:' + names[i] + '">Hi</span>';
      }
      div.innerHTML = html;
      document.body.appendChild(div);

      if (!this.listeningForFontLoad) {
        window.addEventListener(
          'message',
          function fontLoaderMessage(e) {
            var fontNames = JSON.parse(e.data);
            for (var i = 0, ii = objs.length; i < ii; ++i) {
              var font = objs[i];
              font.loading = false;
            }
            var evt = document.createEvent('Events');
            evt.initEvent('pdfjsFontLoad', true, false);
            document.documentElement.dispatchEvent(evt);
          },
          false);
        this.listeningForFontLoad = true;
      }

      // XXX we should have a time-out here too, and maybe fire
      // pdfjsFontLoadFailed?
      var src = '<!DOCTYPE HTML><html><head>';
      src += '<style type="text/css">';
      for (var i = 0, ii = rules.length; i < ii; ++i) {
        src += rules[i];
      }
      src += '</style>';
      src += '<script type="application/javascript">';
      var fontNamesArray = '';
      for (var i = 0, ii = names.length; i < ii; ++i) {
        fontNamesArray += '"' + names[i] + '", ';
      }
      src += '  var fontNames=[' + fontNamesArray + '];\n';
      src += '  window.onload = function fontLoaderOnload() {\n';
      src += '    parent.postMessage(JSON.stringify(fontNames), "*");\n';
      src += '  }';
      src += '</script></head><body>';
      for (var i = 0, ii = names.length; i < ii; ++i) {
        src += '<p style="font-family:\'' + names[i] + '\'">Hi</p>';
      }
      src += '</body></html>';
      var frame = document.createElement('iframe');
      frame.src = 'data:text/html,' + src;
      frame.setAttribute('style',
                         'visibility: hidden;' +
                         'width: 10px; height: 10px;' +
                         'position: absolute; top: 0px; left: 0px;');
      document.body.appendChild(frame);
      /** Hack end */
  }
};

var UnicodeRanges = [
  { 'begin': 0x0000, 'end': 0x007F }, // Basic Latin
  { 'begin': 0x0080, 'end': 0x00FF }, // Latin-1 Supplement
  { 'begin': 0x0100, 'end': 0x017F }, // Latin Extended-A
  { 'begin': 0x0180, 'end': 0x024F }, // Latin Extended-B
  { 'begin': 0x0250, 'end': 0x02AF }, // IPA Extensions
  { 'begin': 0x02B0, 'end': 0x02FF }, // Spacing Modifier Letters
  { 'begin': 0x0300, 'end': 0x036F }, // Combining Diacritical Marks
  { 'begin': 0x0370, 'end': 0x03FF }, // Greek and Coptic
  { 'begin': 0x2C80, 'end': 0x2CFF }, // Coptic
  { 'begin': 0x0400, 'end': 0x04FF }, // Cyrillic
  { 'begin': 0x0530, 'end': 0x058F }, // Armenian
  { 'begin': 0x0590, 'end': 0x05FF }, // Hebrew
  { 'begin': 0xA500, 'end': 0xA63F }, // Vai
  { 'begin': 0x0600, 'end': 0x06FF }, // Arabic
  { 'begin': 0x07C0, 'end': 0x07FF }, // NKo
  { 'begin': 0x0900, 'end': 0x097F }, // Devanagari
  { 'begin': 0x0980, 'end': 0x09FF }, // Bengali
  { 'begin': 0x0A00, 'end': 0x0A7F }, // Gurmukhi
  { 'begin': 0x0A80, 'end': 0x0AFF }, // Gujarati
  { 'begin': 0x0B00, 'end': 0x0B7F }, // Oriya
  { 'begin': 0x0B80, 'end': 0x0BFF }, // Tamil
  { 'begin': 0x0C00, 'end': 0x0C7F }, // Telugu
  { 'begin': 0x0C80, 'end': 0x0CFF }, // Kannada
  { 'begin': 0x0D00, 'end': 0x0D7F }, // Malayalam
  { 'begin': 0x0E00, 'end': 0x0E7F }, // Thai
  { 'begin': 0x0E80, 'end': 0x0EFF }, // Lao
  { 'begin': 0x10A0, 'end': 0x10FF }, // Georgian
  { 'begin': 0x1B00, 'end': 0x1B7F }, // Balinese
  { 'begin': 0x1100, 'end': 0x11FF }, // Hangul Jamo
  { 'begin': 0x1E00, 'end': 0x1EFF }, // Latin Extended Additional
  { 'begin': 0x1F00, 'end': 0x1FFF }, // Greek Extended
  { 'begin': 0x2000, 'end': 0x206F }, // General Punctuation
  { 'begin': 0x2070, 'end': 0x209F }, // Superscripts And Subscripts
  { 'begin': 0x20A0, 'end': 0x20CF }, // Currency Symbol
  { 'begin': 0x20D0, 'end': 0x20FF }, // Combining Diacritical Marks For Symbols
  { 'begin': 0x2100, 'end': 0x214F }, // Letterlike Symbols
  { 'begin': 0x2150, 'end': 0x218F }, // Number Forms
  { 'begin': 0x2190, 'end': 0x21FF }, // Arrows
  { 'begin': 0x2200, 'end': 0x22FF }, // Mathematical Operators
  { 'begin': 0x2300, 'end': 0x23FF }, // Miscellaneous Technical
  { 'begin': 0x2400, 'end': 0x243F }, // Control Pictures
  { 'begin': 0x2440, 'end': 0x245F }, // Optical Character Recognition
  { 'begin': 0x2460, 'end': 0x24FF }, // Enclosed Alphanumerics
  { 'begin': 0x2500, 'end': 0x257F }, // Box Drawing
  { 'begin': 0x2580, 'end': 0x259F }, // Block Elements
  { 'begin': 0x25A0, 'end': 0x25FF }, // Geometric Shapes
  { 'begin': 0x2600, 'end': 0x26FF }, // Miscellaneous Symbols
  { 'begin': 0x2700, 'end': 0x27BF }, // Dingbats
  { 'begin': 0x3000, 'end': 0x303F }, // CJK Symbols And Punctuation
  { 'begin': 0x3040, 'end': 0x309F }, // Hiragana
  { 'begin': 0x30A0, 'end': 0x30FF }, // Katakana
  { 'begin': 0x3100, 'end': 0x312F }, // Bopomofo
  { 'begin': 0x3130, 'end': 0x318F }, // Hangul Compatibility Jamo
  { 'begin': 0xA840, 'end': 0xA87F }, // Phags-pa
  { 'begin': 0x3200, 'end': 0x32FF }, // Enclosed CJK Letters And Months
  { 'begin': 0x3300, 'end': 0x33FF }, // CJK Compatibility
  { 'begin': 0xAC00, 'end': 0xD7AF }, // Hangul Syllables
  { 'begin': 0xD800, 'end': 0xDFFF }, // Non-Plane 0 *
  { 'begin': 0x10900, 'end': 0x1091F }, // Phoenicia
  { 'begin': 0x4E00, 'end': 0x9FFF }, // CJK Unified Ideographs
  { 'begin': 0xE000, 'end': 0xF8FF }, // Private Use Area (plane 0)
  { 'begin': 0x31C0, 'end': 0x31EF }, // CJK Strokes
  { 'begin': 0xFB00, 'end': 0xFB4F }, // Alphabetic Presentation Forms
  { 'begin': 0xFB50, 'end': 0xFDFF }, // Arabic Presentation Forms-A
  { 'begin': 0xFE20, 'end': 0xFE2F }, // Combining Half Marks
  { 'begin': 0xFE10, 'end': 0xFE1F }, // Vertical Forms
  { 'begin': 0xFE50, 'end': 0xFE6F }, // Small Form Variants
  { 'begin': 0xFE70, 'end': 0xFEFF }, // Arabic Presentation Forms-B
  { 'begin': 0xFF00, 'end': 0xFFEF }, // Halfwidth And Fullwidth Forms
  { 'begin': 0xFFF0, 'end': 0xFFFF }, // Specials
  { 'begin': 0x0F00, 'end': 0x0FFF }, // Tibetan
  { 'begin': 0x0700, 'end': 0x074F }, // Syriac
  { 'begin': 0x0780, 'end': 0x07BF }, // Thaana
  { 'begin': 0x0D80, 'end': 0x0DFF }, // Sinhala
  { 'begin': 0x1000, 'end': 0x109F }, // Myanmar
  { 'begin': 0x1200, 'end': 0x137F }, // Ethiopic
  { 'begin': 0x13A0, 'end': 0x13FF }, // Cherokee
  { 'begin': 0x1400, 'end': 0x167F }, // Unified Canadian Aboriginal Syllabics
  { 'begin': 0x1680, 'end': 0x169F }, // Ogham
  { 'begin': 0x16A0, 'end': 0x16FF }, // Runic
  { 'begin': 0x1780, 'end': 0x17FF }, // Khmer
  { 'begin': 0x1800, 'end': 0x18AF }, // Mongolian
  { 'begin': 0x2800, 'end': 0x28FF }, // Braille Patterns
  { 'begin': 0xA000, 'end': 0xA48F }, // Yi Syllables
  { 'begin': 0x1700, 'end': 0x171F }, // Tagalog
  { 'begin': 0x10300, 'end': 0x1032F }, // Old Italic
  { 'begin': 0x10330, 'end': 0x1034F }, // Gothic
  { 'begin': 0x10400, 'end': 0x1044F }, // Deseret
  { 'begin': 0x1D000, 'end': 0x1D0FF }, // Byzantine Musical Symbols
  { 'begin': 0x1D400, 'end': 0x1D7FF }, // Mathematical Alphanumeric Symbols
  { 'begin': 0xFF000, 'end': 0xFFFFD }, // Private Use (plane 15)
  { 'begin': 0xFE00, 'end': 0xFE0F }, // Variation Selectors
  { 'begin': 0xE0000, 'end': 0xE007F }, // Tags
  { 'begin': 0x1900, 'end': 0x194F }, // Limbu
  { 'begin': 0x1950, 'end': 0x197F }, // Tai Le
  { 'begin': 0x1980, 'end': 0x19DF }, // New Tai Lue
  { 'begin': 0x1A00, 'end': 0x1A1F }, // Buginese
  { 'begin': 0x2C00, 'end': 0x2C5F }, // Glagolitic
  { 'begin': 0x2D30, 'end': 0x2D7F }, // Tifinagh
  { 'begin': 0x4DC0, 'end': 0x4DFF }, // Yijing Hexagram Symbols
  { 'begin': 0xA800, 'end': 0xA82F }, // Syloti Nagri
  { 'begin': 0x10000, 'end': 0x1007F }, // Linear B Syllabary
  { 'begin': 0x10140, 'end': 0x1018F }, // Ancient Greek Numbers
  { 'begin': 0x10380, 'end': 0x1039F }, // Ugaritic
  { 'begin': 0x103A0, 'end': 0x103DF }, // Old Persian
  { 'begin': 0x10450, 'end': 0x1047F }, // Shavian
  { 'begin': 0x10480, 'end': 0x104AF }, // Osmanya
  { 'begin': 0x10800, 'end': 0x1083F }, // Cypriot Syllabary
  { 'begin': 0x10A00, 'end': 0x10A5F }, // Kharoshthi
  { 'begin': 0x1D300, 'end': 0x1D35F }, // Tai Xuan Jing Symbols
  { 'begin': 0x12000, 'end': 0x123FF }, // Cuneiform
  { 'begin': 0x1D360, 'end': 0x1D37F }, // Counting Rod Numerals
  { 'begin': 0x1B80, 'end': 0x1BBF }, // Sundanese
  { 'begin': 0x1C00, 'end': 0x1C4F }, // Lepcha
  { 'begin': 0x1C50, 'end': 0x1C7F }, // Ol Chiki
  { 'begin': 0xA880, 'end': 0xA8DF }, // Saurashtra
  { 'begin': 0xA900, 'end': 0xA92F }, // Kayah Li
  { 'begin': 0xA930, 'end': 0xA95F }, // Rejang
  { 'begin': 0xAA00, 'end': 0xAA5F }, // Cham
  { 'begin': 0x10190, 'end': 0x101CF }, // Ancient Symbols
  { 'begin': 0x101D0, 'end': 0x101FF }, // Phaistos Disc
  { 'begin': 0x102A0, 'end': 0x102DF }, // Carian
  { 'begin': 0x1F030, 'end': 0x1F09F }  // Domino Tiles
];

var MacStandardGlyphOrdering = [
  '.notdef', '.null', 'nonmarkingreturn', 'space', 'exclam', 'quotedbl',
  'numbersign', 'dollar', 'percent', 'ampersand', 'quotesingle', 'parenleft',
  'parenright', 'asterisk', 'plus', 'comma', 'hyphen', 'period', 'slash',
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'colon', 'semicolon', 'less', 'equal', 'greater', 'question', 'at',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'bracketleft',
  'backslash', 'bracketright', 'asciicircum', 'underscore', 'grave', 'a', 'b',
  'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q',
  'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'braceleft', 'bar', 'braceright',
  'asciitilde', 'Adieresis', 'Aring', 'Ccedilla', 'Eacute', 'Ntilde',
  'Odieresis', 'Udieresis', 'aacute', 'agrave', 'acircumflex', 'adieresis',
  'atilde', 'aring', 'ccedilla', 'eacute', 'egrave', 'ecircumflex', 'edieresis',
  'iacute', 'igrave', 'icircumflex', 'idieresis', 'ntilde', 'oacute', 'ograve',
  'ocircumflex', 'odieresis', 'otilde', 'uacute', 'ugrave', 'ucircumflex',
  'udieresis', 'dagger', 'degree', 'cent', 'sterling', 'section', 'bullet',
  'paragraph', 'germandbls', 'registered', 'copyright', 'trademark', 'acute',
  'dieresis', 'notequal', 'AE', 'Oslash', 'infinity', 'plusminus', 'lessequal',
  'greaterequal', 'yen', 'mu', 'partialdiff', 'summation', 'product', 'pi',
  'integral', 'ordfeminine', 'ordmasculine', 'Omega', 'ae', 'oslash',
  'questiondown', 'exclamdown', 'logicalnot', 'radical', 'florin',
  'approxequal', 'Delta', 'guillemotleft', 'guillemotright', 'ellipsis',
  'nonbreakingspace', 'Agrave', 'Atilde', 'Otilde', 'OE', 'oe', 'endash',
  'emdash', 'quotedblleft', 'quotedblright', 'quoteleft', 'quoteright',
  'divide', 'lozenge', 'ydieresis', 'Ydieresis', 'fraction', 'currency',
  'guilsinglleft', 'guilsinglright', 'fi', 'fl', 'daggerdbl', 'periodcentered',
  'quotesinglbase', 'quotedblbase', 'perthousand', 'Acircumflex',
  'Ecircumflex', 'Aacute', 'Edieresis', 'Egrave', 'Iacute', 'Icircumflex',
  'Idieresis', 'Igrave', 'Oacute', 'Ocircumflex', 'apple', 'Ograve', 'Uacute',
  'Ucircumflex', 'Ugrave', 'dotlessi', 'circumflex', 'tilde', 'macron',
  'breve', 'dotaccent', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron',
  'Lslash', 'lslash', 'Scaron', 'scaron', 'Zcaron', 'zcaron', 'brokenbar',
  'Eth', 'eth', 'Yacute', 'yacute', 'Thorn', 'thorn', 'minus', 'multiply',
  'onesuperior', 'twosuperior', 'threesuperior', 'onehalf', 'onequarter',
  'threequarters', 'franc', 'Gbreve', 'gbreve', 'Idotaccent', 'Scedilla',
  'scedilla', 'Cacute', 'cacute', 'Ccaron', 'ccaron', 'dcroat'];

function getUnicodeRangeFor(value) {
  for (var i = 0, ii = UnicodeRanges.length; i < ii; i++) {
    var range = UnicodeRanges[i];
    if (value >= range.begin && value < range.end)
      return i;
  }
  return -1;
}

function adaptUnicode(unicode) {
  return (unicode <= 0x1F || (unicode >= 127 && unicode < kSizeOfGlyphArea)) ?
    unicode + kCmapGlyphOffset : unicode;
}

function isAdaptedUnicode(unicode) {
  return unicode >= kCmapGlyphOffset &&
    unicode < kCmapGlyphOffset + kSizeOfGlyphArea;
}

function isSpecialUnicode(unicode) {
  return (unicode <= 0x1F || (unicode >= 127 && unicode < kSizeOfGlyphArea)) ||
    unicode >= kCmapGlyphOffset &&
    unicode < kCmapGlyphOffset + kSizeOfGlyphArea;
}

/**
 * 'Font' is the class the outside world should use, it encapsulate all the font
 * decoding logics whatever type it is (assuming the font type is supported).
 *
 * For example to read a Type1 font and to attach it to the document:
 *   var type1Font = new Font("MyFontName", binaryFile, propertiesObject);
 *   type1Font.bind();
 */
var Font = (function Font() {
  var constructor = function font_constructor(name, file, properties) {
    this.name = name;
    this.coded = properties.coded;
    this.charProcIRQueues = properties.charProcIRQueues;
    this.resources = properties.resources;
    this.sizes = [];

    var names = name.split('+');
    names = names.length > 1 ? names[1] : names[0];
    names = names.split(/[-,_]/g)[0];
    this.serif = serifFonts[names] || (name.search(/serif/gi) != -1);

    var type = properties.type;
    this.type = type;

    // If the font is to be ignored, register it like an already loaded font
    // to avoid the cost of waiting for it be be loaded by the platform.
    if (properties.ignore) {
      this.loadedName = this.serif ? 'serif' : 'sans-serif';
      this.loading = false;
      return;
    }

    this.differences = properties.differences;
    this.widths = properties.widths;
    this.defaultWidth = properties.defaultWidth;
    this.composite = properties.composite;
    this.toUnicode = properties.toUnicode;
    this.hasEncoding = properties.hasEncoding;

    this.fontMatrix = properties.fontMatrix;
    if (properties.type == 'Type3')
      return;

    // Trying to fix encoding using glyph CIDSystemInfo.
    this.loadCidToUnicode(properties);

    if (!file) {
      // The file data is not specified. Trying to fix the font name
      // to be used with the canvas.font.
      var fontName = name.replace(/[,_]/g, '-');
      fontName = stdFontMap[fontName] || fontName;

      this.bold = (fontName.search(/bold/gi) != -1);
      this.italic = (fontName.search(/oblique/gi) != -1) ||
                    (fontName.search(/italic/gi) != -1);

      // Use 'name' instead of 'fontName' here because the original
      // name ArialBlack for example will be replaced by Helvetica.
      this.black = (name.search(/Black/g) != -1);

      this.encoding = properties.baseEncoding;
      this.noUnicodeAdaptation = true;
      this.loadedName = fontName.split('-')[0];
      this.loading = false;
      return;
    }

    var data;
    switch (type) {
      case 'Type1':
      case 'CIDFontType0':
        this.mimetype = 'font/opentype';

        var subtype = properties.subtype;
        var cff = (subtype == 'Type1C' || subtype == 'CIDFontType0C') ?
          new Type2CFF(file, properties) : new CFF(name, file, properties);

        // Wrap the CFF data inside an OTF font file
        data = this.convert(name, cff, properties);
        break;

      case 'TrueType':
      case 'CIDFontType2':
        this.mimetype = 'font/opentype';

        // Repair the TrueType file. It is can be damaged in the point of
        // view of the sanitizer
        data = this.checkAndRepair(name, file, properties);
        break;

      default:
        warn('Font ' + properties.type + ' is not supported');
        break;
    }

    this.data = data;
    this.fontMatrix = properties.fontMatrix;
    this.encoding = properties.baseEncoding;
    this.hasShortCmap = properties.hasShortCmap;
    this.loadedName = getUniqueName();
    this.loading = true;
  };

  var numFonts = 0;
  function getUniqueName() {
    return 'pdfFont' + numFonts++;
  }

  function stringToArray(str) {
    var array = [];
    for (var i = 0, ii = str.length; i < ii; ++i)
      array[i] = str.charCodeAt(i);

    return array;
  };

  function arrayToString(arr) {
    var str = '';
    for (var i = 0, ii = arr.length; i < ii; ++i)
      str += String.fromCharCode(arr[i]);

    return str;
  };

  function int16(bytes) {
    return (bytes[0] << 8) + (bytes[1] & 0xff);
  };

  function int32(bytes) {
    return (bytes[0] << 24) + (bytes[1] << 16) +
           (bytes[2] << 8) + (bytes[3] & 0xff);
  };

  function getMaxPower2(number) {
    var maxPower = 0;
    var value = number;
    while (value >= 2) {
      value /= 2;
      maxPower++;
    }

    value = 2;
    for (var i = 1; i < maxPower; i++)
      value *= 2;
    return value;
  };

  function string16(value) {
    return String.fromCharCode((value >> 8) & 0xff) +
           String.fromCharCode(value & 0xff);
  };

  function string32(value) {
    return String.fromCharCode((value >> 24) & 0xff) +
           String.fromCharCode((value >> 16) & 0xff) +
           String.fromCharCode((value >> 8) & 0xff) +
           String.fromCharCode(value & 0xff);
  };

  function createOpenTypeHeader(sfnt, file, numTables) {
    // Windows hates the Mac TrueType sfnt version number
    if (sfnt == 'true')
      sfnt = string32(0x00010000);

    // sfnt version (4 bytes)
    var header = sfnt;

    // numTables (2 bytes)
    header += string16(numTables);

    // searchRange (2 bytes)
    var tablesMaxPower2 = getMaxPower2(numTables);
    var searchRange = tablesMaxPower2 * 16;
    header += string16(searchRange);

    // entrySelector (2 bytes)
    header += string16(Math.log(tablesMaxPower2) / Math.log(2));

    // rangeShift (2 bytes)
    header += string16(numTables * 16 - searchRange);

    file.file += header;
    file.virtualOffset += header.length;
  };

  function createTableEntry(file, tag, data) {
    // offset
    var offset = file.virtualOffset;

    // length
    var length = data.length;

    // Per spec tables must be 4-bytes align so add padding as needed
    while (data.length & 3)
      data.push(0x00);

    while (file.virtualOffset & 3)
      file.virtualOffset++;

    // checksum
    var checksum = 0, n = data.length;
    for (var i = 0; i < n; i += 4)
      checksum = (checksum + int32([data[i], data[i + 1], data[i + 2],
                                    data[i + 3]])) | 0;

    var tableEntry = (tag + string32(checksum) +
                      string32(offset) + string32(length));
    file.file += tableEntry;
    file.virtualOffset += data.length;
  };

  function getRanges(glyphs) {
    // Array.sort() sorts by characters, not numerically, so convert to an
    // array of characters.
    var codes = [];
    var length = glyphs.length;
    for (var n = 0; n < length; ++n)
      codes.push({ unicode: glyphs[n].unicode, code: n });
    codes.sort(function fontGetRangesSort(a, b) {
      return a.unicode - b.unicode;
    });

    // Split the sorted codes into ranges.
    var ranges = [];
    for (var n = 0; n < length; ) {
      var start = codes[n].unicode;
      var startCode = codes[n].code;
      ++n;
      var end = start;
      while (n < length && end + 1 == codes[n].unicode) {
        ++end;
        ++n;
      }
      var endCode = codes[n - 1].code;
      ranges.push([start, end, startCode, endCode]);
    }

    return ranges;
  };

  function createCMapTable(glyphs, deltas) {
    var ranges = getRanges(glyphs);

    var numTables = 1;
    var cmap = '\x00\x00' + // version
               string16(numTables) +  // numTables
               '\x00\x03' + // platformID
               '\x00\x01' + // encodingID
               string32(4 + numTables * 8); // start of the table record

    var segCount = ranges.length + 1;
    var segCount2 = segCount * 2;
    var searchRange = getMaxPower2(segCount) * 2;
    var searchEntry = Math.log(segCount) / Math.log(2);
    var rangeShift = 2 * segCount - searchRange;

    // Fill up the 4 parallel arrays describing the segments.
    var startCount = '';
    var endCount = '';
    var idDeltas = '';
    var idRangeOffsets = '';
    var glyphsIds = '';
    var bias = 0;

    if (deltas) {
      for (var i = 0; i < segCount - 1; i++) {
        var range = ranges[i];
        var start = range[0];
        var end = range[1];
        var offset = (segCount - i) * 2 + bias * 2;
        bias += (end - start + 1);

        startCount += string16(start);
        endCount += string16(end);
        idDeltas += string16(0);
        idRangeOffsets += string16(offset);

        var startCode = range[2];
        var endCode = range[3];
        for (var j = startCode; j <= endCode; ++j)
          glyphsIds += string16(deltas[j]);
      }
    } else {
      for (var i = 0; i < segCount - 1; i++) {
        var range = ranges[i];
        var start = range[0];
        var end = range[1];
        var startCode = range[2];

        startCount += string16(start);
        endCount += string16(end);
        idDeltas += string16((startCode - start + 1) & 0xFFFF);
        idRangeOffsets += string16(0);
      }
    }

    endCount += '\xFF\xFF';
    startCount += '\xFF\xFF';
    idDeltas += '\x00\x01';
    idRangeOffsets += '\x00\x00';

    var format314 = '\x00\x00' + // language
                    string16(segCount2) +
                    string16(searchRange) +
                    string16(searchEntry) +
                    string16(rangeShift) +
                    endCount + '\x00\x00' + startCount +
                    idDeltas + idRangeOffsets + glyphsIds;

    return stringToArray(cmap +
                         '\x00\x04' + // format
                         string16(format314.length + 4) + // length
                         format314);
  };

  function createOS2Table(properties, charstrings, override) {
    override = override || {
      unitsPerEm: 0,
      yMax: 0,
      yMin: 0,
      ascent: 0,
      descent: 0
    };

    var ulUnicodeRange1 = 0;
    var ulUnicodeRange2 = 0;
    var ulUnicodeRange3 = 0;
    var ulUnicodeRange4 = 0;

    var firstCharIndex = null;
    var lastCharIndex = 0;

    if (charstrings) {
      for (var i = 0; i < charstrings.length; ++i) {
        var code = charstrings[i].unicode;
        if (firstCharIndex > code || !firstCharIndex)
          firstCharIndex = code;
        if (lastCharIndex < code)
          lastCharIndex = code;

        var position = getUnicodeRangeFor(code);
        if (position < 32) {
          ulUnicodeRange1 |= 1 << position;
        } else if (position < 64) {
          ulUnicodeRange2 |= 1 << position - 32;
        } else if (position < 96) {
          ulUnicodeRange3 |= 1 << position - 64;
        } else if (position < 123) {
          ulUnicodeRange4 |= 1 << position - 96;
        } else {
          error('Unicode ranges Bits > 123 are reserved for internal usage');
        }
      }
    } else {
      // TODO
      firstCharIndex = 0;
      lastCharIndex = 255;
    }

    var unitsPerEm = override.unitsPerEm || kPDFGlyphSpaceUnits;
    var typoAscent = override.ascent || properties.ascent;
    var typoDescent = override.descent || properties.descent;
    var winAscent = override.yMax || typoAscent;
    var winDescent = -override.yMin || -typoDescent;

    // if there is a units per em value but no other override
    // then scale the calculated ascent
    if (unitsPerEm != kPDFGlyphSpaceUnits &&
        'undefined' == typeof(override.ascent)) {
      // if the font units differ to the PDF glyph space units
      // then scale up the values
      typoAscent = Math.round(typoAscent * unitsPerEm / kPDFGlyphSpaceUnits);
      typoDescent = Math.round(typoDescent * unitsPerEm / kPDFGlyphSpaceUnits);
      winAscent = typoAscent;
      winDescent = -typoDescent;
    }

    return '\x00\x03' + // version
           '\x02\x24' + // xAvgCharWidth
           '\x01\xF4' + // usWeightClass
           '\x00\x05' + // usWidthClass
           '\x00\x00' + // fstype (0 to let the font loads via font-face on IE)
           '\x02\x8A' + // ySubscriptXSize
           '\x02\xBB' + // ySubscriptYSize
           '\x00\x00' + // ySubscriptXOffset
           '\x00\x8C' + // ySubscriptYOffset
           '\x02\x8A' + // ySuperScriptXSize
           '\x02\xBB' + // ySuperScriptYSize
           '\x00\x00' + // ySuperScriptXOffset
           '\x01\xDF' + // ySuperScriptYOffset
           '\x00\x31' + // yStrikeOutSize
           '\x01\x02' + // yStrikeOutPosition
           '\x00\x00' + // sFamilyClass
           '\x00\x00\x06' +
           String.fromCharCode(properties.fixedPitch ? 0x09 : 0x00) +
           '\x00\x00\x00\x00\x00\x00' + // Panose
           string32(ulUnicodeRange1) + // ulUnicodeRange1 (Bits 0-31)
           string32(ulUnicodeRange2) + // ulUnicodeRange2 (Bits 32-63)
           string32(ulUnicodeRange3) + // ulUnicodeRange3 (Bits 64-95)
           string32(ulUnicodeRange4) + // ulUnicodeRange4 (Bits 96-127)
           '\x2A\x32\x31\x2A' + // achVendID
           string16(properties.italicAngle ? 1 : 0) + // fsSelection
           string16(firstCharIndex ||
                    properties.firstChar) + // usFirstCharIndex
           string16(lastCharIndex || properties.lastChar) +  // usLastCharIndex
           string16(typoAscent) + // sTypoAscender
           string16(typoDescent) + // sTypoDescender
           '\x00\x64' + // sTypoLineGap (7%-10% of the unitsPerEM value)
           string16(winAscent) + // usWinAscent
           string16(winDescent) + // usWinDescent
           '\x00\x00\x00\x00' + // ulCodePageRange1 (Bits 0-31)
           '\x00\x00\x00\x00' + // ulCodePageRange2 (Bits 32-63)
           string16(properties.xHeight) + // sxHeight
           string16(properties.capHeight) + // sCapHeight
           string16(0) + // usDefaultChar
           string16(firstCharIndex || properties.firstChar) + // usBreakChar
           '\x00\x03';  // usMaxContext
  };

  function createPostTable(properties) {
    var angle = Math.floor(properties.italicAngle * (Math.pow(2, 16)));
    return '\x00\x03\x00\x00' + // Version number
           string32(angle) + // italicAngle
           '\x00\x00' + // underlinePosition
           '\x00\x00' + // underlineThickness
           string32(properties.fixedPitch) + // isFixedPitch
           '\x00\x00\x00\x00' + // minMemType42
           '\x00\x00\x00\x00' + // maxMemType42
           '\x00\x00\x00\x00' + // minMemType1
           '\x00\x00\x00\x00';  // maxMemType1
  };

  function createNameTable(name) {
    var strings = [
      'Original licence',  // 0.Copyright
      name,                // 1.Font family
      'Unknown',           // 2.Font subfamily (font weight)
      'uniqueID',          // 3.Unique ID
      name,                // 4.Full font name
      'Version 0.11',      // 5.Version
      '',                  // 6.Postscript name
      'Unknown',           // 7.Trademark
      'Unknown',           // 8.Manufacturer
      'Unknown'            // 9.Designer
    ];

    // Mac want 1-byte per character strings while Windows want
    // 2-bytes per character, so duplicate the names table
    var stringsUnicode = [];
    for (var i = 0, ii = strings.length; i < ii; i++) {
      var str = strings[i];

      var strUnicode = '';
      for (var j = 0, jj = str.length; j < jj; j++)
        strUnicode += string16(str.charCodeAt(j));
      stringsUnicode.push(strUnicode);
    }

    var names = [strings, stringsUnicode];
    var platforms = ['\x00\x01', '\x00\x03'];
    var encodings = ['\x00\x00', '\x00\x01'];
    var languages = ['\x00\x00', '\x04\x09'];

    var namesRecordCount = strings.length * platforms.length;
    var nameTable =
      '\x00\x00' +                           // format
      string16(namesRecordCount) +           // Number of names Record
      string16(namesRecordCount * 12 + 6);   // Storage

    // Build the name records field
    var strOffset = 0;
    for (var i = 0, ii = platforms.length; i < ii; i++) {
      var strs = names[i];
      for (var j = 0, jj = strs.length; j < jj; j++) {
        var str = strs[j];
        var nameRecord =
          platforms[i] + // platform ID
          encodings[i] + // encoding ID
          languages[i] + // language ID
          string16(j) + // name ID
          string16(str.length) +
          string16(strOffset);
        nameTable += nameRecord;
        strOffset += str.length;
      }
    }

    nameTable += strings.join('') + stringsUnicode.join('');
    return nameTable;
  }

  constructor.prototype = {
    name: null,
    font: null,
    mimetype: null,
    encoding: null,

    checkAndRepair: function font_checkAndRepair(name, font, properties) {
      function readTableEntry(file) {
        var tag = file.getBytes(4);
        tag = String.fromCharCode(tag[0]) +
              String.fromCharCode(tag[1]) +
              String.fromCharCode(tag[2]) +
              String.fromCharCode(tag[3]);

        var checksum = int32(file.getBytes(4));
        var offset = int32(file.getBytes(4));
        var length = int32(file.getBytes(4));

        // Read the table associated data
        var previousPosition = file.pos;
        file.pos = file.start ? file.start : 0;
        file.skip(offset);
        var data = file.getBytes(length);
        file.pos = previousPosition;

        if (tag == 'head') {
          // clearing checksum adjustment
          data[8] = data[9] = data[10] = data[11] = 0;
          data[17] |= 0x20; //Set font optimized for cleartype flag
        }

        return {
          tag: tag,
          checksum: checksum,
          length: length,
          offset: offset,
          data: data
        };
      };

      function readOpenTypeHeader(ttf) {
        return {
          version: arrayToString(ttf.getBytes(4)),
          numTables: int16(ttf.getBytes(2)),
          searchRange: int16(ttf.getBytes(2)),
          entrySelector: int16(ttf.getBytes(2)),
          rangeShift: int16(ttf.getBytes(2))
        };
      };

      function createGlyphNameMap(glyphs, ids, properties) {
        var glyphNames = properties.glyphNames;
        if (!glyphNames) {
          properties.glyphNameMap = {};
          return;
        }
        var glyphsLength = glyphs.length;
        var glyphNameMap = {};
        var encoding = [];
        for (var i = 0; i < glyphsLength; ++i) {
          var glyphName = glyphNames[ids[i]];
          if (!glyphName)
            continue;
          var unicode = glyphs[i].unicode;
          glyphNameMap[glyphName] = unicode;
          var code = glyphs[i].code;
          encoding[code] = glyphName;
        }
        properties.glyphNameMap = glyphNameMap;
        if (!properties.hasEncoding)
          properties.baseEncoding = encoding;
      }

      function replaceCMapTable(cmap, font, properties) {
        var start = (font.start ? font.start : 0) + cmap.offset;
        font.pos = start;

        var version = int16(font.getBytes(2));
        var numRecords = int16(font.getBytes(2));

        var records = [];
        for (var i = 0; i < numRecords; i++) {
          records.push({
            platformID: int16(font.getBytes(2)),
            encodingID: int16(font.getBytes(2)),
            offset: int32(font.getBytes(4))
          });
        }

        // Check that table are sorted by platformID then encodingID,
        records.sort(function fontReplaceCMapTableSort(a, b) {
          return ((a.platformID << 16) + a.encodingID) -
                 ((b.platformID << 16) + b.encodingID);
        });

        var tables = [records[0]];
        for (var i = 1; i < numRecords; i++) {
          // The sanitizer will drop the font if 2 tables have the same
          // platformID and the same encodingID, this will be correct for
          // most cases but if the font has been made for Mac it could
          // exist a few platformID: 1, encodingID: 0 but with a different
          // language field and that's correct. But the sanitizer does not
          // seem to support this case.
          var current = records[i];
          var previous = records[i - 1];
          if (((current.platformID << 16) + current.encodingID) <=
             ((previous.platformID << 16) + previous.encodingID))
                continue;
          tables.push(current);
        }

        var missing = numRecords - tables.length;
        if (missing) {
          numRecords = tables.length;
          var data = string16(version) + string16(numRecords);

          for (var i = 0; i < numRecords; i++) {
            var table = tables[i];
            data += string16(table.platformID) +
                    string16(table.encodingID) +
                    string32(table.offset);
          }

          for (var i = 0, ii = data.length; i < ii; i++)
            cmap.data[i] = data.charCodeAt(i);
        }

        for (var i = 0; i < numRecords; i++) {
          var table = tables[i];
          font.pos = start + table.offset;

          var format = int16(font.getBytes(2));
          var length = int16(font.getBytes(2));
          var language = int16(font.getBytes(2));

          if (format == 0) {
            // Characters below 0x20 are controls characters that are hardcoded
            // into the platform so if some characters in the font are assigned
            // under this limit they will not be displayed so let's rewrite the
            // CMap.
            var glyphs = [];
            var ids = [];
            for (var j = 0; j < 256; j++) {
              var index = font.getByte();
              if (index) {
                var unicode = adaptUnicode(j);
                glyphs.push({ unicode: unicode, code: j });
                ids.push(index);
              }
            }

            properties.hasShortCmap = true;

            createGlyphNameMap(glyphs, ids, properties);
            return cmap.data = createCMapTable(glyphs, ids);
          } else if (format == 4) {
            // re-creating the table in format 4 since the encoding
            // might be changed
            var segCount = (int16(font.getBytes(2)) >> 1);
            font.getBytes(6); // skipping range fields
            var segIndex, segments = [];
            for (segIndex = 0; segIndex < segCount; segIndex++) {
              segments.push({ end: int16(font.getBytes(2)) });
            }
            font.getBytes(2);
            for (segIndex = 0; segIndex < segCount; segIndex++) {
              segments[segIndex].start = int16(font.getBytes(2));
            }

            for (segIndex = 0; segIndex < segCount; segIndex++) {
              segments[segIndex].delta = int16(font.getBytes(2));
            }

            var offsetsCount = 0;
            for (segIndex = 0; segIndex < segCount; segIndex++) {
              var segment = segments[segIndex];
              var rangeOffset = int16(font.getBytes(2));
              if (!rangeOffset) {
                segment.offsetIndex = -1;
                continue;
              }

              var offsetIndex = (rangeOffset >> 1) - (segCount - segIndex);
              segment.offsetIndex = offsetIndex;
              offsetsCount = Math.max(offsetsCount, offsetIndex +
                segment.end - segment.start + 1);
            }

            var offsets = [];
            for (var j = 0; j < offsetsCount; j++)
              offsets.push(int16(font.getBytes(2)));

            var glyphs = [], ids = [];

            for (segIndex = 0; segIndex < segCount; segIndex++) {
              var segment = segments[segIndex];
              var start = segment.start, end = segment.end;
              var delta = segment.delta, offsetIndex = segment.offsetIndex;

              for (var j = start; j <= end; j++) {
                if (j == 0xFFFF)
                  continue;

                var glyphCode = offsetIndex < 0 ? j :
                  offsets[offsetIndex + j - start];
                glyphCode = (glyphCode + delta) & 0xFFFF;
                if (glyphCode == 0 || isAdaptedUnicode(j))
                  continue;

                var unicode = adaptUnicode(j);
                glyphs.push({ unicode: unicode, code: j });
                ids.push(glyphCode);
              }
            }

            createGlyphNameMap(glyphs, ids, properties);
            return cmap.data = createCMapTable(glyphs, ids);
          } else if (format == 6) {
            // Format 6 is a 2-bytes dense mapping, which means the font data
            // lives glue together even if they are pretty far in the unicode
            // table. (This looks weird, so I can have missed something), this
            // works on Linux but seems to fails on Mac so let's rewrite the
            // cmap table to a 3-1-4 style
            var firstCode = int16(font.getBytes(2));
            var entryCount = int16(font.getBytes(2));

            var glyphs = [];
            var ids = [];
            for (var j = 0; j < entryCount; j++) {
              var glyphCode = int16(font.getBytes(2));
              var code = firstCode + j;
              if (isAdaptedUnicode(glyphCode))
                continue;

              var unicode = adaptUnicode(code);
              glyphs.push({ unicode: unicode, code: code });
              ids.push(glyphCode);
            }

            createGlyphNameMap(glyphs, ids, properties);
            return cmap.data = createCMapTable(glyphs, ids);
          }
        }
        return cmap.data;
      };

      function sanitizeMetrics(font, header, metrics, numGlyphs) {
        if (!header && !metrics)
          return;

        // The vhea/vmtx tables are not required, so it happens that
        // some fonts embed a vmtx table without a vhea table. In this
        // situation the sanitizer assume numOfLongVerMetrics = 1. As
        // a result it tries to read numGlyphs - 1 SHORT from the vmtx
        // table, and if it is not possible, the font is rejected.
        // So remove the vmtx table if there is no vhea table.
        if (!header && metrics) {
          metrics.data = null;
          return;
        }

        font.pos = (font.start ? font.start : 0) + header.offset;
        font.pos += header.length - 2;
        var numOfMetrics = int16(font.getBytes(2));

        var numOfSidebearings = numGlyphs - numOfMetrics;
        var numMissing = numOfSidebearings -
          ((hmtx.length - numOfMetrics * 4) >> 1);
        if (numMissing > 0) {
          font.pos = (font.start ? font.start : 0) + metrics.offset;
          var entries = '';
          for (var i = 0, ii = hmtx.length; i < ii; i++)
            entries += String.fromCharCode(font.getByte());
          for (var i = 0; i < numMissing; i++)
            entries += '\x00\x00';
          metrics.data = stringToArray(entries);
        }
      };

      function sanitizeGlyphLocations(loca, glyf, numGlyphs,
                                      isGlyphLocationsLong) {
        var itemSize, itemDecode, itemEncode;
        if (isGlyphLocationsLong) {
          itemSize = 4;
          itemDecode = function fontItemDecodeLong(data, offset) {
            return (data[offset] << 24) | (data[offset + 1] << 16) |
                   (data[offset + 2] << 8) | data[offset + 3];
          };
          itemEncode = function fontItemEncodeLong(data, offset, value) {
            data[offset] = (value >>> 24) & 0xFF;
            data[offset + 1] = (value >> 16) & 0xFF;
            data[offset + 2] = (value >> 8) & 0xFF;
            data[offset + 3] = value & 0xFF;
          };
        } else {
          itemSize = 2;
          itemDecode = function fontItemDecode(data, offset) {
            return (data[offset] << 9) | (data[offset + 1] << 1);
          };
          itemEncode = function fontItemEncode(data, offset, value) {
            data[offset] = (value >> 9) & 0xFF;
            data[offset + 1] = (value >> 1) & 0xFF;
          };
        }
        var locaData = loca.data;
        var startOffset = itemDecode(locaData, 0);
        var firstOffset = itemDecode(locaData, itemSize);
        if (firstOffset - startOffset < 12 || startOffset > 0) {
          // removing first glyph
          glyf.data = glyf.data.subarray(firstOffset);
          glyf.length -= firstOffset;

          itemEncode(locaData, 0, 0);
          var i, pos = itemSize;
          for (i = 1; i <= numGlyphs; ++i) {
            itemEncode(locaData, pos,
              itemDecode(locaData, pos) - firstOffset);
            pos += itemSize;
          }
        }
      }

      function readGlyphNameMap(post, properties) {
        var start = (font.start ? font.start : 0) + post.offset;
        font.pos = start;

        var length = post.length, end = start + length;
        var version = int32(font.getBytes(4));
        // skip rest to the tables
        font.getBytes(28);

        var glyphNames;
        switch (version) {
          case 0x00010000:
            glyphNames = MacStandardGlyphOrdering;
            break;
          case 0x00020000:
            var numGlyphs = int16(font.getBytes(2));
            var glyphNameIndexes = [];
            for (var i = 0; i < numGlyphs; ++i)
              glyphNameIndexes.push(int16(font.getBytes(2)));
            var customNames = [];
            while (font.pos < end) {
              var stringLength = font.getByte();
              var string = '';
              for (var i = 0; i < stringLength; ++i)
                string += font.getChar();
              customNames.push(string);
            }
            glyphNames = [];
            for (var i = 0; i < numGlyphs; ++i) {
              var j = glyphNameIndexes[i];
              if (j < 258) {
                glyphNames.push(MacStandardGlyphOrdering[j]);
                continue;
              }
              glyphNames.push(customNames[j - 258]);
            }
            break;
          case 0x00030000:
            break;
          default:
            warn('Unknown/unsupported post table version ' + version);
            break;
        }
        properties.glyphNames = glyphNames;
      }

      // Check that required tables are present
      var requiredTables = ['OS/2', 'cmap', 'head', 'hhea',
                             'hmtx', 'maxp', 'name', 'post'];

      var header = readOpenTypeHeader(font);
      var numTables = header.numTables;

      var cmap, post, maxp, hhea, hmtx, vhea, vmtx, head, loca, glyf;
      var tables = [];
      for (var i = 0; i < numTables; i++) {
        var table = readTableEntry(font);
        var index = requiredTables.indexOf(table.tag);
        if (index != -1) {
          if (table.tag == 'cmap')
            cmap = table;
          else if (table.tag == 'post')
            post = table;
          else if (table.tag == 'maxp')
            maxp = table;
          else if (table.tag == 'hhea')
            hhea = table;
          else if (table.tag == 'hmtx')
            hmtx = table;
          else if (table.tag == 'head')
            head = table;

          requiredTables.splice(index, 1);
        } else {
          if (table.tag == 'vmtx')
            vmtx = table;
          else if (table.tag == 'vhea')
            vhea = table;
          else if (table.tag == 'loca')
            loca = table;
          else if (table.tag == 'glyf')
            glyf = table;
        }
        tables.push(table);
      }

      var numTables = header.numTables + requiredTables.length;

      // header and new offsets. Table entry information is appended to the
      // end of file. The virtualOffset represents where to put the actual
      // data of a particular table;
      var ttf = {
        file: '',
        virtualOffset: numTables * (4 * 4)
      };

      // The new numbers of tables will be the last one plus the num
      // of missing tables
      createOpenTypeHeader(header.version, ttf, numTables);

      if (requiredTables.indexOf('OS/2') != -1) {
        // extract some more font properties from the OpenType head and
        // hhea tables; yMin and descent value are always negative
        var override = {
          unitsPerEm: int16([head.data[18], head.data[19]]),
          yMax: int16([head.data[42], head.data[43]]),
          yMin: int16([head.data[38], head.data[39]]) - 0x10000,
          ascent: int16([hhea.data[4], hhea.data[5]]),
          descent: int16([hhea.data[6], hhea.data[7]]) - 0x10000
        };

        tables.push({
          tag: 'OS/2',
          data: stringToArray(createOS2Table(properties, null, override))
        });
      }

      // Ensure the [h/v]mtx tables contains the advance width and
      // sidebearings information for numGlyphs in the maxp table
      font.pos = (font.start || 0) + maxp.offset;
      var version = int16(font.getBytes(4));
      var numGlyphs = int16(font.getBytes(2));

      sanitizeMetrics(font, hhea, hmtx, numGlyphs);
      sanitizeMetrics(font, vhea, vmtx, numGlyphs);

      if (head && loca && glyf) {
        var isGlyphLocationsLong = int16([head.data[50], head.data[51]]);
        sanitizeGlyphLocations(loca, glyf, numGlyphs, isGlyphLocationsLong);
      }

      // Sanitizer reduces the glyph advanceWidth to the maxAdvanceWidth
      // Sometimes it's 0. That needs to be fixed
      if (hhea.data[10] == 0 && hhea.data[11] == 0) {
        hhea.data[10] = 0xFF;
        hhea.data[11] = 0xFF;
      }

      // The 'post' table has glyphs names.
      if (post) {
        readGlyphNameMap(post, properties);
      }

      // Replace the old CMAP table with a shiny new one
      if (properties.type == 'CIDFontType2') {
        // Type2 composite fonts map characters directly to glyphs so the cmap
        // table must be replaced.
        // canvas fillText will reencode some characters even if the font has a
        // glyph at that position - e.g. newline is converted to a space and
        // U+00AD (soft hyphen) is not drawn.
        // So, offset all the glyphs by 0xFF to avoid these cases and use
        // the encoding to map incoming characters to the new glyph positions
        if (!cmap) {
          cmap = {
            tag: 'cmap',
            data: null
          };
          tables.push(cmap);
        }

        var glyphs = [];
        for (i = 1; i < numGlyphs; i++) {
          if (isAdaptedUnicode(i))
            continue;

          glyphs.push({ unicode: adaptUnicode(i) });
        }
        cmap.data = createCMapTable(glyphs);
      } else {
        replaceCMapTable(cmap, font, properties);
        this.glyphNameMap = properties.glyphNameMap;
      }

      // Rewrite the 'post' table if needed
      if (requiredTables.indexOf('post') != -1) {
        tables.push({
          tag: 'post',
          data: stringToArray(createPostTable(properties))
        });
      }

      // Rewrite the 'name' table if needed
      if (requiredTables.indexOf('name') != -1) {
        tables.push({
          tag: 'name',
          data: stringToArray(createNameTable(this.name))
        });
      }

      // Tables needs to be written by ascendant alphabetic order
      tables.sort(function tables_sort(a, b) {
        return (a.tag > b.tag) - (a.tag < b.tag);
      });

      // rewrite the tables but tweak offsets
      for (var i = 0, ii = tables.length; i < ii; i++) {
        var table = tables[i];
        var data = [];

        var tableData = table.data;
        for (var j = 0, jj = tableData.length; j < jj; j++)
          data.push(tableData[j]);
        createTableEntry(ttf, table.tag, data);
      }

      // Add the table datas
      for (var i = 0, ii = tables.length; i < ii; i++) {
        var table = tables[i];
        var tableData = table.data;
        ttf.file += arrayToString(tableData);

        // 4-byte aligned data
        while (ttf.file.length & 3)
          ttf.file += String.fromCharCode(0);
      }

      return stringToArray(ttf.file);
    },

    convert: function font_convert(fontName, font, properties) {
      function isFixedPitch(glyphs) {
        for (var i = 0, ii = glyphs.length - 1; i < ii; i++) {
          if (glyphs[i] != glyphs[i + 1])
            return false;
        }
        return true;
      }

      // The offsets object holds at the same time a representation of where
      // to write the table entry information about a table and another offset
      // representing the offset where to draw the actual data of a particular
      // table
      var kRequiredTablesCount = 9;

      var otf = {
        file: '',
        virtualOffset: 9 * (4 * 4)
      };

      createOpenTypeHeader('\x4F\x54\x54\x4F', otf, 9);

      var charstrings = font.charstrings;
      properties.fixedPitch = isFixedPitch(charstrings);

      var glyphNameMap = {};
      for (var i = 0; i < charstrings.length; ++i) {
        var charstring = charstrings[i];
        glyphNameMap[charstring.glyph] = charstring.unicode;
      }
      this.glyphNameMap = glyphNameMap;

      if (!properties.hasEncoding && (properties.subtype == 'Type1C' ||
          properties.subtype == 'CIDFontType0C')) {
        var encoding = [];
        for (var i = 0; i < charstrings.length; ++i) {
          var charstring = charstrings[i];
          encoding[charstring.code] = charstring.glyph;
        }
        properties.baseEncoding = encoding;
      }

      var fields = {
        // PostScript Font Program
        'CFF ': font.data,

        // OS/2 and Windows Specific metrics
        'OS/2': stringToArray(createOS2Table(properties, charstrings)),

        // Character to glyphs mapping
        'cmap': createCMapTable(charstrings.slice(),
                                ('glyphIds' in font) ? font.glyphIds : null),

        // Font header
        'head': (function fontFieldsHead() {
          return stringToArray(
              '\x00\x01\x00\x00' + // Version number
              '\x00\x00\x10\x00' + // fontRevision
              '\x00\x00\x00\x00' + // checksumAdjustement
              '\x5F\x0F\x3C\xF5' + // magicNumber
              '\x00\x00' + // Flags
              '\x03\xE8' + // unitsPerEM (defaulting to 1000)
              '\x00\x00\x00\x00\x9e\x0b\x7e\x27' + // creation date
              '\x00\x00\x00\x00\x9e\x0b\x7e\x27' + // modifification date
              '\x00\x00' + // xMin
              string16(properties.descent) + // yMin
              '\x0F\xFF' + // xMax
              string16(properties.ascent) + // yMax
              string16(properties.italicAngle ? 2 : 0) + // macStyle
              '\x00\x11' + // lowestRecPPEM
              '\x00\x00' + // fontDirectionHint
              '\x00\x00' + // indexToLocFormat
              '\x00\x00');  // glyphDataFormat
        })(),

        // Horizontal header
        'hhea': (function fontFieldsHhea() {
          return stringToArray(
              '\x00\x01\x00\x00' + // Version number
              string16(properties.ascent) + // Typographic Ascent
              string16(properties.descent) + // Typographic Descent
              '\x00\x00' + // Line Gap
              '\xFF\xFF' + // advanceWidthMax
              '\x00\x00' + // minLeftSidebearing
              '\x00\x00' + // minRightSidebearing
              '\x00\x00' + // xMaxExtent
              string16(properties.capHeight) + // caretSlopeRise
              string16(Math.tan(properties.italicAngle) *
                       properties.xHeight) + // caretSlopeRun
              '\x00\x00' + // caretOffset
              '\x00\x00' + // -reserved-
              '\x00\x00' + // -reserved-
              '\x00\x00' + // -reserved-
              '\x00\x00' + // -reserved-
              '\x00\x00' + // metricDataFormat
              string16(charstrings.length + 1)); // Number of HMetrics
        })(),

        // Horizontal metrics
        'hmtx': (function fontFieldsHmtx() {
          var hmtx = '\x00\x00\x00\x00'; // Fake .notdef
          for (var i = 0, ii = charstrings.length; i < ii; i++)
            hmtx += string16(charstrings[i].width) + string16(0);
          return stringToArray(hmtx);
        })(),

        // Maximum profile
        'maxp': (function fontFieldsMaxp() {
          return stringToArray(
              '\x00\x00\x50\x00' + // Version number
             string16(charstrings.length + 1)); // Num of glyphs
        })(),

        // Naming tables
        'name': stringToArray(createNameTable(fontName)),

        // PostScript informations
        'post': stringToArray(createPostTable(properties))
      };

      for (var field in fields)
        createTableEntry(otf, field, fields[field]);

      for (var field in fields) {
        var table = fields[field];
        otf.file += arrayToString(table);
      }

      return stringToArray(otf.file);
    },

    loadCidToUnicode: function font_loadCidToUnicode(properties) {
      if (properties.cidToGidMap) {
        this.cidToUnicode = properties.cidToGidMap;
        return;
      }

      if (!properties.cidSystemInfo)
        return;

      var cidToUnicodeMap = [];
      this.cidToUnicode = cidToUnicodeMap;

      var cidSystemInfo = properties.cidSystemInfo;
      var cidToUnicode;
      if (cidSystemInfo) {
        cidToUnicode = CIDToUnicodeMaps[
          cidSystemInfo.registry + '-' + cidSystemInfo.ordering];
      }

      if (!cidToUnicode)
        return; // identity encoding

      var glyph = 1, i, j, k, ii;
      for (i = 0, ii = cidToUnicode.length; i < ii; ++i) {
        var unicode = cidToUnicode[i];
        if (isArray(unicode)) {
          var length = unicode.length;
          for (j = 0; j < length; j++)
            cidToUnicodeMap[unicode[j]] = glyph;
          glyph++;
        } else if (typeof unicode === 'object') {
          var fillLength = unicode.f;
          if (fillLength) {
            k = unicode.c;
            for (j = 0; j < fillLength; ++j) {
              cidToUnicodeMap[k] = glyph++;
              k++;
            }
          } else
            glyph += unicode.s;
        } else if (unicode) {
          cidToUnicodeMap[unicode] = glyph++;
        } else
          glyph++;
      }
    },

    bindWorker: function font_bindWorker(data) {
      postMessage({
        action: 'font',
        data: {
          raw: data,
          fontName: this.loadedName,
          mimetype: this.mimetype
        }
      });
    },

    bindDOM: function font_bindDom(data) {
      var fontName = this.loadedName;

      // Add the font-face rule to the document
      var url = ('url(data:' + this.mimetype + ';base64,' +
                 window.btoa(data) + ');');
      var rule = "@font-face { font-family:'" + fontName + "';src:" + url + '}';

      document.documentElement.firstChild.appendChild(
        document.createElement('style'));

      var styleSheet = document.styleSheets[document.styleSheets.length - 1];
      styleSheet.insertRule(rule, styleSheet.cssRules.length);

      return rule;
    },

    charToGlyph: function fonts_charToGlyph(charcode) {
      var unicode, width, codeIRQueue;

      var width = this.widths[charcode];

      switch (this.type) {
        case 'CIDFontType0':
          if (this.noUnicodeAdaptation) {
            width = this.widths[this.cidToUnicode[charcode]];
            unicode = charcode;
            break;
          }
          unicode = adaptUnicode(this.cidToUnicode[charcode] || charcode);
          break;
        case 'CIDFontType2':
          if (this.noUnicodeAdaptation) {
            width = this.widths[this.cidToUnicode[charcode]];
            unicode = charcode;
            break;
          }
          unicode = adaptUnicode(this.cidToUnicode[charcode] || charcode);
          break;
        case 'Type1':
          var glyphName = this.differences[charcode] || this.encoding[charcode];
          if (this.noUnicodeAdaptation) {
            if (!isNum(width))
              width = this.widths[glyphName];
            unicode = GlyphsUnicode[glyphName] || charcode;
            break;
          }
          unicode = this.glyphNameMap[glyphName] ||
            adaptUnicode(GlyphsUnicode[glyphName] || charcode);
          break;
        case 'Type3':
          var glyphName = this.differences[charcode] || this.encoding[charcode];
          codeIRQueue = this.charProcIRQueues[glyphName];
          unicode = charcode;
          break;
        case 'TrueType':
          var glyphName = this.differences[charcode] || this.encoding[charcode];
          if (!glyphName)
            glyphName = Encodings.StandardEncoding[charcode];
          if (!isNum(width))
            width = this.widths[glyphName];
          if (this.noUnicodeAdaptation) {
            unicode = GlyphsUnicode[glyphName] || charcode;
            break;
          }
          if (!this.hasEncoding) {
            unicode = adaptUnicode(charcode);
            break;
          }
          if (this.hasShortCmap) {
            var j = Encodings.MacRomanEncoding.indexOf(glyphName);
            unicode = j >= 0 && !isSpecialUnicode(j) ? j :
              this.glyphNameMap[glyphName];
          } else {
            unicode = glyphName in GlyphsUnicode ?
              adaptUnicode(GlyphsUnicode[glyphName]) :
              this.glyphNameMap[glyphName];
          }
          break;
        default:
          warn('Unsupported font type: ' + this.type);
          break;
      }
      return {
        unicode: unicode,
        width: isNum(width) ? width : this.defaultWidth,
        codeIRQueue: codeIRQueue
      };
    },

    charsToGlyphs: function fonts_chars2Glyphs(chars) {
      var charsCache = this.charsCache;
      var glyphs;

      // if we translated this string before, just grab it from the cache
      if (charsCache) {
        glyphs = charsCache[chars];
        if (glyphs)
          return glyphs;
      }

      // lazily create the translation cache
      if (!charsCache)
        charsCache = this.charsCache = Object.create(null);

      glyphs = [];

      if (this.composite) {
        // composite fonts have multi-byte strings convert the string from
        // single-byte to multi-byte
        // XXX assuming CIDFonts are two-byte - later need to extract the
        // correct byte encoding according to the PDF spec
        var length = chars.length - 1; // looping over two bytes at a time so
                                       // loop should never end on the last byte
        for (var i = 0; i < length; i++) {
          var charcode = int16([chars.charCodeAt(i++), chars.charCodeAt(i)]);
          var glyph = this.charToGlyph(charcode);
          glyphs.push(glyph);
          // placing null after each word break charcode (ASCII SPACE)
          if (charcode == 0x20)
            glyphs.push(null);
        }
      }
      else {
        for (var i = 0, ii = chars.length; i < ii; ++i) {
          var charcode = chars.charCodeAt(i);
          var glyph = this.charToGlyph(charcode);
          glyphs.push(glyph);
          if (charcode == 0x20)
            glyphs.push(null);
        }
      }

      // Enter the translated string into the cache
      return (charsCache[chars] = glyphs);
    }
  };

  return constructor;
})();

/*
 * Type1Parser encapsulate the needed code for parsing a Type1 font
 * program. Some of its logic depends on the Type2 charstrings
 * structure.
 */
var Type1Parser = function type1Parser() {
  /*
   * Decrypt a Sequence of Ciphertext Bytes to Produce the Original Sequence
   * of Plaintext Bytes. The function took a key as a parameter which can be
   * for decrypting the eexec block of for decoding charStrings.
   */
  var kEexecEncryptionKey = 55665;
  var kCharStringsEncryptionKey = 4330;

  function decrypt(stream, key, discardNumber) {
    var r = key, c1 = 52845, c2 = 22719;
    var decryptedString = [];

    var value = '';
    var count = stream.length;
    for (var i = 0; i < count; i++) {
      value = stream[i];
      decryptedString[i] = value ^ (r >> 8);
      r = ((value + r) * c1 + c2) & ((1 << 16) - 1);
    }
    return decryptedString.slice(discardNumber);
  }

  /*
   * CharStrings are encoded following the the CharString Encoding sequence
   * describe in Chapter 6 of the "Adobe Type1 Font Format" specification.
   * The value in a byte indicates a command, a number, or subsequent bytes
   * that are to be interpreted in a special way.
   *
   * CharString Number Encoding:
   *  A CharString byte containing the values from 32 through 255 inclusive
   *  indicate an integer. These values are decoded in four ranges.
   *
   * 1. A CharString byte containing a value, v, between 32 and 246 inclusive,
   * indicate the integer v - 139. Thus, the integer values from -107 through
   * 107 inclusive may be encoded in single byte.
   *
   * 2. A CharString byte containing a value, v, between 247 and 250 inclusive,
   * indicates an integer involving the next byte, w, according to the formula:
   * [(v - 247) x 256] + w + 108
   *
   * 3. A CharString byte containing a value, v, between 251 and 254 inclusive,
   * indicates an integer involving the next byte, w, according to the formula:
   * -[(v - 251) * 256] - w - 108
   *
   * 4. A CharString containing the value 255 indicates that the next 4 bytes
   * are a two complement signed integer. The first of these bytes contains the
   * highest order bits, the second byte contains the next higher order bits
   * and the fourth byte contain the lowest order bits.
   *
   *
   * CharString Command Encoding:
   *  CharStrings commands are encoded in 1 or 2 bytes.
   *
   *  Single byte commands are encoded in 1 byte that contains a value between
   *  0 and 31 inclusive.
   *  If a command byte contains the value 12, then the value in the next byte
   *  indicates a command. This "escape" mechanism allows many extra commands
   * to be encoded and this encoding technique helps to minimize the length of
   * the charStrings.
   */
  var charStringDictionary = {
    '1': 'hstem',
    '3': 'vstem',
    '4': 'vmoveto',
    '5': 'rlineto',
    '6': 'hlineto',
    '7': 'vlineto',
    '8': 'rrcurveto',

    // closepath is a Type1 command that do not take argument and is useless
    // in Type2 and it can simply be ignored.
    '9': null, // closepath

    '10': 'callsubr',

    // return is normally used inside sub-routines to tells to the execution
    // flow that it can be back to normal.
    // During the translation process Type1 charstrings will be flattened and
    // sub-routines will be embedded directly into the charstring directly, so
    // this can be ignored safely.
    '11': 'return',

    '12': {
      // dotsection is a Type1 command to specify some hinting feature for dots
      // that do not take a parameter and it can safely be ignored for Type2.
      '0': null, // dotsection

      // [vh]stem3 are Type1 only and Type2 supports [vh]stem with multiple
      // parameters, so instead of returning [vh]stem3 take a shortcut and
      // return [vhstem] instead.
      '1': 'vstem',
      '2': 'hstem',

      // Type1 only command with command not (yet) built-in ,throw an error
      '6': -1, // seac
      '7': -1, // sbw

      '11': 'sub',
      '12': 'div',

      // callothersubr is a mechanism to make calls on the postscript
      // interpreter, this is not supported by Type2 charstring but hopefully
      // most of the default commands can be ignored safely.
      '16': 'callothersubr',

      '17': 'pop',

      // setcurrentpoint sets the current point to x, y without performing a
      // moveto (this is a one shot positionning command). This is used only
      // with the return of an OtherSubrs call.
      // TODO Implement the OtherSubrs charstring embedding and replace this
      // call by a no-op, like 2 'pop' commands for example.
      '33': null // setcurrentpoint
    },
    '13': 'hsbw',
    '14': 'endchar',
    '21': 'rmoveto',
    '22': 'hmoveto',
    '30': 'vhcurveto',
    '31': 'hvcurveto'
  };

  var kEscapeCommand = 12;

  function decodeCharString(array) {
    var charstring = [];
    var lsb = 0;
    var width = 0;
    var flexState = 0;

    var value = '';
    var count = array.length;
    for (var i = 0; i < count; i++) {
      value = array[i];

      if (value < 32) {
        var command = null;
        if (value == kEscapeCommand) {
          var escape = array[++i];

          // TODO Clean this code
          if (escape == 16) {
            var index = charstring.pop();
            var argc = charstring.pop();
            for (var j = 0; j < argc; j++)
              charstring.push('drop');

            // If the flex mechanism is not used in a font program, Adobe
            // states that entries 0, 1 and 2 can simply be replaced by
            // {}, which means that we can simply ignore them.
            if (index < 3) {
              continue;
            }

            // This is the same things about hint replacement, if it is not used
            // entry 3 can be replaced by {3}
            // TODO support hint replacment
            if (index == 3) {
              charstring.push(3);
              i++;
              continue;
            }
          } else if (escape == 17 || escape == 33) {
            // pop or setcurrentpoint commands can be ignored
            // since we are not doing callothersubr
            continue;
          } else if (!kHintingEnabled && (escape == 1 || escape == 2)) {
            charstring.push('drop', 'drop', 'drop', 'drop', 'drop', 'drop');
            continue;
          }

          command = charStringDictionary['12'][escape];
        } else {
          // TODO Clean this code
          if (value == 13) { // hsbw
            if (charstring.length == 2) {
              lsb = charstring[0];
              width = charstring[1];
              charstring.splice(0, 1);
            } else if (charstring.length == 4 && charstring[3] == 'div') {
              lsb = charstring[0];
              width = charstring[1] / charstring[2];
              charstring.splice(0, 1);
            } else if (charstring.length == 4 && charstring[2] == 'div') {
              lsb = charstring[0] / charstring[1];
              width = charstring[3];
              charstring.splice(0, 3);
            } else {
              error('Unsupported hsbw format: ' + charstring);
            }

            charstring.push(lsb, 'hmoveto');
            continue;
          } else if (value == 10) { // callsubr
            if (charstring[charstring.length - 1] < 3) { // subr #0..2
              var subrNumber = charstring.pop();
              switch (subrNumber) {
                case 1:
                  flexState = 1; // prepare for flex coordinates
                  break;
                case 2:
                  flexState = 2; // flex in progress
                  break;
                case 0:
                  // type2 flex command does not need final coords
                  charstring.push('exch', 'drop', 'exch', 'drop');
                  charstring.push('flex');
                  flexState = 0;
                  break;
              }
              continue;
            }
          } else if (value == 21 && flexState > 0) {
            if (flexState > 1)
              continue; // ignoring rmoveto
            value = 5; // first segment replacing with rlineto
          } else if (!kHintingEnabled && (value == 1 || value == 3)) {
            charstring.push('drop', 'drop');
            continue;
          }
          command = charStringDictionary[value];
        }

        // Some charstring commands are meaningless in Type2 and will return
        // a null, let's just ignored them
        if (!command && i < count) {
          continue;
        } else if (!command) {
          break;
        } else if (command == -1) {
          warn('Support for Type1 command ' + value +
                ' (' + escape + ') is not implemented in charstring: ' +
                charstring);
          if (value == 12) {
            // we know how to ignore only some the Type1 commands
            switch (escape) {
              case 7:
                charstring.push('drop', 'drop', 'drop', 'drop');
                continue;
              case 8:
                charstring.push('drop');
                continue;
            }
          }
        }

        value = command;
      } else if (value <= 246) {
        value = value - 139;
      } else if (value <= 250) {
        value = ((value - 247) * 256) + array[++i] + 108;
      } else if (value <= 254) {
        value = -((value - 251) * 256) - array[++i] - 108;
      } else {
        value = (array[++i] & 0xff) << 24 | (array[++i] & 0xff) << 16 |
                (array[++i] & 0xff) << 8 | (array[++i] & 0xff) << 0;
      }

      charstring.push(value);
    }

    return { charstring: charstring, width: width, lsb: lsb };
  }

  /*
   * Returns an object containing a Subrs array and a CharStrings
   * array extracted from and eexec encrypted block of data
   */
  function readNumberArray(str, index) {
    var start = index;
    while (str[index++] != '[')
      start++;
    start++;

    var count = 0;
    while (str[index++] != ']')
      count++;

    var array = str.substr(start, count).split(' ');
    for (var i = 0, ii = array.length; i < ii; i++)
      array[i] = parseFloat(array[i] || 0);
    return array;
  }

  function readNumber(str, index) {
    while (str[index] == ' ')
      index++;

    var start = index;

    var count = 0;
    while (str[index++] != ' ')
      count++;

    return parseFloat(str.substr(start, count) || 0);
  }

  function isSeparator(c) {
    return c == ' ' || c == '\n' || c == '\x0d';
  }

  this.extractFontProgram = function t1_extractFontProgram(stream) {
    var eexec = decrypt(stream, kEexecEncryptionKey, 4);
    var eexecStr = '';
    for (var i = 0, ii = eexec.length; i < ii; i++)
      eexecStr += String.fromCharCode(eexec[i]);

    var glyphsSection = false, subrsSection = false;
    var program = {
      subrs: [],
      charstrings: [],
      properties: {
        'private': {
          'lenIV': 4
        }
      }
    };

    var glyph = '';
    var token = '';
    var length = 0;

    var c = '';
    var count = eexecStr.length;
    for (var i = 0; i < count; i++) {
      var getToken = function getToken() {
        while (i < count && isSeparator(eexecStr[i]))
          ++i;

        var token = '';
        while (i < count && !isSeparator(eexecStr[i]))
          token += eexecStr[i++];

        return token;
      };
      var c = eexecStr[i];

      if ((glyphsSection || subrsSection) &&
          (token == 'RD' || token == '-|')) {
        i++;
        var data = eexec.slice(i, i + length);
        var lenIV = program.properties.private['lenIV'];
        var encoded = decrypt(data, kCharStringsEncryptionKey, lenIV);
        var str = decodeCharString(encoded);

        if (glyphsSection) {
          program.charstrings.push({
            glyph: glyph,
            data: str.charstring,
            lsb: str.lsb,
            width: str.width
          });
        } else {
          program.subrs.push(str.charstring);
        }
        i += length;
        token = '';
      } else if (isSeparator(c)) {
        length = parseInt(token, 10);
        token = '';
      } else {
        token += c;
        if (!glyphsSection) {
          switch (token) {
            case '/CharString':
              glyphsSection = true;
              break;
            case '/Subrs':
              ++i;
              var num = parseInt(getToken(), 10);
              getToken(); // read in 'array'
              for (var j = 0; j < num; ++j) {
                var t = getToken(); // read in 'dup'
                if (t == 'ND' || t == '|-' || t == 'noaccess')
                  break;
                var index = parseInt(getToken(), 10);
                if (index > j)
                  j = index;
                var length = parseInt(getToken(), 10);
                getToken(); // read in 'RD'
                var data = eexec.slice(i + 1, i + 1 + length);
                var lenIV = program.properties.private['lenIV'];
                var encoded = decrypt(data, kCharStringsEncryptionKey, lenIV);
                var str = decodeCharString(encoded);
                i = i + 1 + length;
                t = getToken(); // read in 'NP'
                if (t == 'noaccess')
                  getToken(); // read in 'put'
                program.subrs[index] = str.charstring;
              }
              break;
            case '/BlueValues':
            case '/OtherBlues':
            case '/FamilyBlues':
            case '/FamilyOtherBlues':
            case '/StemSnapH':
            case '/StemSnapV':
              program.properties.private[token.substring(1)] =
                readNumberArray(eexecStr, i + 1);
              break;
            case '/StdHW':
            case '/StdVW':
              program.properties.private[token.substring(1)] =
                readNumberArray(eexecStr, i + 2)[0];
              break;
            case '/BlueShift':
            case '/lenIV':
            case '/BlueFuzz':
            case '/BlueScale':
            case '/LanguageGroup':
            case '/ExpansionFactor':
              program.properties.private[token.substring(1)] =
                readNumber(eexecStr, i + 1);
              break;
          }
        } else if (c == '/') {
          token = glyph = '';
          while ((c = eexecStr[++i]) != ' ')
            glyph += c;
        }
      }
    }

    return program;
  };

  this.extractFontHeader = function t1_extractFontHeader(stream, properties) {
    var headerString = '';
    for (var i = 0, ii = stream.length; i < ii; i++)
      headerString += String.fromCharCode(stream[i]);

    var token = '';
    var count = headerString.length;
    for (var i = 0; i < count; i++) {
      var getToken = function getToken() {
        var char = headerString[i];
        while (i < count && (isSeparator(char) || char == '/'))
          char = headerString[++i];

        var token = '';
        while (i < count && !(isSeparator(char) || char == '/')) {
          token += char;
          char = headerString[++i];
        }

        return token;
      };

      var c = headerString[i];
      if (isSeparator(c)) {
        switch (token) {
          case '/FontMatrix':
            var matrix = readNumberArray(headerString, i + 1);

            // The FontMatrix is in unitPerEm, so make it pixels
            for (var j = 0, jj = matrix.length; j < jj; j++)
              matrix[j] *= 1000;

            // Make the angle into the right direction
            matrix[2] *= -1;

            properties.fontMatrix = matrix;
            break;
          case '/Encoding':
            var encodingArg = getToken();
            var encoding;
            if (!/^\d+$/.test(encodingArg)) {
              // encoding name is specified
              encoding = Encodings[encodingArg];
            } else {
              encoding = [];
              var size = parseInt(encodingArg, 10);
              getToken(); // read in 'array'

              for (var j = 0; j < size; j++) {
                var token = getToken();
                if (token == 'dup') {
                  var index = parseInt(getToken(), 10);
                  var glyph = getToken();
                  encoding[index] = glyph;
                  getToken(); // read the in 'put'
                }
              }
            }
            if (!properties.hasEncoding && encoding) {
              properties.baseEncoding = encoding;
              break;
            }
            break;
        }
        token = '';
      } else {
        token += c;
      }
    }
  };
};

/**
 * The CFF class takes a Type1 file and wrap it into a
 * 'Compact Font Format' which itself embed Type2 charstrings.
 */
var CFFStrings = [
  '.notdef', 'space', 'exclam', 'quotedbl', 'numbersign', 'dollar', 'percent',
  'ampersand', 'quoteright', 'parenleft', 'parenright', 'asterisk', 'plus',
  'comma', 'hyphen', 'period', 'slash', 'zero', 'one', 'two', 'three', 'four',
  'five', 'six', 'seven', 'eight', 'nine', 'colon', 'semicolon', 'less',
  'equal', 'greater', 'question', 'at', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W',
  'X', 'Y', 'Z', 'bracketleft', 'backslash', 'bracketright', 'asciicircum',
  'underscore', 'quoteleft', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
  'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y',
  'z', 'braceleft', 'bar', 'braceright', 'asciitilde', 'exclamdown', 'cent',
  'sterling', 'fraction', 'yen', 'florin', 'section', 'currency',
  'quotesingle', 'quotedblleft', 'guillemotleft', 'guilsinglleft',
  'guilsinglright', 'fi', 'fl', 'endash', 'dagger', 'daggerdbl',
  'periodcentered', 'paragraph', 'bullet', 'quotesinglbase', 'quotedblbase',
  'quotedblright', 'guillemotright', 'ellipsis', 'perthousand', 'questiondown',
  'grave', 'acute', 'circumflex', 'tilde', 'macron', 'breve', 'dotaccent',
  'dieresis', 'ring', 'cedilla', 'hungarumlaut', 'ogonek', 'caron', 'emdash',
  'AE', 'ordfeminine', 'Lslash', 'Oslash', 'OE', 'ordmasculine', 'ae',
  'dotlessi', 'lslash', 'oslash', 'oe', 'germandbls', 'onesuperior',
  'logicalnot', 'mu', 'trademark', 'Eth', 'onehalf', 'plusminus', 'Thorn',
  'onequarter', 'divide', 'brokenbar', 'degree', 'thorn', 'threequarters',
  'twosuperior', 'registered', 'minus', 'eth', 'multiply', 'threesuperior',
  'copyright', 'Aacute', 'Acircumflex', 'Adieresis', 'Agrave', 'Aring',
  'Atilde', 'Ccedilla', 'Eacute', 'Ecircumflex', 'Edieresis', 'Egrave',
  'Iacute', 'Icircumflex', 'Idieresis', 'Igrave', 'Ntilde', 'Oacute',
  'Ocircumflex', 'Odieresis', 'Ograve', 'Otilde', 'Scaron', 'Uacute',
  'Ucircumflex', 'Udieresis', 'Ugrave', 'Yacute', 'Ydieresis', 'Zcaron',
  'aacute', 'acircumflex', 'adieresis', 'agrave', 'aring', 'atilde',
  'ccedilla', 'eacute', 'ecircumflex', 'edieresis', 'egrave', 'iacute',
  'icircumflex', 'idieresis', 'igrave', 'ntilde', 'oacute', 'ocircumflex',
  'odieresis', 'ograve', 'otilde', 'scaron', 'uacute', 'ucircumflex',
  'udieresis', 'ugrave', 'yacute', 'ydieresis', 'zcaron', 'exclamsmall',
  'Hungarumlautsmall', 'dollaroldstyle', 'dollarsuperior', 'ampersandsmall',
  'Acutesmall', 'parenleftsuperior', 'parenrightsuperior', '266 ff',
  'onedotenleader', 'zerooldstyle', 'oneoldstyle', 'twooldstyle',
  'threeoldstyle', 'fouroldstyle', 'fiveoldstyle', 'sixoldstyle',
  'sevenoldstyle', 'eightoldstyle', 'nineoldstyle', 'commasuperior',
  'threequartersemdash', 'periodsuperior', 'questionsmall', 'asuperior',
  'bsuperior', 'centsuperior', 'dsuperior', 'esuperior', 'isuperior',
  'lsuperior', 'msuperior', 'nsuperior', 'osuperior', 'rsuperior', 'ssuperior',
  'tsuperior', 'ff', 'ffi', 'ffl', 'parenleftinferior', 'parenrightinferior',
  'Circumflexsmall', 'hyphensuperior', 'Gravesmall', 'Asmall', 'Bsmall',
  'Csmall', 'Dsmall', 'Esmall', 'Fsmall', 'Gsmall', 'Hsmall', 'Ismall',
  'Jsmall', 'Ksmall', 'Lsmall', 'Msmall', 'Nsmall', 'Osmall', 'Psmall',
  'Qsmall', 'Rsmall', 'Ssmall', 'Tsmall', 'Usmall', 'Vsmall', 'Wsmall',
  'Xsmall', 'Ysmall', 'Zsmall', 'colonmonetary', 'onefitted', 'rupiah',
  'Tildesmall', 'exclamdownsmall', 'centoldstyle', 'Lslashsmall',
  'Scaronsmall', 'Zcaronsmall', 'Dieresissmall', 'Brevesmall', 'Caronsmall',
  'Dotaccentsmall', 'Macronsmall', 'figuredash', 'hypheninferior',
  'Ogoneksmall', 'Ringsmall', 'Cedillasmall', 'questiondownsmall', 'oneeighth',
  'threeeighths', 'fiveeighths', 'seveneighths', 'onethird', 'twothirds',
  'zerosuperior', 'foursuperior', 'fivesuperior', 'sixsuperior',
  'sevensuperior', 'eightsuperior', 'ninesuperior', 'zeroinferior',
  'oneinferior', 'twoinferior', 'threeinferior', 'fourinferior',
  'fiveinferior', 'sixinferior', 'seveninferior', 'eightinferior',
  'nineinferior', 'centinferior', 'dollarinferior', 'periodinferior',
  'commainferior', 'Agravesmall', 'Aacutesmall', 'Acircumflexsmall',
  'Atildesmall', 'Adieresissmall', 'Aringsmall', 'AEsmall', 'Ccedillasmall',
  'Egravesmall', 'Eacutesmall', 'Ecircumflexsmall', 'Edieresissmall',
  'Igravesmall', 'Iacutesmall', 'Icircumflexsmall', 'Idieresissmall',
  'Ethsmall', 'Ntildesmall', 'Ogravesmall', 'Oacutesmall', 'Ocircumflexsmall',
  'Otildesmall', 'Odieresissmall', 'OEsmall', 'Oslashsmall', 'Ugravesmall',
  'Uacutesmall', 'Ucircumflexsmall', 'Udieresissmall', 'Yacutesmall',
  'Thornsmall', 'Ydieresissmall', '001.000', '001.001', '001.002', '001.003',
  'Black', 'Bold', 'Book', 'Light', 'Medium', 'Regular', 'Roman', 'Semibold'
];

var type1Parser = new Type1Parser();

var CFF = function cffCFF(name, file, properties) {
  // Get the data block containing glyphs and subrs informations
  var headerBlock = file.getBytes(properties.length1);
  type1Parser.extractFontHeader(headerBlock, properties);

  // Decrypt the data blocks and retrieve it's content
  var eexecBlock = file.getBytes(properties.length2);
  var data = type1Parser.extractFontProgram(eexecBlock);
  for (var info in data.properties)
    properties[info] = data.properties[info];

  var charstrings = this.getOrderedCharStrings(data.charstrings, properties);
  var type2Charstrings = this.getType2Charstrings(charstrings);
  var subrs = this.getType2Subrs(data.subrs);

  this.charstrings = charstrings;
  this.data = this.wrap(name, type2Charstrings, this.charstrings,
                        subrs, properties);
};

CFF.prototype = {
  createCFFIndexHeader: function cff_createCFFIndexHeader(objects, isByte) {
    // First 2 bytes contains the number of objects contained into this index
    var count = objects.length;

    // If there is no object, just create an array saying that with another
    // offset byte.
    if (count == 0)
      return '\x00\x00\x00';

    var data = String.fromCharCode((count >> 8) & 0xFF, count & 0xff);

    // Next byte contains the offset size use to reference object in the file
    // Actually we're using 0x04 to be sure to be able to store everything
    // without thinking of it while coding.
    data += '\x04';

    // Add another offset after this one because we need a new offset
    var relativeOffset = 1;
    for (var i = 0; i < count + 1; i++) {
      data += String.fromCharCode((relativeOffset >>> 24) & 0xFF,
                                  (relativeOffset >> 16) & 0xFF,
                                  (relativeOffset >> 8) & 0xFF,
                                  relativeOffset & 0xFF);

      if (objects[i])
        relativeOffset += objects[i].length;
    }

    for (var i = 0; i < count; i++) {
      for (var j = 0, jj = objects[i].length; j < jj; j++)
        data += isByte ? String.fromCharCode(objects[i][j] & 0xFF) :
                objects[i][j];
    }
    return data;
  },

  encodeNumber: function cff_encodeNumber(value) {
    // some of the fonts has ouf-of-range values
    // they are just arithmetic overflows
    // make sanitizer happy
    value |= 0;
    if (value >= -32768 && value <= 32767) {
      return '\x1c' +
             String.fromCharCode((value >> 8) & 0xFF) +
             String.fromCharCode(value & 0xFF);
    } else {
      return '\x1d' +
             String.fromCharCode((value >> 24) & 0xFF) +
             String.fromCharCode((value >> 16) & 0xFF) +
             String.fromCharCode((value >> 8) & 0xFF) +
             String.fromCharCode(value & 0xFF);
    }
  },

  getOrderedCharStrings: function cff_getOrderedCharStrings(glyphs,
                                                            properties) {
    var charstrings = [];
    var reverseMapping = {};
    var encoding = properties.baseEncoding;
    var i, length, glyphName;
    for (i = 0, length = encoding.length; i < length; ++i) {
      glyphName = encoding[i];
      if (!glyphName || isSpecialUnicode(i))
        continue;
      reverseMapping[glyphName] = i;
    }
    reverseMapping['.notdef'] = 0;
    var unusedUnicode = kCmapGlyphOffset;
    for (i = 0, length = glyphs.length; i < length; i++) {
      var item = glyphs[i];
      var glyphName = item.glyph;
      var unicode = glyphName in reverseMapping ?
        reverseMapping[glyphName] : unusedUnicode++;
      charstrings.push({
        glyph: glyphName,
        unicode: unicode,
        gid: i,
        charstring: item.data,
        width: item.width,
        lsb: item.lsb
      });
    }

    charstrings.sort(function charstrings_sort(a, b) {
      return a.unicode - b.unicode;
    });
    return charstrings;
  },

  getType2Charstrings: function cff_getType2Charstrings(type1Charstrings) {
    var type2Charstrings = [];
    var count = type1Charstrings.length;
    for (var i = 0; i < count; i++) {
      var charstring = type1Charstrings[i].charstring;
      type2Charstrings.push(this.flattenCharstring(charstring.slice(),
                                                   this.commandsMap));
    }
    return type2Charstrings;
  },

  getType2Subrs: function cff_getType2Subrs(type1Subrs) {
    var bias = 0;
    var count = type1Subrs.length;
    if (count < 1240)
      bias = 107;
    else if (count < 33900)
      bias = 1131;
    else
      bias = 32768;

    // Add a bunch of empty subrs to deal with the Type2 bias
    var type2Subrs = [];
    for (var i = 0; i < bias; i++)
      type2Subrs.push([0x0B]);

    for (var i = 0; i < count; i++) {
      var subr = type1Subrs[i];
      if (!subr)
        subr = [0x0B];

      type2Subrs.push(this.flattenCharstring(subr, this.commandsMap));
    }

    return type2Subrs;
  },

  /*
   * Flatten the commands by interpreting the postscript code and replacing
   * every 'callsubr', 'callothersubr' by the real commands.
   */
  commandsMap: {
    'hstem': 1,
    'vstem': 3,
    'vmoveto': 4,
    'rlineto': 5,
    'hlineto': 6,
    'vlineto': 7,
    'rrcurveto': 8,
    'callsubr': 10,
    'return': 11,
    'sub': [12, 11],
    'div': [12, 12],
    'exch': [12, 28],
    'flex': [12, 35],
    'drop' : [12, 18],
    'endchar': 14,
    'rmoveto': 21,
    'hmoveto': 22,
    'vhcurveto': 30,
    'hvcurveto': 31
  },

  flattenCharstring: function flattenCharstring(charstring, map) {
    // charstring changes size - can't cache .length in loop
    for (var i = 0; i < charstring.length; i++) {
      var command = charstring[i];
      if (command.charAt) {
        var cmd = map[command];
        assert(cmd, 'Unknow command: ' + command);

        if (isArray(cmd))
          charstring.splice(i++, 1, cmd[0], cmd[1]);
        else
          charstring[i] = cmd;
      } else {
        // Type1 charstring use a division for number above 32000
        if (command > 32000) {
          var divisor = charstring[i + 1];
          command /= divisor;
          charstring.splice(i, 3, 28, command >> 8, command & 0xff);
        } else {
          charstring.splice(i, 1, 28, command >> 8, command & 0xff);
        }
        i += 2;
      }
    }
    return charstring;
  },

  wrap: function wrap(name, glyphs, charstrings, subrs, properties) {
    var fields = {
      // major version, minor version, header size, offset size
      'header': '\x01\x00\x04\x04',

      'names': this.createCFFIndexHeader([name]),

      'topDict': (function topDict(self) {
        return function cffWrapTopDict() {
          var header = '\x00\x01\x01\x01';
          var dict =
              '\xf8\x1b\x00' + // version
              '\xf8\x1c\x01' + // Notice
              '\xf8\x1d\x02' + // FullName
              '\xf8\x1e\x03' + // FamilyName
              '\xf8\x1f\x04' +  // Weight
              '\x1c\x00\x00\x10'; // Encoding

          var boundingBox = properties.bbox;
          for (var i = 0, ii = boundingBox.length; i < ii; i++)
            dict += self.encodeNumber(boundingBox[i]);
          dict += '\x05'; // FontBBox;

          var offset = fields.header.length +
                       fields.names.length +
                       (header.length + 1) +
                       (dict.length + (4 + 4)) +
                       fields.strings.length +
                       fields.globalSubrs.length;

          // If the offset if over 32767, encodeNumber is going to return
          // 5 bytes to encode the position instead of 3.
          if ((offset + fields.charstrings.length) > 32767) {
            offset += 9;
          } else {
            offset += 7;
          }

          dict += self.encodeNumber(offset) + '\x0f'; // Charset

          offset = offset + (glyphs.length * 2) + 1;
          dict += self.encodeNumber(offset) + '\x11'; // Charstrings

          offset = offset + fields.charstrings.length;
          dict += self.encodeNumber(fields.private.length);
          dict += self.encodeNumber(offset) + '\x12'; // Private

          return header + String.fromCharCode(dict.length + 1) + dict;
        };
      })(this),

      'strings': (function strings(self) {
        var strings = [
          'Version 0.11',         // Version
          'See original notice',  // Notice
          name,                   // FullName
          name,                   // FamilyName
          'Medium'                // Weight
        ];
        return self.createCFFIndexHeader(strings);
      })(this),

      'globalSubrs': this.createCFFIndexHeader([]),

      'charset': (function charset(self) {
        var charsetString = '\x00'; // Encoding

        var count = glyphs.length;
        for (var i = 0; i < count; i++) {
          var index = CFFStrings.indexOf(charstrings[i].glyph);
          // Some characters like asterikmath && circlecopyrt are
          // missing from the original strings, for the moment let's
          // map them to .notdef and see later if it cause any
          // problems
          if (index == -1)
            index = 0;

          charsetString += String.fromCharCode(index >> 8, index & 0xff);
        }
        return charsetString;
      })(this),

      'charstrings': this.createCFFIndexHeader([[0x8B, 0x0E]].concat(glyphs),
                                               true),

      'private': (function cffWrapPrivate(self) {
        var data =
            '\x8b\x14' + // defaultWidth
            '\x8b\x15';  // nominalWidth
        var fieldMap = {
          BlueValues: '\x06',
          OtherBlues: '\x07',
          FamilyBlues: '\x08',
          FamilyOtherBlues: '\x09',
          StemSnapH: '\x0c\x0c',
          StemSnapV: '\x0c\x0d',
          BlueShift: '\x0c\x0a',
          BlueFuzz: '\x0c\x0b',
          BlueScale: '\x0c\x09',
          LanguageGroup: '\x0c\x11',
          ExpansionFactor: '\x0c\x18'
        };
        for (var field in fieldMap) {
          if (!properties.private.hasOwnProperty(field))
            continue;
          var value = properties.private[field];

          if (isArray(value)) {
            data += self.encodeNumber(value[0]);
            for (var i = 1, ii = value.length; i < ii; i++)
              data += self.encodeNumber(value[i] - value[i - 1]);
          } else {
            data += self.encodeNumber(value);
          }
          data += fieldMap[field];
        }

        data += self.encodeNumber(data.length + 4) + '\x13'; // Subrs offset

        return data;
      })(this),

      'localSubrs': this.createCFFIndexHeader(subrs, true)
    };
    fields.topDict = fields.topDict();


    var cff = [];
    for (var index in fields) {
      var field = fields[index];
      for (var i = 0, ii = field.length; i < ii; i++)
        cff.push(field.charCodeAt(i));
    }

    return cff;
  }
};

var Type2CFF = (function type2CFF() {
  // TODO: replace parsing code with the Type2Parser in font_utils.js
  function constructor(file, properties) {
    var bytes = file.getBytes();
    this.bytes = bytes;
    this.properties = properties;

    this.data = this.parse();
  }

  constructor.prototype = {
    parse: function cff_parse() {
      var header = this.parseHeader();
      var properties = this.properties;
      var nameIndex = this.parseIndex(header.endPos);

      var dictIndex = this.parseIndex(nameIndex.endPos);
      if (dictIndex.length != 1)
        error('CFF contains more than 1 font');

      var stringIndex = this.parseIndex(dictIndex.endPos);
      var gsubrIndex = this.parseIndex(stringIndex.endPos);

      var strings = this.getStrings(stringIndex);

      var baseDict = this.parseDict(dictIndex.get(0).data);
      var topDict = this.getTopDict(baseDict, strings);

      var bytes = this.bytes;

      var privateDict = {};
      var privateInfo = topDict.Private;
      if (privateInfo) {
        var privOffset = privateInfo[1], privLength = privateInfo[0];
        var privBytes = bytes.subarray(privOffset, privOffset + privLength);
        baseDict = this.parseDict(privBytes);
        privateDict = this.getPrivDict(baseDict, strings);
      } else {
        privateDict.defaultWidthX = properties.defaultWidth;
      }

      var charStrings = this.parseIndex(topDict.CharStrings);
      var charset = this.parseCharsets(topDict.charset,
                                       charStrings.length, strings);
      var encoding = this.parseEncoding(topDict.Encoding, properties,
                                             strings, charset);

      var charset, encoding;
      var isCIDFont = properties.subtype == 'CIDFontType0C';
      if (isCIDFont) {
        charset = [];
        charset.length = charStrings.length;
        encoding = this.parseCidMap(topDict.charset,
                                    charStrings.length);
      } else {
        charset = this.parseCharsets(topDict.charset,
                                     charStrings.length, strings);
        encoding = this.parseEncoding(topDict.Encoding, properties,
                                      strings, charset);
      }

      // The font sanitizer does not support CFF encoding with a
      // supplement, since the encoding is not really use to map
      // between gid to glyph, let's overwrite what is declared in
      // the top dictionary to let the sanitizer think the font use
      // StandardEncoding, that's a lie but that's ok.
      if (encoding.hasSupplement)
        bytes[topDict.Encoding] &= 0x7F;

      // The CFF specification state that the 'dotsection' command
      // (12, 0) is deprecated and treated as a no-op, but all Type2
      // charstrings processors should support them. Unfortunately
      // the font sanitizer don't. As a workaround the sequence (12, 0)
      // is replaced by a useless (0, hmoveto).
      var count = charStrings.length;
      for (var i = 0; i < count; i++) {
        var charstring = charStrings.get(i);

        var start = charstring.start;
        var data = charstring.data;
        var length = data.length;
        for (var j = 0; j <= length; j) {
          var value = data[j++];
          if (value == 12 && data[j++] == 0) {
              bytes[start + j - 2] = 139;
              bytes[start + j - 1] = 22;
          } else if (value === 28) {
            j += 2;
          } else if (value >= 247 && value <= 254) {
            j++;
          } else if (value == 255) {
            j += 4;
          }
        }
      }

      // charstrings contains info about glyphs (one element per glyph
      // containing mappings for {unicode, width})
      var charstrings = this.getCharStrings(charset, encoding.encoding,
                                            privateDict, this.properties);

      // create the mapping between charstring and glyph id
      var glyphIds = [];
      for (var i = 0, ii = charstrings.length; i < ii; i++)
        glyphIds.push(charstrings[i].gid);

      this.charstrings = charstrings;
      this.glyphIds = glyphIds;

      var data = [];
      for (var i = 0, ii = bytes.length; i < ii; ++i)
        data.push(bytes[i]);
      return data;
    },

    getCharStrings: function cff_charstrings(charsets, encoding,
                                             privateDict, properties) {
      var charstrings = [];
      var unicodeUsed = [];
      var unassignedUnicodeItems = [];
      for (var i = 0, ii = charsets.length; i < ii; i++) {
        var glyph = charsets[i];
        var encodingFound = false;
        for (var charcode in encoding) {
          if (encoding[charcode] == i) {
            var code = charcode | 0;
            charstrings.push({
              unicode: adaptUnicode(code),
              code: code,
              gid: i,
              glyph: glyph
            });
            unicodeUsed[code] = true;
            encodingFound = true;
            break;
          }
        }
        if (!encodingFound) {
          unassignedUnicodeItems.push(i);
        }
      }

      var nextUnusedUnicode = 0x21;
      for (var j = 0, jj = unassignedUnicodeItems.length; j < jj; ++j) {
        var i = unassignedUnicodeItems[j];
        // giving unicode value anyway
        while (unicodeUsed[nextUnusedUnicode])
          nextUnusedUnicode++;
        var code = nextUnusedUnicode++;
        charstrings.push({
          unicode: adaptUnicode(code),
          code: code,
          gid: i,
          glyph: charsets[i]
        });
      }

      // sort the array by the unicode value (again)
      charstrings.sort(function type2CFFGetCharStringsSort(a, b) {
        return a.unicode - b.unicode;
      });
      return charstrings;
    },

    parseEncoding: function cff_parseencoding(pos, properties, strings,
                                              charset) {
      var encoding = {};
      var bytes = this.bytes;
      var result = {
        encoding: encoding,
        hasSupplement: false
      };

      function readSupplement() {
        var supplementsCount = bytes[pos++];
        for (var i = 0; i < supplementsCount; i++) {
          var code = bytes[pos++];
          var sid = (bytes[pos++] << 8) + (bytes[pos++] & 0xff);
          encoding[code] = properties.differences.indexOf(strings[sid]);
        }
      }

      if (pos == 0 || pos == 1) {
        var gid = 1;
        var baseEncoding = pos ? Encodings.ExpertEncoding :
                                 Encodings.StandardEncoding;
        for (var i = 0, ii = charset.length; i < ii; i++) {
          var index = baseEncoding.indexOf(charset[i]);
          if (index != -1)
            encoding[index] = gid++;
        }
      } else {
        var format = bytes[pos++];
        switch (format & 0x7f) {
          case 0:
            var glyphsCount = bytes[pos++];
            for (var i = 1; i <= glyphsCount; i++)
              encoding[bytes[pos++]] = i;
            break;

          case 1:
            var rangesCount = bytes[pos++];
            var gid = 1;
            for (var i = 0; i < rangesCount; i++) {
              var start = bytes[pos++];
              var left = bytes[pos++];
              for (var j = start; j <= start + left; j++)
                encoding[j] = gid++;
            }
            break;

          default:
            error('Unknow encoding format: ' + format + ' in CFF');
            break;
        }
        if (format & 0x80) {
          readSupplement();
          result.hasSupplement = true;
        }
      }
      return result;
    },

    parseCharsets: function cff_parsecharsets(pos, length, strings) {
      if (pos == 0) {
        return ISOAdobeCharset.slice();
      } else if (pos == 1) {
        return ExpertCharset.slice();
      } else if (pos == 2) {
        return ExpertSubsetCharset.slice();
      }

      var bytes = this.bytes;
      var format = bytes[pos++];
      var charset = ['.notdef'];

      // subtract 1 for the .notdef glyph
      length -= 1;

      switch (format) {
        case 0:
          for (var i = 0; i < length; i++) {
            var sid = (bytes[pos++] << 8) | bytes[pos++];
            charset.push(strings[sid]);
          }
          break;
        case 1:
          while (charset.length <= length) {
            var sid = (bytes[pos++] << 8) | bytes[pos++];
            var count = bytes[pos++];
            for (var i = 0; i <= count; i++)
              charset.push(strings[sid++]);
          }
          break;
        case 2:
          while (charset.length <= length) {
            var sid = (bytes[pos++] << 8) | bytes[pos++];
            var count = (bytes[pos++] << 8) | bytes[pos++];
            for (var i = 0; i <= count; i++)
              charset.push(strings[sid++]);
          }
          break;
        default:
          error('Unknown charset format');
      }
      return charset;
    },

    parseCidMap: function cff_parsecharsets(pos, length) {
      var bytes = this.bytes;
      var format = bytes[pos++];

      var encoding = {};
      var map = {encoding: encoding};

      encoding[0] = 0;

      var gid = 1;
      switch (format) {
        case 0:
          while (gid < length) {
            var cid = (bytes[pos++] << 8) | bytes[pos++];
            encoding[cid] = gid++;
          }
          break;
        case 1:
          while (gid < length) {
            var cid = (bytes[pos++] << 8) | bytes[pos++];
            var count = bytes[pos++];
            for (var i = 0; i <= count; i++)
              encoding[cid++] = gid++;
          }
          break;
        case 2:
          while (gid < length) {
            var cid = (bytes[pos++] << 8) | bytes[pos++];
            var count = (bytes[pos++] << 8) | bytes[pos++];
            for (var i = 0; i <= count; i++)
              encoding[cid++] = gid++;
          }
          break;
        default:
          error('Unknown charset format');
      }
      return map;
    },

    getPrivDict: function cff_getprivdict(baseDict, strings) {
      var dict = {};

      // default values
      dict['defaultWidthX'] = 0;
      dict['nominalWidthX'] = 0;

      for (var i = 0, ii = baseDict.length; i < ii; ++i) {
        var pair = baseDict[i];
        var key = pair[0];
        var value = pair[1];
        switch (key) {
          case 20:
            dict['defaultWidthX'] = value[0];
          case 21:
            dict['nominalWidthX'] = value[0];
          default:
            TODO('interpret top dict key: ' + key);
        }
      }
      return dict;
    },
    getTopDict: function cff_gettopdict(baseDict, strings) {
      var dict = {};

      // default values
      dict['Encoding'] = 0;
      dict['charset'] = 0;

      for (var i = 0, ii = baseDict.length; i < ii; ++i) {
        var pair = baseDict[i];
        var key = pair[0];
        var value = pair[1];
        switch (key) {
          case 1:
            dict['Notice'] = strings[value[0]];
            break;
          case 4:
            dict['Weight'] = strings[value[0]];
            break;
          case 3094:
            dict['BaseFontName'] = strings[value[0]];
            break;
          case 5:
            dict['FontBBox'] = value;
            break;
          case 13:
            dict['UniqueID'] = value[0];
            break;
          case 15:
            dict['charset'] = value[0];
            break;
          case 16:
            dict['Encoding'] = value[0];
            break;
          case 17:
            dict['CharStrings'] = value[0];
            break;
          case 18:
            dict['Private'] = value;
            break;
          case 3102:
          case 3103:
          case 3104:
          case 3105:
          case 3106:
          case 3107:
          case 3108:
          case 3109:
          case 3110:
            dict['cidOperatorPresent'] = true;
            break;
          default:
            TODO('interpret top dict key');
        }
      }
      return dict;
    },
    getStrings: function cff_getStrings(stringIndex) {
      function bytesToString(bytesArray) {
        var str = '';
        for (var i = 0, ii = bytesArray.length; i < ii; i++)
          str += String.fromCharCode(bytesArray[i]);
        return str;
      }

      var stringArray = [];
      for (var i = 0, ii = CFFStrings.length; i < ii; i++)
        stringArray.push(CFFStrings[i]);

      for (var i = 0, ii = stringIndex.length; i < ii; i++)
        stringArray.push(bytesToString(stringIndex.get(i).data));

      return stringArray;
    },
    parseHeader: function cff_parseHeader() {
      var bytes = this.bytes;
      var offset = 0;

      while (bytes[offset] != 1)
        ++offset;

      if (offset != 0) {
        warning('cff data is shifted');
        bytes = bytes.subarray(offset);
        this.bytes = bytes;
      }

      return {
        endPos: bytes[2],
        offsetSize: bytes[3]
      };
    },
    parseDict: function cff_parseDict(dict) {
      var pos = 0;

      function parseOperand() {
        var value = dict[pos++];
        if (value === 30) {
          return parseFloatOperand(pos);
        } else if (value === 28) {
          value = dict[pos++];
          value = (value << 8) | dict[pos++];
          return value;
        } else if (value === 29) {
          value = dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          value = (value << 8) | dict[pos++];
          return value;
        } else if (value <= 246) {
          return value - 139;
        } else if (value <= 250) {
          return ((value - 247) * 256) + dict[pos++] + 108;
        } else if (value <= 254) {
          return -((value - 251) * 256) - dict[pos++] - 108;
        } else {
          error('255 is not a valid DICT command');
        }
        return -1;
      }

      function parseFloatOperand() {
        var str = '';
        var eof = 15;
        var lookup = ['0', '1', '2', '3', '4', '5', '6', '7', '8',
            '9', '.', 'E', 'E-', null, '-'];
        var length = dict.length;
        while (pos < length) {
          var b = dict[pos++];
          var b1 = b >> 4;
          var b2 = b & 15;

          if (b1 == eof)
            break;
          str += lookup[b1];

          if (b2 == eof)
            break;
          str += lookup[b2];
        }
        return parseFloat(str);
      }

      var operands = [];
      var entries = [];

      var pos = 0;
      var end = dict.length;
      while (pos < end) {
        var b = dict[pos];
        if (b <= 21) {
          if (b === 12) {
            ++pos;
            var op = dict[pos];
            if ((op > 14 && op < 17) ||
                (op > 23 && op < 30) || op > 38) {
              warn('Invalid CFF dictionary key: ' + op);
              // trying to replace it with initialRandomSeed
              // to pass sanitizer
              dict[pos] = 19;
            }
            var b = (b << 8) | op;
          }
          if (!operands.length && b == 8 &&
              dict[pos + 1] == 9) {
            // no operands for FamilyBlues, removing the key
            // and next one is FamilyOtherBlues - skipping them
            // also replacing FamilyBlues to pass sanitizer
            dict[pos] = 139;
            pos += 2;
            continue;
          }
          entries.push([b, operands]);
          operands = [];
          ++pos;
        } else {
          operands.push(parseOperand());
        }
      }
      return entries;
    },
    parseIndex: function cff_parseIndex(pos) {
      var bytes = this.bytes;
      var count = bytes[pos++] << 8 | bytes[pos++];
      var offsets = [];
      var end = pos;

      if (count != 0) {
        var offsetSize = bytes[pos++];
        // add 1 for offset to determine size of last object
        var startPos = pos + ((count + 1) * offsetSize) - 1;

        for (var i = 0, ii = count + 1; i < ii; ++i) {
          var offset = 0;
          for (var j = 0; j < offsetSize; ++j) {
            offset <<= 8;
            offset += bytes[pos++];
          }
          offsets.push(startPos + offset);
        }
        end = offsets[count];
      }

      return {
        get: function index_get(index) {
          if (index >= count)
            return null;

          var start = offsets[index];
          var end = offsets[index + 1];
          return {
            start: start,
            end: end,
            data: bytes.subarray(start, end)
          };
        },
        length: count,
        endPos: end
      };
    }
  };

  return constructor;
})();

