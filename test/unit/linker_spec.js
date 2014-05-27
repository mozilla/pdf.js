/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* globals expect, it, describe */

'use strict';

describe('Linker', function() {
  var textDiv, children;

  beforeEach(function() {
    children = [];
    textDiv = {
      textContent: null,
      appendChild: function(child) {
        children.push(child);
      }
    };
  });

  it('should not change the text when no link is present', function() {
    var text = 'Just a text without a link.';
    Linker.link(text, textDiv);
    expect(textDiv.textContent).toBe(text);
  });

  it('should convert single links to a-tag', function() {
    var text = 'https://www.mozilla.org/';
    spyOn(textDiv, 'appendChild').andCallThrough();

    Linker.link(text, textDiv);
    expect(textDiv.appendChild).toHaveBeenCalled();

    var a = children[0];
    expect(a.tagName.toLowerCase()).toBe('a');
    expect(a.href).toBe('https://www.mozilla.org/');
    expect(a.textContent).toBe('https://www.mozilla.org/');
  });

  it('should convert link within a sentence to a-tag', function() {
    var text = 'Check out https://www.mozilla.org/ for more information.';
    spyOn(textDiv, 'appendChild').andCallThrough();

    Linker.link(text, textDiv);
    expect(textDiv.appendChild).toHaveBeenCalled();

    var span1 = children[0];
    expect(span1.tagName.toLowerCase()).toBe('span');
    expect(span1.textContent).toBe('Check out ');

    var a = children[1];
    expect(a.tagName.toLowerCase()).toBe('a');
    expect(a.href).toBe('https://www.mozilla.org/');
    expect(a.textContent).toBe('https://www.mozilla.org/');

    var span2 = children[2];
    expect(span2.tagName.toLowerCase()).toBe('span');
    expect(span2.textContent).toBe(' for more information.');
  });

  it('should convert multiple links within a sentence to a-tag', function() {
    var text = 'www.mozilla.org and https://mozilla.github.io/pdf.js/ has more informations.';
    spyOn(textDiv, 'appendChild').andCallThrough();

    Linker.link(text, textDiv);
    expect(textDiv.appendChild).toHaveBeenCalled();

    var a1 = children[0];
    console.log(a1);
    expect(a1.tagName.toLowerCase()).toBe('a');
    expect(a1.href).toBe('http://www.mozilla.org/');
    expect(a1.textContent).toBe('www.mozilla.org');

    var span1 = children[1];
    expect(span1.tagName.toLowerCase()).toBe('span');
    expect(span1.textContent).toBe(' and ');

    var a2 = children[2];
    expect(a2.tagName.toLowerCase()).toBe('a');
    expect(a2.href).toBe('https://mozilla.github.io/pdf.js/');
    expect(a2.textContent).toBe('https://mozilla.github.io/pdf.js/');

    var span2 = children[3];
    expect(span2.tagName.toLowerCase()).toBe('span');
    expect(span2.textContent).toBe(' has more informations.');
  });

});
