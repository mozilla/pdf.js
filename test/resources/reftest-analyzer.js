/*
Copyright 2012 Mozilla Foundation

Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at

    http://www.mozilla.org/MPL

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the LGPL or the GPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.

Original author: L. David Baron <dbaron@dbaron.org>
*/

// Global variables
const XLINK_NS = "http://www.w3.org/1999/xlink";
const SVG_NS = "http://www.w3.org/2000/svg";
let gPhases = null;
const gMagPixPaths = []; // 2D array of array-of-two <path> objects used in the pixel magnifier
const gMagWidth = 5; // number of zoomed in pixels to show horizontally
const gMagHeight = 5; // number of zoomed in pixels to show vertically
const gMagZoom = 16; // size of the zoomed in pixels
let gImage1Data = null; // ImageData object for the test output image
let gImage2Data = null; // ImageData object for the reference image
const gFlashingPixels = []; // array of <path> objects that should be flashed due to pixel color mismatch
let gPath = ""; // path taken from #web= and prepended to ref/snp urls
let gSelected = null; // currently selected comparison

window.onload = function () {
  load();

  function ID(id) {
    return document.getElementById(id);
  }

  function hashParameters() {
    const query = window.location.hash.substring(1);
    const params = new Map();
    for (const [key, value] of new URLSearchParams(query)) {
      params.set(key.toLowerCase(), value);
    }
    return params;
  }

  function load() {
    gPhases = [ID("entry"), ID("loading"), ID("viewer")];
    buildMag();
    const params = hashParameters();
    if (params.has("log")) {
      ID("logEntry").value = params.get("log");
      logPasted();
    } else if (params.has("web")) {
      loadFromWeb(params.get("web"));
    }
    ID("logEntry").focus();
  }

  function buildMag() {
    const mag = ID("mag");
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", (gMagZoom * -gMagWidth) / 2);
    r.setAttribute("y", (gMagZoom * -gMagHeight) / 2);
    r.setAttribute("width", gMagZoom * gMagWidth);
    r.setAttribute("height", gMagZoom * gMagHeight);
    mag.append(r);
    mag.setAttribute(
      "transform",
      "translate(" +
        (gMagZoom * (gMagWidth / 2) + 1) +
        "," +
        (gMagZoom * (gMagHeight / 2) + 1) +
        ")"
    );

    for (let x = 0; x < gMagWidth; x++) {
      gMagPixPaths[x] = [];
      for (let y = 0; y < gMagHeight; y++) {
        const p1 = document.createElementNS(SVG_NS, "path");
        p1.setAttribute(
          "d",
          "M" +
            (x - gMagWidth / 2 + 1) * gMagZoom +
            "," +
            (y - gMagHeight / 2) * gMagZoom +
            "h" +
            -gMagZoom +
            "v" +
            gMagZoom
        );
        p1.setAttribute("stroke", "#CCC");
        p1.setAttribute("stroke-width", "1px");
        p1.setAttribute("fill", "#aaa");

        const p2 = document.createElementNS(SVG_NS, "path");
        p2.setAttribute(
          "d",
          "M" +
            (x - gMagWidth / 2 + 1) * gMagZoom +
            "," +
            (y - gMagHeight / 2) * gMagZoom +
            "v" +
            gMagZoom +
            "h" +
            -gMagZoom
        );
        p2.setAttribute("stroke", "#CCC");
        p2.setAttribute("stroke-width", "1px");
        p2.setAttribute("fill", "#888");

        mag.append(p1, p2);
        gMagPixPaths[x][y] = [p1, p2];
      }
    }

    let flashedOn = false;
    setInterval(function () {
      flashedOn = !flashedOn;
      flashPixels(flashedOn);
    }, 500);
  }

  function showPhase(phaseId) {
    for (const i in gPhases) {
      const phase = gPhases[i];
      phase.style.display = phase.id === phaseId ? "block" : "none";
    }
    if (phaseId === "viewer") {
      ID("images").style.display = "none";
    }
  }

  async function loadFromWeb(url) {
    const lastSlash = url.lastIndexOf("/");
    if (lastSlash) {
      gPath = url.substring(0, lastSlash + 1);
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    processLog(await response.text());
  }

  function fileEntryChanged() {
    showPhase("loading");
    const input = ID("fileEntry");
    const files = input.files;
    if (files.length > 0) {
      // Only handle the first file; don't handle multiple selection.
      // The parts of the log we care about are ASCII-only.  Since we
      // can ignore lines we don't care about, best to read in as
      // ISO-8859-1, which guarantees we don't get decoding errors.
      const fileReader = new FileReader();
      fileReader.onload = function (e) {
        const log = e.target.result;
        if (log) {
          processLog(log);
        } else {
          showPhase("entry");
        }
      };
      fileReader.readAsText(files[0], "iso-8859-1");
    }
    // So the user can process the same filename again (after
    // overwriting the log), clear the value on the form input so we
    // will always get an onchange event.
    input.value = "";
  }

  function logPasted() {
    showPhase("loading");
    const entry = ID("logEntry");
    const log = entry.value;
    entry.value = "";
    processLog(log);
  }

  const gTestItems = [];

  function processLog(contents) {
    const lines = contents.split(/[\r\n]+/);
    for (const j in lines) {
      let line = lines[j];
      let match = line.match(/^(?:NEXT ERROR )?REFTEST (.*)$/);
      if (!match) {
        continue;
      }
      line = match[1];
      match = line.match(
        /^(TEST-PASS|TEST-UNEXPECTED-PASS|TEST-KNOWN-FAIL|TEST-UNEXPECTED-FAIL)(\(EXPECTED RANDOM\)|) \| ([^|]+) \|(.*)/
      );
      if (match) {
        const state = match[1];
        const random = match[2];
        const url = match[3];
        const extra = match[4];

        gTestItems.push({
          pass: !state.endsWith("FAIL"),
          // only one of the following three should ever be true
          unexpected: state.startsWith("TEST-UNEXPECTED"),
          random: random === "(EXPECTED RANDOM)",
          skip: extra === " (SKIP)",
          url,
          images: [],
        });
        continue;
      }
      match = line.match(
        /^ {2}IMAGE[^:]*\((\d+\.?\d*)x(\d+\.?\d*)x(\d+\.?\d*)\): (.*)$/
      );
      if (match) {
        const item = gTestItems.at(-1);
        item.images.push({
          width: parseFloat(match[1]),
          height: parseFloat(match[2]),
          outputScale: parseFloat(match[3]),
          file: match[4],
        });
      }
    }
    buildViewer();
  }

  function buildViewer() {
    if (gTestItems.length === 0) {
      showPhase("entry");
      return;
    }

    // const cell = ID("itemlist");
    const table = document.getElementById("itemtable");
    table.textContent = ""; // Remove any table contents from the DOM.
    const tbody = document.createElement("tbody");
    table.append(tbody);

    for (const i in gTestItems) {
      const item = gTestItems[i];
      if (item.pass && !item.unexpected) {
        continue;
      }

      const tr = document.createElement("tr");
      let rowclass = item.pass ? "pass" : "fail";
      let td = document.createElement("td");
      let text = "";

      if (item.unexpected) {
        text += "!";
        rowclass += " unexpected";
      }
      if (item.random) {
        text += "R";
        rowclass += " random";
      }
      if (item.skip) {
        text += "S";
        rowclass += " skip";
      }
      td.append(document.createTextNode(text));
      tr.append(td);

      td = document.createElement("td");
      td.id = "url" + i;
      td.className = "url";

      const match = item.url.match(/\/mozilla\/(.*)/);
      text = document.createTextNode(match ? match[1] : item.url);
      if (item.images.length > 0) {
        const a = document.createElement("a");
        a.id = i;
        a.className = "image";
        a.href = "#";
        a.append(text);
        td.append(a);
      } else {
        td.append(text);
      }
      tr.append(td);
      tr.className = rowclass;
      tbody.append(tr);
    }

    // Bind an event handler to each image link
    const images = document.getElementsByClassName("image");
    for (const image of images) {
      image.addEventListener(
        "click",
        function (e) {
          showImages(e.target.id);
        },
        false
      );
    }
    showPhase("viewer");
  }

  function getImageData(src, whenReady) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);

      whenReady(ctx.getImageData(0, 0, img.naturalWidth, img.naturalHeight));
    };
    img.src = gPath + src;
  }

  function showImages(i) {
    if (gSelected !== null) {
      ID("url" + gSelected).classList.remove("selected");
    }
    gSelected = i;
    ID("url" + gSelected).classList.add("selected");
    ID("url" + gSelected).scrollIntoView();
    const item = gTestItems[i];
    const cell = ID("images");

    ID("image1").style.display = "";
    const scale = item.images[0].outputScale / window.devicePixelRatio;
    ID("image1").setAttribute("width", item.images[0].width * scale);
    ID("image1").setAttribute("height", item.images[0].height * scale);

    ID("svg").setAttribute("width", item.images[0].width * scale);
    ID("svg").setAttribute("height", item.images[0].height * scale);

    ID("image2").style.display = "none";
    if (item.images[1]) {
      ID("image2").setAttribute("width", item.images[1].width * scale);
      ID("image2").setAttribute("height", item.images[1].height * scale);
    }
    ID("diffrect").style.display = "none";
    ID("imgcontrols").reset();

    ID("image1").setAttributeNS(
      XLINK_NS,
      "xlink:href",
      gPath + item.images[0].file
    );
    // Making the href be #image1 doesn't seem to work
    ID("feimage1").setAttributeNS(
      XLINK_NS,
      "xlink:href",
      gPath + item.images[0].file
    );
    if (item.images.length === 1) {
      ID("imgcontrols").style.display = "none";
    } else {
      ID("imgcontrols").style.display = "";
      ID("image2").setAttributeNS(
        XLINK_NS,
        "xlink:href",
        gPath + item.images[1].file
      );
      // Making the href be #image2 doesn't seem to work
      ID("feimage2").setAttributeNS(
        XLINK_NS,
        "xlink:href",
        gPath + item.images[1].file
      );
    }
    cell.style.display = "";
    getImageData(item.images[0].file, function (data) {
      gImage1Data = data;
    });
    getImageData(item.images[1].file, function (data) {
      gImage2Data = data;
    });
  }

  function showImage(i) {
    if (i === 1) {
      ID("image1").style.display = "";
      ID("image2").style.display = "none";
    } else {
      ID("image1").style.display = "none";
      ID("image2").style.display = "";
    }
  }

  function showDifferences(cb) {
    ID("diffrect").style.display = cb.checked ? "" : "none";
  }

  function flashPixels(on) {
    const stroke = on ? "#FF0000" : "#CCC";
    const strokeWidth = on ? "2px" : "1px";
    for (const pixel of gFlashingPixels) {
      pixel.setAttribute("stroke", stroke);
      pixel.setAttribute("stroke-width", strokeWidth);
    }
  }

  function cursorPoint(evt) {
    const m = evt.target.getScreenCTM().inverse();
    let p = ID("svg").createSVGPoint();
    p.x = evt.clientX;
    p.y = evt.clientY;
    p = p.matrixTransform(m);
    return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }

  function hex2(i) {
    return (i < 16 ? "0" : "") + i.toString(16);
  }

  function canvasPixelAsHex(data, x, y) {
    const offset = (y * data.width + x) * 4 * window.devicePixelRatio;
    const r = data.data[offset];
    const g = data.data[offset + 1];
    const b = data.data[offset + 2];
    return "#" + hex2(r) + hex2(g) + hex2(b);
  }

  function hexAsRgb(hex) {
    return (
      "rgb(" +
      [
        parseInt(hex.substring(1, 3), 16),
        parseInt(hex.substring(3, 5), 16),
        parseInt(hex.substring(5, 7), 16),
      ] +
      ")"
    );
  }

  function magnify(evt) {
    const cursor = cursorPoint(evt);
    const x = cursor.x;
    const y = cursor.y;
    let centerPixelColor1, centerPixelColor2;

    const dx_lo = -Math.floor(gMagWidth / 2);
    const dx_hi = Math.floor(gMagWidth / 2);
    const dy_lo = -Math.floor(gMagHeight / 2);
    const dy_hi = Math.floor(gMagHeight / 2);

    flashPixels(false);
    gFlashingPixels.length = 0;
    for (let j = dy_lo; j <= dy_hi; j++) {
      for (let i = dx_lo; i <= dx_hi; i++) {
        const px = x + i;
        const py = y + j;
        const p1 = gMagPixPaths[i + dx_hi][j + dy_hi][0];
        const p2 = gMagPixPaths[i + dx_hi][j + dy_hi][1];
        if (
          px < 0 ||
          py < 0 ||
          px >= gImage1Data.width ||
          py >= gImage1Data.height
        ) {
          p1.setAttribute("fill", "#aaa");
          p2.setAttribute("fill", "#888");
        } else {
          const color1 = canvasPixelAsHex(gImage1Data, x + i, y + j);
          const color2 = canvasPixelAsHex(gImage2Data, x + i, y + j);
          p1.setAttribute("fill", color1);
          p2.setAttribute("fill", color2);
          if (color1 !== color2) {
            gFlashingPixels.push(p1, p2);
            p1.parentNode.append(p1);
            p2.parentNode.append(p2);
          }
          if (i === 0 && j === 0) {
            centerPixelColor1 = color1;
            centerPixelColor2 = color2;
          }
        }
      }
    }
    flashPixels(true);
    showPixelInfo(
      x,
      y,
      centerPixelColor1,
      hexAsRgb(centerPixelColor1),
      centerPixelColor2,
      hexAsRgb(centerPixelColor2)
    );
  }

  function showPixelInfo(x, y, pix1rgb, pix1hex, pix2rgb, pix2hex) {
    // const pixelinfo = ID("pixelinfo");
    ID("coords").textContent = [x, y];
    ID("pix1hex").textContent = pix1hex;
    ID("pix1rgb").textContent = pix1rgb;
    ID("pix2hex").textContent = pix2hex;
    ID("pix2rgb").textContent = pix2rgb;
  }

  const logPastedButton = document.getElementById("logPasted");
  logPastedButton.addEventListener("click", logPasted, false);

  const fileEntryButton = document.getElementById("fileEntry");
  fileEntryButton.addEventListener("change", fileEntryChanged, false);

  const testImage = document.getElementById("testImage");
  testImage.addEventListener(
    "click",
    function () {
      showImage(1);
    },
    false
  );

  const referenceImage = document.getElementById("referenceImage");
  referenceImage.addEventListener(
    "click",
    function () {
      showImage(2);
    },
    false
  );

  const differences = document.getElementById("differences");
  differences.addEventListener(
    "click",
    function (e) {
      showDifferences(e.target);
    },
    false
  );

  const magnifyElement = document.getElementById("magnify");
  magnifyElement.addEventListener(
    "mousemove",
    function (e) {
      magnify(e);
    },
    false
  );

  window.addEventListener("keydown", function keydown(event) {
    if (event.which === 84) {
      // 't' switch test/ref images
      let val = 0;
      if (document.querySelector('input[name="which"][value="0"]:checked')) {
        val = 1;
      }
      document
        .querySelector('input[name="which"][value="' + val + '"]')
        .click();
    } else if (event.which === 68) {
      // 'd' toggle differences
      document.getElementById("differences").click();
    } else if (event.which === 78 || event.which === 80) {
      // 'n' next image, 'p' previous image
      let select = gSelected;
      if (gSelected === null) {
        select = 0;
      } else if (event.which === 78) {
        select++;
      } else {
        select--;
      }
      const length = gTestItems.length;
      if (select < 0) {
        select = length - 1;
      } else if (select >= length) {
        select = 0;
      }
      showImages(select);
    }
  });
};
