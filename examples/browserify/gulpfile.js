const gulp = require("gulp");
const browserify = require("browserify");
const streamify = require("gulp-streamify");
const rename = require("gulp-rename");
const uglify = require("gulp-uglify");
const source = require("vinyl-source-stream");

const OUTPUT_PATH = "../../build/browserify";
const TMP_FILE_PREFIX = "../../build/browserify_";

gulp.task("build-bundle", function () {
  return browserify("main.js", { output: TMP_FILE_PREFIX + "main.tmp" })
    .ignore(require.resolve("pdfjs-dist/build/pdf.worker")) // Reducing size
    .bundle()
    .pipe(source(TMP_FILE_PREFIX + "main.tmp"))
    .pipe(streamify(uglify()))
    .pipe(rename("main.bundle.js"))
    .pipe(gulp.dest(OUTPUT_PATH));
});

gulp.task("build-worker", function () {
  // We can create our own viewer (see worker.js) or use already defined one.
  const workerSrc = require.resolve("pdfjs-dist/build/pdf.worker.entry");
  return browserify(workerSrc, { output: TMP_FILE_PREFIX + "worker.tmp" })
    .bundle()
    .pipe(source(TMP_FILE_PREFIX + "worker.tmp"))
    .pipe(
      streamify(
        uglify({
          compress: {
            sequences: false, // Chrome has issue with the generated code if true
          },
        })
      )
    )
    .pipe(rename("pdf.worker.bundle.js"))
    .pipe(gulp.dest(OUTPUT_PATH));
});

gulp.task("build", gulp.series("build-bundle", "build-worker"));
