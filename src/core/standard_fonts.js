/* Copyright 2015 Mozilla Foundation
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

import { getLookupTableFactory } from '../shared/util';

/**
 * Hold a map of decoded fonts and of the standard fourteen Type1
 * fonts and their acronyms.
 */
var getStdFontMap = getLookupTableFactory(function (t) {
  t['ArialNarrow'] = 'Helvetica';
  t['ArialNarrow-Bold'] = 'Helvetica-Bold';
  t['ArialNarrow-BoldItalic'] = 'Helvetica-BoldOblique';
  t['ArialNarrow-Italic'] = 'Helvetica-Oblique';
  t['ArialBlack'] = 'Helvetica';
  t['ArialBlack-Bold'] = 'Helvetica-Bold';
  t['ArialBlack-BoldItalic'] = 'Helvetica-BoldOblique';
  t['ArialBlack-Italic'] = 'Helvetica-Oblique';
  t['Arial-Black'] = 'Helvetica';
  t['Arial-Black-Bold'] = 'Helvetica-Bold';
  t['Arial-Black-BoldItalic'] = 'Helvetica-BoldOblique';
  t['Arial-Black-Italic'] = 'Helvetica-Oblique';
  t['Arial'] = 'Helvetica';
  t['Arial-Bold'] = 'Helvetica-Bold';
  t['Arial-BoldItalic'] = 'Helvetica-BoldOblique';
  t['Arial-Italic'] = 'Helvetica-Oblique';
  t['Arial-BoldItalicMT'] = 'Helvetica-BoldOblique';
  t['Arial-BoldMT'] = 'Helvetica-Bold';
  t['Arial-ItalicMT'] = 'Helvetica-Oblique';
  t['ArialMT'] = 'Helvetica';
  t['Courier-Bold'] = 'Courier-Bold';
  t['Courier-BoldItalic'] = 'Courier-BoldOblique';
  t['Courier-Italic'] = 'Courier-Oblique';
  t['CourierNew'] = 'Courier';
  t['CourierNew-Bold'] = 'Courier-Bold';
  t['CourierNew-BoldItalic'] = 'Courier-BoldOblique';
  t['CourierNew-Italic'] = 'Courier-Oblique';
  t['CourierNewPS-BoldItalicMT'] = 'Courier-BoldOblique';
  t['CourierNewPS-BoldMT'] = 'Courier-Bold';
  t['CourierNewPS-ItalicMT'] = 'Courier-Oblique';
  t['CourierNewPSMT'] = 'Courier';
  t['Helvetica'] = 'Helvetica';
  t['Helvetica-Bold'] = 'Helvetica-Bold';
  t['Helvetica-BoldItalic'] = 'Helvetica-BoldOblique';
  t['Helvetica-BoldOblique'] = 'Helvetica-BoldOblique';
  t['Helvetica-Italic'] = 'Helvetica-Oblique';
  t['Helvetica-Oblique'] = 'Helvetica-Oblique';
  t['SegoeUISymbol'] = 'Helvetica';
  t['Symbol-Bold'] = 'Symbol';
  t['Symbol-BoldItalic'] = 'Symbol';
  t['Symbol-Italic'] = 'Symbol';
  t['TimesNewRoman'] = 'Times-Roman';
  t['TimesNewRoman-Bold'] = 'Times-Bold';
  t['TimesNewRoman-BoldItalic'] = 'Times-BoldItalic';
  t['TimesNewRoman-Italic'] = 'Times-Italic';
  t['TimesNewRomanPS'] = 'Times-Roman';
  t['TimesNewRomanPS-Bold'] = 'Times-Bold';
  t['TimesNewRomanPS-BoldItalic'] = 'Times-BoldItalic';
  t['TimesNewRomanPS-BoldItalicMT'] = 'Times-BoldItalic';
  t['TimesNewRomanPS-BoldMT'] = 'Times-Bold';
  t['TimesNewRomanPS-Italic'] = 'Times-Italic';
  t['TimesNewRomanPS-ItalicMT'] = 'Times-Italic';
  t['TimesNewRomanPSMT'] = 'Times-Roman';
  t['TimesNewRomanPSMT-Bold'] = 'Times-Bold';
  t['TimesNewRomanPSMT-BoldItalic'] = 'Times-BoldItalic';
  t['TimesNewRomanPSMT-Italic'] = 'Times-Italic';
});

