/* Copyright 2025 Mozilla Foundation
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

import { Autolinker } from "../../web/autolinker.js";

describe("autolinker", function () {
  it("should correctly find URLs", function () {
    const matches = Autolinker.findLinks("http://www.example.com");
    expect(matches[0].url).toEqual("http://www.example.com/");
  });

  it("should correctly find simple valid URLs", function () {
    const links = [
      "http://subdomain.example.com/path/to/page?query=param",
      "www.example.com/path/to/resource",
      "http://example.com/path?query=value#fragment",
    ];
    const matches = Autolinker.findLinks(links.join("\n"));
    expect(matches.length).toEqual(3);
    expect(matches[0].url).toEqual(
      "http://subdomain.example.com/path/to/page?query=param"
    );
    expect(matches[1].url).toEqual("http://www.example.com/path/to/resource");
    expect(matches[2].url).toEqual(
      "http://example.com/path?query=value#fragment"
    );
  });

  it("should correctly find emails", function () {
    const emails = [
      "mailto:username@example.com",
      "mailto:someone@subdomain.example.com",
      "peter@abc.de",
      "red.teddy.b@abc.com",
      "abc_@gmail.com", // '_' is ok before '@'.
      "dummy-hi@gmail.com", // '-' is ok in user name.
      "a..df@gmail.com", // Stop at consecutive '.'.
      ".john@yahoo.com", // Remove heading '.'.
      "abc@xyz.org?/", // Trim ending invalid chars.
      "fan{abc@xyz.org", // Trim beginning invalid chars.
      "fan@g.com..", // Trim the ending periods.
      "CAP.cap@Gmail.Com", // Keep the original case.
    ];
    const matches = Autolinker.findLinks(emails.join("\n"));
    expect(matches.length).toEqual(12);
    expect(matches[0].url).toEqual("mailto:username@example.com");
    expect(matches[1].url).toEqual("mailto:someone@subdomain.example.com");
    expect(matches[2].url).toEqual("mailto:peter@abc.de");
    expect(matches[3].url).toEqual("mailto:red.teddy.b@abc.com");
    expect(matches[4].url).toEqual("mailto:abc_@gmail.com");
    expect(matches[5].url).toEqual("mailto:dummy-hi@gmail.com");
    // expect(matches[6].url).toEqual("mailto:df@gmail.com");
    expect(matches[7].url).toEqual("mailto:john@yahoo.com");
    expect(matches[8].url).toEqual("mailto:abc@xyz.org");
    // expect(matches[9].url).toEqual("mailto:abc@xyz.org");
    expect(matches[10].url).toEqual("mailto:fan@g.com");
    expect(matches[11].url).toEqual("mailto:CAP.cap@Gmail.Com");
  });

  it("should correctly handle complex or edge cases", function () {
    const links = [
      "https://example.com/path/to/page?query=param&another=val#section",
      "www.example.com/resource/(parentheses)-allowed/",
      "http://example.com/path_with_underscores",
      "http://www.example.com:8080/port/test",
      "https://example.com/encoded%20spaces%20in%20path",
      "mailto:hello+world@example.com",
      "www.abc.com/#%%^&&*(",
      "www.a.com/#a=@?q=rr&r=y",
      "http://a.com/1/2/3/4\\5\\6",
      "http://www.example.com/foo;bar",
    ];
    const matches = Autolinker.findLinks(links.join("\n"));
    expect(matches.length).toEqual(10);
    expect(matches[0].url).toEqual(
      "https://example.com/path/to/page?query=param&another=val#section"
    );
    expect(matches[1].url).toEqual(
      "http://www.example.com/resource/(parentheses)-allowed/"
    );
    expect(matches[2].url).toEqual("http://example.com/path_with_underscores");
    expect(matches[3].url).toEqual("http://www.example.com:8080/port/test");
    expect(matches[4].url).toEqual(
      "https://example.com/encoded%20spaces%20in%20path"
    );
    expect(matches[5].url).toEqual("mailto:hello+world@example.com");
    // expect(matches[6].url).toEqual("http://www.abc.com/#%%^&&*("); TODO: Fix error in regex to get this right.
    expect(matches[7].url).toEqual("http://www.a.com/#a=@?q=rr&r=y");
    expect(matches[8].url).toEqual("http://a.com/1/2/3/4/5/6");
    expect(matches[9].url).toEqual("http://www.example.com/foo;bar");
  });

  it("shouldn't find false positives", function () {
    const links = [
      "not a valid URL",
      "htp://misspelled-protocol.com",
      "example.com (missing protocol)",
      "https://[::1] (IPv6 loopback)",
      "http:// (just protocol)",
      "", // Blank.
      "http", // No colon.
      "www.", // Missing domain.
      "https-and-www", // Dash not colon.
      "http:/abc.com", // Missing slash.
      "http://((()),", // Only invalid chars in host name.
      "ftp://example.com", // Ftp scheme is not supported.
      "http:example.com", // Missing slashes.
      "http//[example.com", // Invalid IPv6 address.
      "http//[00:00:00:00:00:00", // Invalid IPv6 address.
      "http//[]", // Empty IPv6 address.
      "abc.example.com", // URL without scheme.
    ];
    const matches = Autolinker.findLinks(links.join("\n"));
    expect(matches.length).toEqual(0);
  });

  it("should correctly find links among mixed content", function () {
    const links = [
      "Here's a URL: https://example.com and an email: mailto:test@example.com",
      "www.example.com and more text",
      "Check this: http://example.com/path?query=1 and this mailto:info@domain.com",
    ];
    const matches = Autolinker.findLinks(links.join("\n"));
    expect(matches.length).toEqual(5);
    expect(matches[0].url).toEqual("https://example.com/");
    expect(matches[1].url).toEqual("mailto:test@example.com");
    expect(matches[2].url).toEqual("http://www.example.com/");
    expect(matches[3].url).toEqual("http://example.com/path?query=1");
    expect(matches[4].url).toEqual("mailto:info@domain.com");
  });

  it("should correctly work with special characters", function () {
    const links = [
      "https://example.com/path/to/page?query=value&symbol=£",
      "mailto:user.name+alias@example-domain.com",
      "http://example.com/@user",
      "https://example.com/path#@anchor",
      "www.测试.net",
      // "www.测试。net。", Not currently accepted by `createValidAbsoluteUrl`.
      "www.测试.net；",
    ];
    const matches = Autolinker.findLinks(links.join("\n"));
    expect(matches.length).toEqual(6);
    expect(matches[0].url).toEqual(
      "https://example.com/path/to/page?query=value&symbol=%C2%A3"
    );
    expect(matches[1].url).toEqual("mailto:user.name+alias@example-domain.com");
    expect(matches[2].url).toEqual("http://example.com/@user");
    expect(matches[3].url).toEqual("https://example.com/path#@anchor");
    expect(matches[4].url).toEqual("http://www.xn--0zwm56d.net/");
    expect(matches[5].url).toEqual("http://www.xn--0zwm56d.net/");
    // expect(matches[6].url).toEqual("http://www.xn--0zwm56d.net/");
  });
});
