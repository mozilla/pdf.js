/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

var FontInspector = (function FontInspectorClosure() {
  var fonts;
  var panelWidth = 300;
  var active = false;
  var fontAttribute = 'data-font-name';
  function removeSelection() {
    var divs = document.querySelectorAll('div[' + fontAttribute + ']');
    for (var i = 0, ii = divs.length; i < ii; ++i) {
      var div = divs[i];
      div.className = '';
    }
  }
  function resetSelection() {
    var divs = document.querySelectorAll('div[' + fontAttribute + ']');
    for (var i = 0, ii = divs.length; i < ii; ++i) {
      var div = divs[i];
      div.className = 'debuggerHideText';
    }
  }
  function selectFont(fontName, show) {
    var divs = document.querySelectorAll('div[' + fontAttribute + '=' +
                                         fontName + ']');
    for (var i = 0, ii = divs.length; i < ii; ++i) {
      var div = divs[i];
      div.className = show ? 'debuggerShowText' : 'debuggerHideText';
    }
  }
  function textLayerClick(e) {
    if (!e.target.dataset.fontName || e.target.tagName != 'DIV')
      return;
    var fontName = e.target.dataset.fontName;
    var selects = document.getElementsByTagName('input');
    for (var i = 0; i < selects.length; ++i) {
      var select = selects[i];
      if (select.dataset.fontName != fontName) continue;
      select.checked = !select.checked;
      selectFont(fontName, select.checked);
      select.scrollIntoView();
    }
  }
  return {
    // Poperties/functions needed by PDFBug.
    id: 'FontInspector',
    name: 'Font Inspector',
    panel: null,
    manager: null,
    init: function init() {
      var panel = this.panel;
      panel.setAttribute('style', 'padding: 5px;');
      var tmp = document.createElement('button');
      tmp.addEventListener('click', resetSelection);
      tmp.textContent = 'Refresh';
      panel.appendChild(tmp);

      fonts = document.createElement('div');
      panel.appendChild(fonts);
    },
    enabled: false,
    get active() {
      return active;
    },
    set active(value) {
      active = value;
      if (active) {
        document.body.addEventListener('click', textLayerClick, true);
        resetSelection();
      } else {
        document.body.removeEventListener('click', textLayerClick, true);
        removeSelection();
      }
    },
    // FontInspector specific functions.
    fontAdded: function fontAdded(fontObj, url) {
      function properties(obj, list) {
        var moreInfo = document.createElement('table');
        for (var i = 0; i < list.length; i++) {
          var tr = document.createElement('tr');
          var td1 = document.createElement('td');
          td1.textContent = list[i];
          tr.appendChild(td1);
          var td2 = document.createElement('td');
          td2.textContent = obj[list[i]].toString();
          tr.appendChild(td2);
          moreInfo.appendChild(tr);
        }
        return moreInfo;
      }
      var moreInfo = properties(fontObj, ['name', 'type']);
      var m = /url\(['"]?([^\)"']+)/.exec(url);
      var fontName = fontObj.loadedName;
      var font = document.createElement('div');
      var name = document.createElement('span');
      name.textContent = fontName;
      var download = document.createElement('a');
      download.href = m[1];
      download.textContent = 'Download';
      var logIt = document.createElement('a');
      logIt.href = '';
      logIt.textContent = 'Log';
      logIt.addEventListener('click', function(event) {
        event.preventDefault();
        console.log(fontObj);
      });
      var select = document.createElement('input');
      select.setAttribute('type', 'checkbox');
      select.dataset.fontName = fontName;
      select.addEventListener('click', (function(select, fontName) {
        return (function() {
           selectFont(fontName, select.checked);
        });
      })(select, fontName));
      font.appendChild(select);
      font.appendChild(name);
      font.appendChild(document.createTextNode(' '));
      font.appendChild(download);
      font.appendChild(document.createTextNode(' '));
      font.appendChild(logIt);
      font.appendChild(moreInfo);
      fonts.appendChild(font);
      // Somewhat of a hack, should probably add a hook for when the text layer
      // is done rendering.
      setTimeout(function() {
        if (this.active)
          resetSelection();
      }.bind(this), 2000);
    }
  };
})();

