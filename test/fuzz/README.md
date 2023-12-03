# Fuzz Testing

Fuzz testing is:

> An automated software testing technique that involves providing invalid, unexpected, or random data as inputs to a program.

We use coverage guided fuzz testing to automatically discover bugs in PDF.js.

This `fuzz/` directory contains the configuration and the fuzz tests for PDF.js.
To generate and run fuzz tests, we use the [Jazzer.js](https://github.com/CodeIntelligenceTesting/jazzer.js/) library.

## Running a fuzzer

This directory contains fuzzers like for example `jpeg_image.fuzz`. You can run it with:

Generate image decoders:
```sh
$ gulp image_decoders
```

Run fuzz target:
```sh
$ npx jazzer fuzz/jpeg_image.fuzz --sync
```

You should see output that looks something like this:

```
#2      INITED exec/s: 0 rss: 128Mb
#65536  pulse  corp: 1/1b lim: 652 exec/s: 32768 rss: 140Mb
#131072 pulse  corp: 1/1b lim: 1300 exec/s: 32768 rss: 140Mb
#262144 pulse  corp: 1/1b lim: 2611 exec/s: 32768 rss: 140Mb
#524288 pulse  corp: 1/1b lim: 4096 exec/s: 30840 rss: 140Mb
#1048576        pulse  corp: 1/1b lim: 4096 exec/s: 29959 rss: 140Mb
#2097152        pulse  corp: 1/1b lim: 4096 exec/s: 29537 rss: 140Mb
```

It will continue to generate random inputs forever, until it finds a
bug or is terminated. The testcases for bugs it finds can be seen in
the form of `crash-*` or `timeout-*` at the place from where command is run.
You can rerun the fuzzer on a single input by passing it on the
command line `npx jazzer fuzz/jpeg_image.fuzz /path/to/testcase`.
