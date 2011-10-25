#!/usr/bin/env python
# Python port of Ian Piumarta's watch.c
# BSD Licensed - http://eschew.org/txt/bsd.txt

import re
import os
import sys
import time
import string
import subprocess

maxfiles = 64

def usage():
  return """usage: %(watch)s <paths...> - <commands...>
  <paths...> is/are the file/s to be monitored
  <commands...> is/are the commands to execute (quote if args required)
  Note: occurrences of '${file}' in command strings will be replaced
    with updated filename before execution.
      e.g.:   %(watch)s *.txt - 'echo ${file}'
""" % { 'watch': sys.argv[0] }

def try_get_mtime(path):
  try:
    buf = os.stat(path)
  except OSError:
    time.sleep(1)
    try:
      buf = os.stat(path)
    except OSError:
      print "%(watch)s: %(file)s: file not found"
      sys.exit(1)
  return buf.st_mtime

def execute_commands(commands, filename):
  for command in commands:
    cmd = string.Template(command).safe_substitute(file=filename)
    cmd_pieces = re.split('\s+', cmd)
    subprocess.Popen(cmd_pieces)

def main():
  files = []
  commands = []
  seeing_paths = True
  for part in sys.argv[1:]:
    if part == '-':
      seeing_paths = False
    elif seeing_paths:
      files.append(part)
    else:
      commands.append(part)

  if len(commands) == 0:
    print usage()
    sys.exit(1)

  if len(files) > maxfiles:
    print "%(watch)s: too many files to watch" % sys.argv[0]

  mtimes = dict([(f, try_get_mtime(f)) for f in files])
  done = False
  while not done:
    for f in files:
      old_mtime = mtimes[f]
      new_mtime = try_get_mtime(f)
      if new_mtime != old_mtime:
        mtimes[f] = new_mtime
        execute_commands(commands, f)
    time.sleep(1)

if __name__ == '__main__':
  try:
    main()
  except KeyboardInterrupt:
    sys.exit(0)


