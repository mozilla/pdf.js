/*
Copyright 2026 Mozilla Foundation

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/* exported getAutomaticPdfOpening, onAutomaticPdfOpeningChanged */

"use strict";

const pdfOpeningPref = "openPdfAutomatically";
const pdfOpeningStorageArea = chrome.storage.sync ? "sync" : "local";

async function getAutomaticPdfOpening() {
  const storage = chrome.storage[pdfOpeningStorageArea];
  try {
    const prefs = await storage.get(pdfOpeningPref);
    if (pdfOpeningPref in prefs) {
      return prefs[pdfOpeningPref] === true;
    }
  } catch (error) {
    console.error("Failed to read the automatic PDF opening preference.", error);
    return false;
  }

  // Managed storage can be unavailable when there are no administrator policies.
  const managed = chrome.storage.managed;
  const prefs = await managed?.get(pdfOpeningPref).catch(() => null);
  return prefs?.[pdfOpeningPref] === true;
}

function onAutomaticPdfOpeningChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (
      (areaName === pdfOpeningStorageArea || areaName === "managed") &&
      pdfOpeningPref in changes
    ) {
      callback();
    }
  });
}