/**
 * Holds the map of the non-standard fonts that might be included as
 * a standard fonts without glyph data.
 */
var getNonStdFontMap = getLookupTableFactory(function (t) {
  t['CenturyGothic'] = 'Helvetica';
  t['CenturyGothic-Bold'] = 'Helvetica-Bold';
  t['CenturyGothic-BoldItalic'] = 'Helvetica-BoldOblique';
  t['CenturyGothic-Italic'] = 'Helvetica-Oblique';
  t['ComicSansMS'] = 'Comic Sans MS';
  t['ComicSansMS-Bold'] = 'Comic Sans MS-Bold';
  t['ComicSansMS-BoldItalic'] = 'Comic Sans MS-BoldItalic';
  t['ComicSansMS-Italic'] = 'Comic Sans MS-Italic';
  t['LucidaConsole'] = 'Courier';
  t['LucidaConsole-Bold'] = 'Courier-Bold';
  t['LucidaConsole-BoldItalic'] = 'Courier-BoldOblique';
  t['LucidaConsole-Italic'] = 'Courier-Oblique';
  t['MS-Gothic'] = 'MS Gothic';
  t['MS-Gothic-Bold'] = 'MS Gothic-Bold';
  t['MS-Gothic-BoldItalic'] = 'MS Gothic-BoldItalic';
  t['MS-Gothic-Italic'] = 'MS Gothic-Italic';
  t['MS-Mincho'] = 'MS Mincho';
  t['MS-Mincho-Bold'] = 'MS Mincho-Bold';
  t['MS-Mincho-BoldItalic'] = 'MS Mincho-BoldItalic';
  t['MS-Mincho-Italic'] = 'MS Mincho-Italic';
  t['MS-PGothic'] = 'MS PGothic';
  t['MS-PGothic-Bold'] = 'MS PGothic-Bold';
  t['MS-PGothic-BoldItalic'] = 'MS PGothic-BoldItalic';
  t['MS-PGothic-Italic'] = 'MS PGothic-Italic';
  t['MS-PMincho'] = 'MS PMincho';
  t['MS-PMincho-Bold'] = 'MS PMincho-Bold';
  t['MS-PMincho-BoldItalic'] = 'MS PMincho-BoldItalic';
  t['MS-PMincho-Italic'] = 'MS PMincho-Italic';
  t['NuptialScript'] = 'Times-Italic';
  t['Wingdings'] = 'ZapfDingbats';
});

