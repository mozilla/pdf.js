var Metadata = (function MetadataClosure() {
  function Metadata(meta) {
    if (typeof meta === 'string') {
      var parser = new DOMParser();
      meta = parser.parseFromString(meta, 'application/xml');
    } else if (!(meta instanceof Document)) {
      error('Metadata: Invalid metadata object');
    }

    this.metaDocument = meta;
    this.metadata = {};
    this.parse();
  }

  Metadata.prototype = {
    parse: function() {
      var doc = this.metaDocument;
      var rdf = doc.documentElement;
      if (rdf.tagName.toLowerCase() !== 'rdf:rdf') { // Wrapped in <xmpmeta>
        rdf = rdf.firstChild;
        while (rdf.nodeName && rdf.nodeName.toLowerCase() !== 'rdf:rdf') {
          rdf = rdf.nextSibling;
        }
      }
      if (rdf.nodeName.toLowerCase() !== 'rdf:rdf' || !rdf.hasChildNodes()) {
        return;
      }

      var childNodes = rdf.childNodes, desc, namespace, entries, entry;

      for (var i = 0, length = childNodes.length; i < length; i++) {
        desc = childNodes[i];
        if (desc.nodeName.toLowerCase() !== 'rdf:description') {
          continue;
        }

        entries = [];
        for (var ii = 0, iLength = desc.childNodes.length; ii < iLength; ii++) {
          if (desc.childNodes[ii].nodeName.toLowerCase() !== '#text') {
            entries.push(desc.childNodes[ii]);
          }
        }

        for (ii = 0, iLength = entries.length; ii < iLength; ii++) {
          var entry = entries[ii];
          var name = entry.nodeName.toLowerCase();
          var entryName = name.split(':');
          entryName = (entryName.length > 1) ? entryName[1] : entryName[0];
          switch (name) {
            case 'pdf:moddate':
            case 'xap:createdate':
            case 'xap:metadatadate':
            case 'xap:modifydate':
              this.metadata[entryName] = new Date(entry.textContent.trim());
              break;

            default:
              // For almost all entries we just add them to the metadata object
              if (this.metadata[entryName]) {
                this.metadata[name] = entry.textContent.trim();
              } else {
                this.metadata[entryName] = entry.textContent.trim();
              }
              break;
          }
        }
      }
    },

    get: function(name) {
      return this.metadata[name] || null;
    },

    has: function(name) {
      return typeof this.metadata[name] !== 'undefined';
    }
  };

  return Metadata;
})();
