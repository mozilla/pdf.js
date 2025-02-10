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

function testLinks(links) {
  const matches = Autolinker.findLinks(links.map(link => link[0]).join("\n"));
  expect(matches.length).toEqual(links.length);
  for (let i = 0; i < links.length; i++) {
    expect(matches[i].url).toEqual(links[i][1]);
  }
}

describe("autolinker", function () {
  it("should correctly find URLs", function () {
    const [matched] = Autolinker.findLinks("http://www.example.com");
    expect(matched.url).toEqual("http://www.example.com/");
  });

  it("should correctly find simple valid URLs", function () {
    testLinks([
      [
        "http://subdomain.example.com/path/to/page?query=param",
        "http://subdomain.example.com/path/to/page?query=param",
      ],
      [
        "www.example.com/path/to/resource",
        "http://www.example.com/path/to/resource",
      ],
      [
        "http://example.com/path?query=value#fragment",
        "http://example.com/path?query=value#fragment",
      ],
    ]);
  });

  it("should correctly find emails", function () {
    testLinks([
      ["mailto:username@example.com", "mailto:username@example.com"],
      [
        "mailto:someone@subdomain.example.com",
        "mailto:someone@subdomain.example.com",
      ],
      ["peter@abc.de", "mailto:peter@abc.de"],
      ["red.teddy.b@abc.com", "mailto:red.teddy.b@abc.com"],
      [
        "abc_@gmail.com", // '_' is ok before '@'.
        "mailto:abc_@gmail.com",
      ],
      [
        "dummy-hi@gmail.com", // '-' is ok in user name.
        "mailto:dummy-hi@gmail.com",
      ],
      [
        "a..df@gmail.com", // Stop at consecutive '.'.
        "mailto:a..df@gmail.com",
      ],
      [
        ".john@yahoo.com", // Remove heading '.'.
        "mailto:john@yahoo.com",
      ],
      [
        "abc@xyz.org?/", // Trim ending invalid chars.
        "mailto:abc@xyz.org",
      ],
      [
        "fan{abc@xyz.org", // Trim beginning invalid chars.
        "mailto:abc@xyz.org",
      ],
      [
        "fan@g.com..", // Trim the ending periods.
        "mailto:fan@g.com",
      ],
      [
        "CAP.cap@Gmail.Com", // Keep the original case.
        "mailto:CAP.cap@Gmail.Com",
      ],
      ["partl@mail.boku.ac.at", "mailto:partl@mail.boku.ac.at"],
      ["Irene.Hyna@bmwf.ac.at", "mailto:Irene.Hyna@bmwf.ac.at"],
      ["<hi@foo.bar.baz>", "mailto:hi@foo.bar.baz"],
    ]);
  });

  it("should correctly handle complex or edge cases", function () {
    testLinks([
      [
        "https://example.com/path/to/page?query=param&another=val#section",
        "https://example.com/path/to/page?query=param&another=val#section",
      ],
      [
        "www.example.com/resource/(parentheses)-allowed/",
        "http://www.example.com/resource/(parentheses)-allowed/",
      ],
      [
        "http://example.com/path_with_underscores",
        "http://example.com/path_with_underscores",
      ],
      [
        "http://www.example.com:8080/port/test",
        "http://www.example.com:8080/port/test",
      ],
      [
        "https://example.com/encoded%20spaces%20in%20path",
        "https://example.com/encoded%20spaces%20in%20path",
      ],
      ["mailto:hello+world@example.com", "mailto:hello+world@example.com"],
      ["www.a.com/#a=@?q=rr&r=y", "http://www.a.com/#a=@?q=rr&r=y"],
      ["http://a.com/1/2/3/4\\5\\6", "http://a.com/1/2/3/4/5/6"],
      ["http://www.example.com/foo;bar", "http://www.example.com/foo;bar"],
      // ["www.abc.com/#%%^&&*(", "http://www.abc.com/#%%^&&*("], TODO: Patch the regex to accept the whole URL.
    ]);
  });

  it("shouldn't find false positives", function () {
    const matches = Autolinker.findLinks(
      [
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
        "JD?M$0QP)lKn06l1apKDC@\\qJ4B!!(5m+j.7F790m", // Not a valid email.
      ].join("\n")
    );
    expect(matches.length).toEqual(0);
  });

  it("should correctly find links among mixed content", function () {
    const matches = Autolinker.findLinks(
      [
        "Here's a URL: https://example.com and an email: mailto:test@example.com",
        "www.example.com and more text",
        "Check this: http://example.com/path?query=1 and this mailto:info@domain.com",
      ].join("\n")
    );
    expect(matches.length).toEqual(5);
    expect(matches[0].url).toEqual("https://example.com/");
    expect(matches[1].url).toEqual("mailto:test@example.com");
    expect(matches[2].url).toEqual("http://www.example.com/");
    expect(matches[3].url).toEqual("http://example.com/path?query=1");
    expect(matches[4].url).toEqual("mailto:info@domain.com");
  });

  it("should correctly work with special characters", function () {
    testLinks([
      [
        "https://example.com/path/to/page?query=value&symbol=£",
        "https://example.com/path/to/page?query=value&symbol=%C2%A3",
      ],
      [
        "mailto:user.name+alias@example-domain.com",
        "mailto:user.name+alias@example-domain.com",
      ],
      ["http://example.com/@user", "http://example.com/@user"],
      ["https://example.com/path#@anchor", "https://example.com/path#@anchor"],
      ["www.测试.net", "http://www.xn--0zwm56d.net/"],
      ["www.测试.net；", "http://www.xn--0zwm56d.net/"],
      // [ "www.测试。net。", "http://www.xn--0zwm56d.net/" ] TODO: Patch `createValidAbsoluteUrl` to accept this.
    ]);
  });

  it("should correctly find links with dashes and newlines between numbers", function () {
    const matches = Autolinker.findLinks("http://abcd.efg/test1-\n2/test.html");
    expect(matches.length).toEqual(1);
    expect(matches[0].url).toEqual("http://abcd.efg/test1-2/test.html");
  });

  it("should correctly identify emails with special prefixes", function () {
    testLinks([
      ["wwwtest@email.com", "mailto:wwwtest@email.com"],
      ["httptest@email.com", "mailto:httptest@email.com"],
    ]);
  });
});
