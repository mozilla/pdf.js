/* Copyright 2026 Mozilla Foundation
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

const prefsMetadata = {
  annotationEditorMode: {
    enum: [-1, 0, 3, 15],
  },
  annotationMode: {
    enum: [0, 1, 2, 3],
  },
  cursorToolOnLoad: {
    title: "Cursor tool on load",
    description:
      "The cursor tool that is enabled upon load.\n 0 = Text selection tool.\n 1 = Hand tool.",
    enum: [0, 1],
  },
  defaultZoomDelay: {
    title: "Default zoom delay",
    description: "Delay (in ms) to wait before redrawing the canvas.",
  },
  defaultZoomValue: {
    title: "Default zoom level",
    description:
      "Default zoom level of the viewer. Accepted values: 'auto', 'page-actual', 'page-width', 'page-height', 'page-fit', or a zoom level in percents.",
    pattern:
      "|auto|page-actual|page-width|page-height|page-fit|[0-9]+\\.?[0-9]*(,[0-9]+\\.?[0-9]*){0,2}",
  },
  disableFontFace: {
    title: "Disable @font-face",
    description:
      "Whether to disable @font-face and fall back to canvas rendering (this is more resource-intensive).",
  },
  disableRange: {
    title: "Disable range requests",
    description: "Whether to disable range requests (not recommended).",
  },
  disableStream: {
    title: "Disable streaming for requests",
    description: "Whether to disable streaming for requests (not recommended).",
  },
  disableTelemetry: {
    title: "Disable telemetry",
    description:
      "Whether to prevent the extension from reporting the extension and browser version to the extension developers.",
  },
  enableAutoLinking: {
    description: "Enable creation of hyperlinks from text that look like URLs.",
  },
  enableComment: {
    description: "Enable creation of comment annotations.",
  },
  enableHWA: {
    title: "Enable hardware acceleration",
    description: "Whether to enable hardware acceleration.",
  },
  enableOptimizedPartialRendering: {
    description:
      "Enable tracking of PDF operations to optimize partial rendering.",
  },
  enablePrintAutoRotate: {
    title: "Automatically rotate printed pages",
    description: "When enabled, landscape pages are rotated when printed.",
  },
  enableScripting: {
    title: "Enable active content (JavaScript) in PDFs",
    description:
      "Whether to allow execution of active content (JavaScript) by PDF files.",
  },
  externalLinkTarget: {
    title: "External links target window",
    description:
      "Controls how external links will be opened.\n 0 = default.\n 1 = replaces current window.\n 2 = new window/tab.\n 3 = parent.\n 4 = in top window.",
    enum: [0, 1, 2, 3, 4],
  },
  forcePageColors: {
    description:
      "When enabled, the pdf rendering will use the high contrast mode colors",
  },
  ignoreDestinationZoom: {
    title: "Ignore the zoom argument in destinations",
    description:
      "When enabled it will maintain the currently active zoom level, rather than letting the PDF document modify it, when navigating to internal destinations.",
  },
  pageColorsBackground: {
    description:
      "The color is a string as defined in CSS. Its goal is to help improve readability in high contrast mode",
  },
  pageColorsForeground: {
    description:
      "The color is a string as defined in CSS. Its goal is to help improve readability in high contrast mode",
  },
  pdfBugEnabled: {
    title: "Enable debugging tools",
    description: "Whether to enable debugging tools.",
  },
  scrollModeOnLoad: {
    title: "Scroll mode on load",
    description:
      "Controls how the viewer scrolls upon load.\n -1 = Default (uses the last position if available/enabled).\n 0 = Vertical scrolling.\n 1 = Horizontal scrolling.\n 2 = Wrapped scrolling.\n 3 = Page scrolling.",
    enum: [-1, 0, 1, 2, 3],
  },
  sidebarViewOnLoad: {
    title: "Sidebar state on load",
    description:
      "Controls the state of the sidebar upon load.\n -1 = Default (uses PageMode if available, otherwise the last position if available/enabled).\n 0 = Do not show sidebar.\n 1 = Show thumbnails in sidebar.\n 2 = Show document outline in sidebar.\n 3 = Show attachments in sidebar.",
    enum: [-1, 0, 1, 2, 3],
  },
  spreadModeOnLoad: {
    title: "Spread mode on load",
    description:
      "Whether the viewer should join pages into spreads upon load.\n -1 = Default (uses the last position if available/enabled).\n 0 = No spreads.\n 1 = Odd spreads.\n 2 = Even spreads.",
    enum: [-1, 0, 1, 2],
  },
  textLayerMode: {
    title: "Text layer mode",
    description:
      "Controls if the text layer is enabled, and the selection mode that is used.\n 0 = Disabled.\n 1 = Enabled.",
    enum: [0, 1],
  },
  viewerCssTheme: {
    title: "Theme",
    description:
      "The theme to use.\n0 = Use system theme.\n1 = Light theme.\n2 = Dark theme.",
    enum: [0, 1, 2],
  },
  viewOnLoad: {
    title: "View position on load",
    description:
      "The position in the document upon load.\n -1 = Default (uses OpenAction if available, otherwise equal to `viewOnLoad = 0`).\n 0 = The last viewed page/position.\n 1 = The initial page/position.",
    enum: [-1, 0, 1],
  },
};

// Deprecated keys are allowed in the managed preferences file.
// The code maintainer is responsible for adding migration logic to
// extensions/chromium/options/migration.js and web/chromecom.js .
const deprecatedPrefs = {
  disablePageMode: {
    description: "DEPRECATED.",
    type: "boolean",
    default: false,
  },
  disableTextLayer: {
    description:
      "DEPRECATED. Set textLayerMode to 0 to disable the text selection layer by default.",
    type: "boolean",
    default: false,
  },
  enableHandToolOnLoad: {
    description:
      "DEPRECATED. Set cursorToolOnLoad to 1 to enable the hand tool by default.",
    type: "boolean",
    default: false,
  },
  showPreviousViewOnLoad: {
    description:
      "DEPRECATED. Set viewOnLoad to 1 to disable showing the last page/position on load.",
    type: "boolean",
    default: true,
  },
};

function buildPrefsSchema(prefs) {
  const properties = Object.create(null);

  for (const name in prefs) {
    const pref = prefs[name];
    let type = typeof pref;

    switch (type) {
      case "boolean":
      case "string":
        break;
      case "number":
        type = "integer";
        break;
      default:
        throw new Error(`Invalid type (${type}) for "${name}"-preference.`);
    }

    const metadata = prefsMetadata[name];
    if (metadata) {
      let numMetadataKeys = 0;
      // Do some (very basic) validation of the metadata.
      for (const key in metadata) {
        const entry = metadata[key];

        switch (key) {
          case "default":
          case "type":
            throw new Error(
              `Invalid key (${key}) in metadata for "${name}"-preference.`
            );
          case "description":
            if (entry.startsWith("DEPRECATED.")) {
              throw new Error(
                `The \`description\` of the "${name}"-preference cannot begin with "DEPRECATED."`
              );
            }
            break;
        }
        numMetadataKeys++;
      }
      if (numMetadataKeys === 0) {
        throw new Error(
          `No metadata for "${name}"-preference, remove the entry.`
        );
      }
    }

    properties[name] = {
      type,
      default: pref,
      ...metadata,
    };
  }

  for (const name in prefsMetadata) {
    if (!properties[name]) {
      // Do *not* throw here, since keeping the metadata up-to-date should be
      // the responsibility of the CHROMIUM-addon maintainer.
      console.error(
        `The "${name}"-preference was removed, add it to \`deprecatedPrefs\` instead.\n`
      );
    }
  }

  for (const name in deprecatedPrefs) {
    const entry = deprecatedPrefs[name];

    if (properties[name]) {
      throw new Error(
        `The "${name}"-preference should not be listed as deprecated.`
      );
    }
    if (!entry.description?.startsWith("DEPRECATED.")) {
      throw new Error(
        `The \`description\` of the deprecated "${name}"-preference must begin with "DEPRECATED."`
      );
    }
    for (const key of ["default", "type"]) {
      if (key in entry) {
        continue;
      }
      throw new Error(
        `A \`${key}\` entry must be provided for the deprecated "${name}"-preference.`
      );
    }
    properties[name] = entry;
  }

  return {
    type: "object",
    properties,
  };
}

export { buildPrefsSchema };