// Manages all the page steppers.
var StepperManager = (function StepperManagerClosure() {
  var steppers = [];
  var stepperDiv = null;
  var stepperControls = null;
  var stepperChooser = null;
  var breakPoints = {};
  return {
    // Poperties/functions needed by PDFBug.
    id: 'Stepper',
    name: 'Stepper',
    panel: null,
    manager: null,
    init: function init() {
      var self = this;
      this.panel.setAttribute('style', 'padding: 5px;');
      stepperControls = document.createElement('div');
      stepperChooser = document.createElement('select');
      stepperChooser.addEventListener('change', function(event) {
        self.selectStepper(this.value);
      });
      stepperControls.appendChild(stepperChooser);
      stepperDiv = document.createElement('div');
      this.panel.appendChild(stepperControls);
      this.panel.appendChild(stepperDiv);
      if (sessionStorage.getItem('pdfjsBreakPoints'))
        breakPoints = JSON.parse(sessionStorage.getItem('pdfjsBreakPoints'));
    },
    enabled: false,
    active: false,
    // Stepper specific functions.
    create: function create(pageNumber) {
      var debug = document.createElement('div');
      debug.id = 'stepper' + pageNumber;
      debug.setAttribute('hidden', true);
      debug.className = 'stepper';
      stepperDiv.appendChild(debug);
      var b = document.createElement('option');
      b.textContent = 'Page ' + (pageNumber + 1);
      b.value = pageNumber;
      stepperChooser.appendChild(b);
      var initBreakPoints = breakPoints[pageNumber] || [];
      var stepper = new Stepper(debug, pageNumber, initBreakPoints);
      steppers.push(stepper);
      if (steppers.length === 1)
        this.selectStepper(pageNumber, false);
      return stepper;
    },
    selectStepper: function selectStepper(pageNumber, selectPanel) {
      if (selectPanel)
        this.manager.selectPanel(1);
      for (var i = 0; i < steppers.length; ++i) {
        var stepper = steppers[i];
        if (stepper.pageNumber == pageNumber)
          stepper.panel.removeAttribute('hidden');
        else
          stepper.panel.setAttribute('hidden', true);
      }
      var options = stepperChooser.options;
      for (var i = 0; i < options.length; ++i) {
        var option = options[i];
        option.selected = option.value == pageNumber;
      }
    },
    saveBreakPoints: function saveBreakPoints(pageNumber, bps) {
      breakPoints[pageNumber] = bps;
      sessionStorage.setItem('pdfjsBreakPoints', JSON.stringify(breakPoints));
    }
  };
})();

// The stepper for each page's IRQueue.
var Stepper = (function StepperClosure() {
  function Stepper(panel, pageNumber, initialBreakPoints) {
    this.panel = panel;
    this.len;
    this.breakPoint = 0;
    this.nextBreakPoint = null;
    this.pageNumber = pageNumber;
    this.breakPoints = initialBreakPoints;
    this.currentIdx = -1;
  }
  Stepper.prototype = {
    init: function init(IRQueue) {
      // Shorter way to create element and optionally set textContent.
      function c(tag, textContent) {
        var d = document.createElement(tag);
        if (textContent)
          d.textContent = textContent;
        return d;
      }
      var panel = this.panel;
      this.len = IRQueue.fnArray.length;
      var content = c('div', 'c=continue, s=step');
      var table = c('table');
      content.appendChild(table);
      table.cellSpacing = 0;
      var headerRow = c('tr');
      table.appendChild(headerRow);
      headerRow.appendChild(c('th', 'Break'));
      headerRow.appendChild(c('th', 'Idx'));
      headerRow.appendChild(c('th', 'fn'));
      headerRow.appendChild(c('th', 'args'));

      for (var i = 0; i < IRQueue.fnArray.length; i++) {
        var line = c('tr');
        line.className = 'line';
        line.dataset.idx = i;
        table.appendChild(line);
        var checked = this.breakPoints.indexOf(i) != -1;
        var args = IRQueue.argsArray[i] ? IRQueue.argsArray[i] : [];

        var breakCell = c('td');
        var cbox = c('input');
        cbox.type = 'checkbox';
        cbox.className = 'points';
        cbox.checked = checked;
        var self = this;
        cbox.onclick = (function(x) {
          return function() {
            if (this.checked)
              self.breakPoints.push(x);
            else
              self.breakPoints.splice(self.breakPoints.indexOf(x), 1);
            StepperManager.saveBreakPoints(self.pageNumber, self.breakPoints);
          }
        })(i);

        breakCell.appendChild(cbox);
        line.appendChild(breakCell);
        line.appendChild(c('td', i.toString()));
        line.appendChild(c('td', IRQueue.fnArray[i]));
        line.appendChild(c('td', args.join(', ')));
      }
      panel.appendChild(content);
      var self = this;
    },
    getNextBreakPoint: function getNextBreakPoint() {
      this.breakPoints.sort(function(a, b) { return a - b; });
      for (var i = 0; i < this.breakPoints.length; i++) {
        if (this.breakPoints[i] > this.currentIdx)
          return this.breakPoints[i];
      }
      return null;
    },
    breakIt: function breakIt(idx, callback) {
      StepperManager.selectStepper(this.pageNumber, true);
      var self = this;
      var dom = document;
      self.currentIdx = idx;
      var listener = function(e) {
        switch (e.keyCode) {
          case 83: // step
            dom.removeEventListener('keydown', listener, false);
            self.nextBreakPoint = self.currentIdx + 1;
            self.goTo(-1);
            callback();
            break;
          case 67: // continue
            dom.removeEventListener('keydown', listener, false);
            var breakPoint = self.getNextBreakPoint();
            self.nextBreakPoint = breakPoint;
            self.goTo(-1);
            callback();
            break;
        }
      }
      dom.addEventListener('keydown', listener, false);
      self.goTo(idx);
    },
    goTo: function goTo(idx) {
      var allRows = this.panel.getElementsByClassName('line');
      for (var x = 0, xx = allRows.length; x < xx; ++x) {
        var row = allRows[x];
        if (row.dataset.idx == idx) {
          row.style.backgroundColor = 'rgb(251,250,207)';
          row.scrollIntoView();
        } else {
          row.style.backgroundColor = null;
        }
      }
    }
  };
  return Stepper;
})();

