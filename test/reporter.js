"use strict";

module.exports = {
  reporter: function (res) {
    var len = 0;
    var str = "";

    res.forEach(function (r) {
      var file = r.file;
      var err = r.error;

      switch(err.code) {
        case 'W004': // variable is already defined
        case 'W018': // confusing use of !
          break;
        default:
          len++;
          str += file + ": line " + err.line + ", col " +
            err.character + ", " + err.reason + "\n";
      }
    });

    if (str) {
      process.stdout.write(str + "\n" + len + " error" +
        ((len === 1) ? "" : "s") + "\n");
    }
  }
};
