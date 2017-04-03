#!/bin/bash

npm install

# Setup the virtual frame buffer and export the DISPLAY env variable
Xvfb :1 -screen 5 1024x768x8 &
# Grab the PID of Xvfb so we can kill it after the unit tests are done
XVFB_PID=$!
export DISPLAY=:1.5

# Unit Tests
./node_modules/gulp/bin/gulp.js unittest
kill $XVFB_PID

# Lint
./node_modules/gulp/bin/gulp.js lint
