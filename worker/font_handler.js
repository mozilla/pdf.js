var WorkerFontHandler = {
  setup: function(handler) {
    handler.on("font", function(data) {  
      var objId      = data[0];
      var name       = data[1];
      var file       = data[2];
      var properties = data[3];

      var font = {
        name: name,
        file: file,
        properties: properties
      };

      // Some fonts don't have a file, e.g. the build in ones like Arial.
      if (file) {
        var fontFileDict = new Dict();
        fontFileDict.map = file.dict.map;

        var fontFile = new Stream(file.bytes, file.start,
                                  file.end - file.start, fontFileDict);
                         
        // Check if this is a FlateStream. Otherwise just use the created 
        // Stream one. This makes complex_ttf_font.pdf work.
        var cmf = file.bytes[0];
        if ((cmf & 0x0f) == 0x08) {
          font.file = new FlateStream(fontFile);
        } else {
          font.file = fontFile;
        }          
      }

      var obj = new Font(font.name, font.file, font.properties);

      var str = '';
      var data = obj.data;
      if (data) {
        var length = data.length;
        for (var j = 0; j < length; j++)
          str += String.fromCharCode(data[j]);
      }

      obj.str = str;

      // Remove the data array form the font object, as it's not needed
      // anymore as we sent over the ready str.
      delete obj.data;

      handler.send("font_ready", [objId, obj]);
    });
  }
}
