#!/bin/sh

git diff c492736c^ --numstat | egrep -w '(js|html|css)$' | node count_loc.cjs