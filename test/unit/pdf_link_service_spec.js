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

import { PDFLinkService } from "../../web/pdf_link_service.js";

describe("PDFLinkService", function () {
  describe("addLinkAttributes", function () {
    function createLinkService({ externalLinkEnabled = true } = {}) {
      const linkService = new PDFLinkService();
      linkService.externalLinkEnabled = externalLinkEnabled;
      return linkService;
    }

    // Use a plain object instead of a real DOM element so tests run in Node.js.
    function createLink() {
      return { href: "", title: "", target: "", rel: "" };
    }

    it("sets href and title for a plain URL", function () {
      const linkService = createLinkService();
      const link = createLink();

      linkService.addLinkAttributes(link, "https://example.com/path");

      expect(link.href).toEqual("https://example.com/path");
      expect(link.title).toEqual("https://example.com/path");
    });

    it("strips userinfo from the title to prevent hostname spoofing", function () {
      const linkService = createLinkService();
      const link = createLink();

      // URL with username that looks like a trusted domain.
      linkService.addLinkAttributes(
        link,
        "https://trusted.example@attacker.example/path"
      );

      expect(link.href).toEqual(
        "https://trusted.example@attacker.example/path"
      );
      expect(link.title).toEqual("https://attacker.example/path");
    });

    it("strips username and password from the title", function () {
      const linkService = createLinkService();
      const link = createLink();

      linkService.addLinkAttributes(
        link,
        "https://user:password@example.com/path"
      );

      expect(link.href).toEqual("https://user:password@example.com/path");
      expect(link.title).toEqual("https://example.com/path");
    });

    it("strips only username (no password) from the title", function () {
      const linkService = createLinkService();
      const link = createLink();

      linkService.addLinkAttributes(link, "https://user@example.com/page");

      expect(link.href).toEqual("https://user@example.com/page");
      expect(link.title).toEqual("https://example.com/page");
    });

    it("does not alter the title when there is no userinfo", function () {
      const linkService = createLinkService();
      const link = createLink();

      linkService.addLinkAttributes(
        link,
        "https://example.com/path?q=1#anchor"
      );

      expect(link.title).toEqual("https://example.com/path?q=1#anchor");
    });

    it("disables the link and prefixes the title when externalLinkEnabled is false", function () {
      const linkService = createLinkService({ externalLinkEnabled: false });
      const link = createLink();

      linkService.addLinkAttributes(link, "https://example.com/path");

      expect(link.href).toEqual("");
      expect(link.title).toEqual("Disabled: https://example.com/path");
    });

    it("strips userinfo from the title even when the link is disabled", function () {
      const linkService = createLinkService({ externalLinkEnabled: false });
      const link = createLink();

      linkService.addLinkAttributes(
        link,
        "https://trusted.example@attacker.example/path"
      );

      expect(link.href).toEqual("");
      expect(link.title).toEqual("Disabled: https://attacker.example/path");
    });
  });

  describe("executeNamedAction", function () {
    it("dispatches GoBack actions to pdfHistory", function () {
      for (const action of ["GoBack", "menu:GoBack"]) {
        let backCalls = 0;
        const linkService = new PDFLinkService({
          eventBus: {
            dispatch() {},
          },
        });
        linkService.setHistory({
          back() {
            backCalls++;
          },
        });

        linkService.executeNamedAction(action);

        expect(backCalls).toEqual(1);
      }
    });
  });
});