var Stats = (function Stats() {
  var stats = [];
  function clear(node) {
    while (node.hasChildNodes())
      node.removeChild(node.lastChild);
  }
  function getStatIndex(pageNumber) {
    for (var i = 0, ii = stats.length; i < ii; ++i)
      if (stats[i].pageNumber === pageNumber)
        return i;
    return false;
  }
  return {
    // Poperties/functions needed by PDFBug.
    id: 'Stats',
    name: 'Stats',
    panel: null,
    manager: null,
    init: function init() {
      this.panel.setAttribute('style', 'padding: 5px;');
      PDFJS.enableStats = true;
    },
    enabled: false,
    active: false,
    // Stats specific functions.
    add: function(pageNumber, stat) {
      if (!stat)
        return;
      var statsIndex = getStatIndex(pageNumber);
      if (statsIndex !== false) {
        var b = stats[statsIndex];
        this.panel.removeChild(b.div);
        stats.splice(statsIndex, 1);
      }
      var wrapper = document.createElement('div');
      wrapper.className = 'stats';
      var title = document.createElement('div');
      title.className = 'title';
      title.textContent = 'Page: ' + pageNumber;
      var statsDiv = document.createElement('div');
      statsDiv.textContent = stat.toString();
      wrapper.appendChild(title);
      wrapper.appendChild(statsDiv);
      stats.push({ pageNumber: pageNumber, div: wrapper });
      stats.sort(function(a, b) { return a.pageNumber - b.pageNumber});
      clear(this.panel);
      for (var i = 0, ii = stats.length; i < ii; ++i)
        this.panel.appendChild(stats[i].div);
    }
  };
})();

// Manages all the debugging tools.
var PDFBug = (function PDFBugClosure() {
  var panelWidth = 300;
  var buttons = [];
  var activePanel = null;

  return {
    tools: [
      FontInspector,
      StepperManager,
      Stats
    ],
    enable: function(ids) {
      var all = false, tools = this.tools;
      if (ids.length === 1 && ids[0] === 'all')
        all = true;
      for (var i = 0; i < tools.length; ++i) {
        var tool = tools[i];
        if (all || ids.indexOf(tool.id) !== -1)
          tool.enabled = true;
      }
      if (!all) {
        // Sort the tools by the order they are enabled.
        tools.sort(function(a, b) {
          var indexA = ids.indexOf(a.id);
          indexA = indexA < 0 ? tools.length : indexA;
          var indexB = ids.indexOf(b.id);
          indexB = indexB < 0 ? tools.length : indexB;
          return indexA - indexB;
        });
      }
    },
    init: function init() {
      /*
       * Basic Layout:
       * PDFBug
       *  Controls
       *  Panels
       *    Panel
       *    Panel
       *    ...
       */
      var ui = document.createElement('div');
      ui.id = 'PDFBug';

      var controls = document.createElement('div');
      controls.setAttribute('class', 'controls');
      ui.appendChild(controls);

      var panels = document.createElement('div');
      panels.setAttribute('class', 'panels');
      ui.appendChild(panels);

      document.body.appendChild(ui);
      document.body.style.paddingRight = panelWidth + 'px';

      // Initialize all the debugging tools.
      var tools = this.tools;
      for (var i = 0; i < tools.length; ++i) {
        var tool = tools[i];
        var panel = document.createElement('div');
        var panelButton = document.createElement('button');
        panelButton.textContent = tool.name;
        var self = this;
        panelButton.addEventListener('click', (function(selected) {
          return function(event) {
            event.preventDefault();
            self.selectPanel(selected);
          };
        })(i));
        controls.appendChild(panelButton);
        panels.appendChild(panel);
        tool.panel = panel;
        tool.manager = this;
        if (tool.enabled)
          tool.init();
        else
          panel.textContent = tool.name + ' is disabled. To enable add ' +
                              ' "' + tool.id + '" to the pdfBug parameter ' +
                              'and refresh (seperate multiple by commas).';
        buttons.push(panelButton);
      }
      this.selectPanel(0);
    },
    selectPanel: function selectPanel(index) {
      if (index === activePanel)
        return;
      activePanel = index;
      var tools = this.tools;
      for (var j = 0; j < tools.length; ++j) {
        if (j == index) {
          buttons[j].setAttribute('class', 'active');
          tools[j].active = true;
          tools[j].panel.removeAttribute('hidden');
        } else {
          buttons[j].setAttribute('class', '');
          tools[j].active = false;
          tools[j].panel.setAttribute('hidden', 'true');
        }
      }
    }
  };
})();