var getSerifFonts = getLookupTableFactory(function (t) {
  t['Adobe Jenson'] = true;
  t['Adobe Text'] = true;
  t['Albertus'] = true;
  t['Aldus'] = true;
  t['Alexandria'] = true;
  t['Algerian'] = true;
  t['American Typewriter'] = true;
  t['Antiqua'] = true;
  t['Apex'] = true;
  t['Arno'] = true;
  t['Aster'] = true;
  t['Aurora'] = true;
  t['Baskerville'] = true;
  t['Bell'] = true;
  t['Bembo'] = true;
  t['Bembo Schoolbook'] = true;
  t['Benguiat'] = true;
  t['Berkeley Old Style'] = true;
  t['Bernhard Modern'] = true;
  t['Berthold City'] = true;
  t['Bodoni'] = true;
  t['Bauer Bodoni'] = true;
  t['Book Antiqua'] = true;
  t['Bookman'] = true;
  t['Bordeaux Roman'] = true;
  t['Californian FB'] = true;
  t['Calisto'] = true;
  t['Calvert'] = true;
  t['Capitals'] = true;
  t['Cambria'] = true;
  t['Cartier'] = true;
  t['Caslon'] = true;
  t['Catull'] = true;
  t['Centaur'] = true;
  t['Century Old Style'] = true;
  t['Century Schoolbook'] = true;
  t['Chaparral'] = true;
  t['Charis SIL'] = true;
  t['Cheltenham'] = true;
  t['Cholla Slab'] = true;
  t['Clarendon'] = true;
  t['Clearface'] = true;
  t['Cochin'] = true;
  t['Colonna'] = true;
  t['Computer Modern'] = true;
  t['Concrete Roman'] = true;
  t['Constantia'] = true;
  t['Cooper Black'] = true;
  t['Corona'] = true;
  t['Ecotype'] = true;
  t['Egyptienne'] = true;
  t['Elephant'] = true;
  t['Excelsior'] = true;
  t['Fairfield'] = true;
  t['FF Scala'] = true;
  t['Folkard'] = true;
  t['Footlight'] = true;
  t['FreeSerif'] = true;
  t['Friz Quadrata'] = true;
  t['Garamond'] = true;
  t['Gentium'] = true;
  t['Georgia'] = true;
  t['Gloucester'] = true;
  t['Goudy Old Style'] = true;
  t['Goudy Schoolbook'] = true;
  t['Goudy Pro Font'] = true;
  t['Granjon'] = true;
  t['Guardian Egyptian'] = true;
  t['Heather'] = true;
  t['Hercules'] = true;
  t['High Tower Text'] = true;
  t['Hiroshige'] = true;
  t['Hoefler Text'] = true;
  t['Humana Serif'] = true;
  t['Imprint'] = true;
  t['Ionic No. 5'] = true;
  t['Janson'] = true;
  t['Joanna'] = true;
  t['Korinna'] = true;
  t['Lexicon'] = true;
  t['Liberation Serif'] = true;
  t['Linux Libertine'] = true;
  t['Literaturnaya'] = true;
  t['Lucida'] = true;
  t['Lucida Bright'] = true;
  t['Melior'] = true;
  t['Memphis'] = true;
  t['Miller'] = true;
  t['Minion'] = true;
  t['Modern'] = true;
  t['Mona Lisa'] = true;
  t['Mrs Eaves'] = true;
  t['MS Serif'] = true;
  t['Museo Slab'] = true;
  t['New York'] = true;
  t['Nimbus Roman'] = true;
  t['NPS Rawlinson Roadway'] = true;
  t['NuptialScript'] = true;
  t['Palatino'] = true;
  t['Perpetua'] = true;
  t['Plantin'] = true;
  t['Plantin Schoolbook'] = true;
  t['Playbill'] = true;
  t['Poor Richard'] = true;
  t['Rawlinson Roadway'] = true;
  t['Renault'] = true;
  t['Requiem'] = true;
  t['Rockwell'] = true;
  t['Roman'] = true;
  t['Rotis Serif'] = true;
  t['Sabon'] = true;
  t['Scala'] = true;
  t['Seagull'] = true;
  t['Sistina'] = true;
  t['Souvenir'] = true;
  t['STIX'] = true;
  t['Stone Informal'] = true;
  t['Stone Serif'] = true;
  t['Sylfaen'] = true;
  t['Times'] = true;
  t['Trajan'] = true;
  t['Trinité'] = true;
  t['Trump Mediaeval'] = true;
  t['Utopia'] = true;
  t['Vale Type'] = true;
  t['Bitstream Vera'] = true;
  t['Vera Serif'] = true;
  t['Versailles'] = true;
  t['Wanted'] = true;
  t['Weiss'] = true;
  t['Wide Latin'] = true;
  t['Windsor'] = true;
  t['XITS'] = true;
});

var getSymbolsFonts = getLookupTableFactory(function (t) {
  t['Dingbats'] = true;
  t['Symbol'] = true;
  t['ZapfDingbats'] = true;
});

// Glyph map for well-known standard fonts. Sometimes Ghostscript uses CID
// fonts, but does not embed the CID to GID mapping. The mapping is incomplete
// for all glyphs, but common for some set of the standard fonts.
var getGlyphMapForStandardFonts = getLookupTableFactory(function (t) {
  t[2] = 10; t[3] = 32; t[4] = 33; t[5] = 34; t[6] = 35; t[7] = 36; t[8] = 37;
  t[9] = 38; t[10] = 39; t[11] = 40; t[12] = 41; t[13] = 42; t[14] = 43;
  t[15] = 44; t[16] = 45; t[17] = 46; t[18] = 47; t[19] = 48; t[20] = 49;
  t[21] = 50; t[22] = 51; t[23] = 52; t[24] = 53; t[25] = 54; t[26] = 55;
  t[27] = 56; t[28] = 57; t[29] = 58; t[30] = 894; t[31] = 60; t[32] = 61;
  t[33] = 62; t[34] = 63; t[35] = 64; t[36] = 65; t[37] = 66; t[38] = 67;
  t[39] = 68; t[40] = 69; t[41] = 70; t[42] = 71; t[43] = 72; t[44] = 73;
  t[45] = 74; t[46] = 75; t[47] = 76; t[48] = 77; t[49] = 78; t[50] = 79;
  t[51] = 80; t[52] = 81; t[53] = 82; t[54] = 83; t[55] = 84; t[56] = 85;
  t[57] = 86; t[58] = 87; t[59] = 88; t[60] = 89; t[61] = 90; t[62] = 91;
  t[63] = 92; t[64] = 93; t[65] = 94; t[66] = 95; t[67] = 96; t[68] = 97;
  t[69] = 98; t[70] = 99; t[71] = 100; t[72] = 101; t[73] = 102; t[74] = 103;
  t[75] = 104; t[76] = 105; t[77] = 106; t[78] = 107; t[79] = 108;
  t[80] = 109; t[81] = 110; t[82] = 111; t[83] = 112; t[84] = 113;
  t[85] = 114; t[86] = 115; t[87] = 116; t[88] = 117; t[89] = 118;
  t[90] = 119; t[91] = 120; t[92] = 121; t[93] = 122; t[94] = 123;
  t[95] = 124; t[96] = 125; t[97] = 126; t[98] = 196; t[99] = 197;
  t[100] = 199; t[101] = 201; t[102] = 209; t[103] = 214; t[104] = 220;
  t[105] = 225; t[106] = 224; t[107] = 226; t[108] = 228; t[109] = 227;
  t[110] = 229; t[111] = 231; t[112] = 233; t[113] = 232; t[114] = 234;
  t[115] = 235; t[116] = 237; t[117] = 236; t[118] = 238; t[119] = 239;
  t[120] = 241; t[121] = 243; t[122] = 242; t[123] = 244; t[124] = 246;
  t[125] = 245; t[126] = 250; t[127] = 249; t[128] = 251; t[129] = 252;
  t[130] = 8224; t[131] = 176; t[132] = 162; t[133] = 163; t[134] = 167;
  t[135] = 8226; t[136] = 182; t[137] = 223; t[138] = 174; t[139] = 169;
  t[140] = 8482; t[141] = 180; t[142] = 168; t[143] = 8800; t[144] = 198;
  t[145] = 216; t[146] = 8734; t[147] = 177; t[148] = 8804; t[149] = 8805;
  t[150] = 165; t[151] = 181; t[152] = 8706; t[153] = 8721; t[154] = 8719;
  t[156] = 8747; t[157] = 170; t[158] = 186; t[159] = 8486; t[160] = 230;
  t[161] = 248; t[162] = 191; t[163] = 161; t[164] = 172; t[165] = 8730;
  t[166] = 402; t[167] = 8776; t[168] = 8710; t[169] = 171; t[170] = 187;
  t[171] = 8230; t[210] = 218; t[223] = 711; t[224] = 321; t[225] = 322;
  t[227] = 353; t[229] = 382; t[234] = 253; t[252] = 263; t[253] = 268;
  t[254] = 269; t[258] = 258; t[260] = 260; t[261] = 261; t[265] = 280;
  t[266] = 281; t[268] = 283; t[269] = 313; t[275] = 323; t[276] = 324;
  t[278] = 328; t[284] = 345; t[285] = 346; t[286] = 347; t[292] = 367;
  t[295] = 377; t[296] = 378; t[298] = 380; t[305] = 963; t[306] = 964;
  t[307] = 966; t[308] = 8215; t[309] = 8252; t[310] = 8319; t[311] = 8359;
  t[312] = 8592; t[313] = 8593; t[337] = 9552; t[493] = 1039;
  t[494] = 1040; t[705] = 1524; t[706] = 8362; t[710] = 64288; t[711] = 64298;
  t[759] = 1617; t[761] = 1776; t[763] = 1778; t[775] = 1652; t[777] = 1764;
  t[778] = 1780; t[779] = 1781; t[780] = 1782; t[782] = 771; t[783] = 64726;
  t[786] = 8363; t[788] = 8532; t[790] = 768; t[791] = 769; t[792] = 768;
  t[795] = 803; t[797] = 64336; t[798] = 64337; t[799] = 64342;
  t[800] = 64343; t[801] = 64344; t[802] = 64345; t[803] = 64362;
  t[804] = 64363; t[805] = 64364; t[2424] = 7821; t[2425] = 7822;
  t[2426] = 7823; t[2427] = 7824; t[2428] = 7825; t[2429] = 7826;
  t[2430] = 7827; t[2433] = 7682; t[2678] = 8045; t[2679] = 8046;
  t[2830] = 1552; t[2838] = 686; t[2840] = 751; t[2842] = 753; t[2843] = 754;
  t[2844] = 755; t[2846] = 757; t[2856] = 767; t[2857] = 848; t[2858] = 849;
  t[2862] = 853; t[2863] = 854; t[2864] = 855; t[2865] = 861; t[2866] = 862;
  t[2906] = 7460; t[2908] = 7462; t[2909] = 7463; t[2910] = 7464;
  t[2912] = 7466; t[2913] = 7467; t[2914] = 7468; t[2916] = 7470;
  t[2917] = 7471; t[2918] = 7472; t[2920] = 7474; t[2921] = 7475;
  t[2922] = 7476; t[2924] = 7478; t[2925] = 7479; t[2926] = 7480;
  t[2928] = 7482; t[2929] = 7483; t[2930] = 7484; t[2932] = 7486;
  t[2933] = 7487; t[2934] = 7488; t[2936] = 7490; t[2937] = 7491;
  t[2938] = 7492; t[2940] = 7494; t[2941] = 7495; t[2942] = 7496;
  t[2944] = 7498; t[2946] = 7500; t[2948] = 7502; t[2950] = 7504;
  t[2951] = 7505; t[2952] = 7506; t[2954] = 7508; t[2955] = 7509;
  t[2956] = 7510; t[2958] = 7512; t[2959] = 7513; t[2960] = 7514;
  t[2962] = 7516; t[2963] = 7517; t[2964] = 7518; t[2966] = 7520;
  t[2967] = 7521; t[2968] = 7522; t[2970] = 7524; t[2971] = 7525;
  t[2972] = 7526; t[2974] = 7528; t[2975] = 7529; t[2976] = 7530;
  t[2978] = 1537; t[2979] = 1538; t[2980] = 1539; t[2982] = 1549;
  t[2983] = 1551; t[2984] = 1552; t[2986] = 1554; t[2987] = 1555;
  t[2988] = 1556; t[2990] = 1623; t[2991] = 1624; t[2995] = 1775;
  t[2999] = 1791; t[3002] = 64290; t[3003] = 64291; t[3004] = 64292;
  t[3006] = 64294; t[3007] = 64295; t[3008] = 64296; t[3011] = 1900;
  t[3014] = 8223; t[3015] = 8244; t[3017] = 7532; t[3018] = 7533;
  t[3019] = 7534; t[3075] = 7590; t[3076] = 7591; t[3079] = 7594;
  t[3080] = 7595; t[3083] = 7598; t[3084] = 7599; t[3087] = 7602;
  t[3088] = 7603; t[3091] = 7606; t[3092] = 7607; t[3095] = 7610;
  t[3096] = 7611; t[3099] = 7614; t[3100] = 7615; t[3103] = 7618;
  t[3104] = 7619; t[3107] = 8337; t[3108] = 8338; t[3116] = 1884;
  t[3119] = 1885; t[3120] = 1885; t[3123] = 1886; t[3124] = 1886;
  t[3127] = 1887; t[3128] = 1887; t[3131] = 1888; t[3132] = 1888;
  t[3135] = 1889; t[3136] = 1889; t[3139] = 1890; t[3140] = 1890;
  t[3143] = 1891; t[3144] = 1891; t[3147] = 1892; t[3148] = 1892;
  t[3153] = 580; t[3154] = 581; t[3157] = 584; t[3158] = 585; t[3161] = 588;
  t[3162] = 589; t[3165] = 891; t[3166] = 892; t[3169] = 1274; t[3170] = 1275;
  t[3173] = 1278; t[3174] = 1279; t[3181] = 7622; t[3182] = 7623;
  t[3282] = 11799; t[3316] = 578; t[3379] = 42785; t[3393] = 1159;
  t[3416] = 8377;
});

// The glyph map for ArialBlack differs slightly from the glyph map used for
// other well-known standard fonts. Hence we use this (incomplete) CID to GID
// mapping to adjust the glyph map for non-embedded ArialBlack fonts.
var getSupplementalGlyphMapForArialBlack =
    getLookupTableFactory(function (t) {
  t[227] = 322; t[264] = 261; t[291] = 346;
});

export {
  getStdFontMap,
  getNonStdFontMap,
  getSerifFonts,
  getSymbolsFonts,
  getGlyphMapForStandardFonts,
  getSupplementalGlyphMapForArialBlack,
};
