# Copyright 2012 Mozilla Foundation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import json, platform, os, shutil, sys, subprocess, tempfile, threading
import time, urllib, urllib2, hashlib, re, base64, uuid, socket, errno
import traceback
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from SocketServer import ThreadingMixIn
from optparse import OptionParser
from urlparse import urlparse, parse_qs
from threading import Lock

USAGE_EXAMPLE = "%prog"

# The local web server uses the git repo as the document root.
DOC_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),".."))

GIT_CLONE_CHECK = True
DEFAULT_MANIFEST_FILE = 'test_manifest.json'
EQLOG_FILE = 'eq.log'
BROWSERLOG_FILE = 'browser.log'
REFDIR = 'ref'
TEST_SNAPSHOTS = 'test_snapshots'
TMPDIR = 'tmp'
VERBOSE = False
BROWSER_TIMEOUT = 120

SERVER_HOST = "localhost"

lock = Lock()

class TestOptions(OptionParser):
    def __init__(self, **kwargs):
        OptionParser.__init__(self, **kwargs)
        self.add_option("-m", "--masterMode", action="store_true", dest="masterMode",
                        help="Run the script in master mode.", default=False)
        self.add_option("--noPrompts", action="store_true", dest="noPrompts",
                        help="Uses default answers (intended for CLOUD TESTS only!).", default=False)
        self.add_option("--manifestFile", action="store", type="string", dest="manifestFile",
                        help="A JSON file in the form of test_manifest.json (the default).")
        self.add_option("-b", "--browser", action="store", type="string", dest="browser",
                        help="The path to a single browser (right now, only Firefox is supported).")
        self.add_option("--browserManifestFile", action="store", type="string",
                        dest="browserManifestFile",
                        help="A JSON file in the form of those found in resources/browser_manifests")
        self.add_option("--reftest", action="store_true", dest="reftest",
                        help="Automatically start reftest showing comparison test failures, if there are any.",
                        default=False)
        self.add_option("--port", action="store", dest="port", type="int",
                        help="The port the HTTP server should listen on.", default=8080)
        self.add_option("--unitTest", action="store_true", dest="unitTest",
                        help="Run the unit tests.", default=False)
        self.add_option("--fontTest", action="store_true", dest="fontTest",
                        help="Run the font tests.", default=False)
        self.add_option("--noDownload", action="store_true", dest="noDownload",
                        help="Skips test PDFs downloading.", default=False)
        self.add_option("--statsFile", action="store", dest="statsFile", type="string",
                        help="The file where to store stats.", default=None)
        self.add_option("--statsDelay", action="store", dest="statsDelay", type="int",
                        help="The amount of time in milliseconds the browser should wait before starting stats.", default=10000)
        self.set_usage(USAGE_EXAMPLE)

    def verifyOptions(self, options):
        if options.reftest and (options.unitTest or options.fontTest):
            self.error("--reftest and --unitTest/--fontTest must not be specified at the same time.")
        if options.masterMode and options.manifestFile:
            self.error("--masterMode and --manifestFile must not be specified at the same time.")
        if not options.manifestFile:
            options.manifestFile = DEFAULT_MANIFEST_FILE
        if options.browser and options.browserManifestFile:
            print "Warning: ignoring browser argument since manifest file was also supplied"
        if not options.browser and not options.browserManifestFile:
            print "Starting server on port %s." % options.port
        if not options.statsFile:
            options.statsDelay = 0

        return options
        

def prompt(question):
    '''Return True iff the user answered "yes" to |question|.'''
    inp = raw_input(question +' [yes/no] > ')
    return inp == 'yes'

MIMEs = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.xhtml': 'application/xhtml+xml',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.log': 'text/plain',
    '.properties': 'text/plain'
}

class State:
    browsers = [ ]
    manifest = { }
    taskResults = { }
    remaining = { }
    results = { }
    done = False
    numErrors = 0
    numEqFailures = 0
    numEqNoSnapshot = 0
    numFBFFailures = 0
    numLoadFailures = 0
    eqLog = None
    saveStats = False
    stats = [ ]
    lastPost = { }

class UnitTestState:
    browsers = [ ]
    browsersRunning = 0
    lastPost = { }
    numErrors = 0
    numRun = 0

class Result:
    def __init__(self, snapshot, failure, page):
        self.snapshot = snapshot
        self.failure = failure
        self.page = page

class TestServer(ThreadingMixIn, HTTPServer):
    pass

class TestHandlerBase(BaseHTTPRequestHandler):
    # Disable annoying noise by default
    def log_request(code=0, size=0):
        if VERBOSE:
            BaseHTTPRequestHandler.log_request(code, size)

    def handle_one_request(self):
        try:
            BaseHTTPRequestHandler.handle_one_request(self)
        except socket.error, v:
            if v[0] == errno.ECONNRESET:
                # Ignoring connection reset by peer exceptions
                if VERBOSE:
                    print 'Detected connection reset'
            elif v[0] == errno.EPIPE:
                if VERBOSE:
                    print 'Detected remote peer disconnected'
            elif v[0] == 10053:
                if VERBOSE:
                    print 'An established connection was aborted by the' \
                          ' software in your host machine'
            else:
                raise

    def finish(self,*args,**kw):
        # From http://stackoverflow.com/a/14355079/1834797
        try:
            if not self.wfile.closed:
                self.wfile.flush()
                self.wfile.close()
        except socket.error:
            pass
        self.rfile.close()

    def sendFile(self, path, ext):
        self.send_response(200)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", MIMEs[ext])
        self.send_header("Content-Length", os.path.getsize(path))
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

    def sendFileRange(self, path, ext, start, end):
        file_len = os.path.getsize(path)
        if (end is None) or (file_len < end):
          end = file_len
        if (file_len < start) or (end <= start):
          self.send_error(416)
          return
        chunk_len = end - start
        time.sleep(chunk_len / 1000000.0)
        self.send_response(206)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", MIMEs[ext])
        self.send_header("Content-Length", chunk_len)
        self.send_header("Content-Range", 'bytes ' + str(start) + '-' + str(end - 1) + '/' + str(file_len))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            self.wfile.write(f.read(chunk_len))

    def do_GET(self):
        url = urlparse(self.path)

        # Ignore query string
        path, _ = urllib.unquote_plus(url.path), url.query
        path = os.path.abspath(os.path.realpath(DOC_ROOT + os.sep + path))
        prefix = os.path.commonprefix(( path, DOC_ROOT ))
        _, ext = os.path.splitext(path.lower())

        if url.path == "/favicon.ico":
            self.sendFile(os.path.join(DOC_ROOT, "test", "resources", "favicon.ico"), ext)
            return

        if os.path.isdir(path):
            self.sendIndex(url.path, url.query)
            return

        if not (prefix == DOC_ROOT
                and os.path.isfile(path)
                and ext in MIMEs):
            print path
            self.send_error(404)
            return

        if 'Range' in self.headers:
            range_re = re.compile(r"^bytes=(\d+)\-(\d+)?")
            parsed_range = range_re.search(self.headers.getheader("Range"))
            if parsed_range is None:
                self.send_error(501)
                return
            if VERBOSE:
                print 'Range requested %s - %s: %s' % (
                    parsed_range.group(1), parsed_range.group(2))
            start = int(parsed_range.group(1))
            if parsed_range.group(2) is None:
                self.sendFileRange(path, ext, start, None)
            else:
                end = int(parsed_range.group(2)) + 1
                self.sendFileRange(path, ext, start, end)
            return

        self.sendFile(path, ext)

class UnitTestHandler(TestHandlerBase):
    def sendIndex(self, path, query):
        print "send index"

    def translateFont(self, base64Data):
        self.send_response(200)
        self.send_header("Content-Type", "text/xml")
        self.end_headers()

        data = base64.b64decode(base64Data)
        taskId = str(uuid.uuid4())
        fontPath = 'ttx/' + taskId + '.otf'
        resultPath = 'ttx/' + taskId + '.ttx'
        with open(fontPath, "wb") as f:
            f.write(data)

        # When fontTools used directly, we need to snif ttx file
        # to check what version of python is used
        ttxPath = ''
        for path in os.environ["PATH"].split(os.pathsep):
            if os.path.isfile(path + os.sep + "ttx"):
                ttxPath = path + os.sep + "ttx"
                break
        if ttxPath == '':
            self.wfile.write("<error>TTX was not found</error>")
            return

        ttxRunner = ''
        with open(ttxPath, "r") as f:
            firstLine = f.readline()
            if firstLine[:2] == '#!' and firstLine.find('python') > -1:
              ttxRunner = firstLine[2:].strip()

        with open(os.devnull, "w") as fnull:
            if ttxRunner != '':
                result = subprocess.call([ttxRunner, ttxPath, fontPath], stdout = fnull)
            else:
                result = subprocess.call([ttxPath, fontPath], stdout = fnull)

        os.remove(fontPath)

        if not os.path.isfile(resultPath):
            self.wfile.write("<error>Output was not generated</error>")
            return

        with open(resultPath, "rb") as f:
            self.wfile.write(f.read())

        os.remove(resultPath)

        return

    def do_POST(self):
        with lock:
            url = urlparse(self.path)
            numBytes = int(self.headers['Content-Length'])
            content = self.rfile.read(numBytes)

            # Process special utility requests
            if url.path == '/ttx':
                self.translateFont(content)
                return

            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()

            result = json.loads(content)
            browser = result['browser']
            UnitTestState.lastPost[browser] = int(time.time())
            if url.path == "/tellMeToQuit":
                tellAppToQuit(url.path, url.query)
                UnitTestState.browsersRunning -= 1
                UnitTestState.lastPost[browser] = None
                return
            elif url.path == '/info':
                print result['message']
            elif url.path == '/submit_task_results':
                status, description = result['status'], result['description']
                UnitTestState.numRun += 1
                if status == 'TEST-UNEXPECTED-FAIL':
                    UnitTestState.numErrors += 1
                message = status + ' | ' + description + ' | in ' + browser
                if 'error' in result:
                    message += ' | ' + result['error']
                print message
            else:
                print 'Error: uknown action' + url.path

class PDFTestHandler(TestHandlerBase):

    def sendIndex(self, path, query):
        if not path.endswith("/"):
          # we need trailing slash
          self.send_response(301)
          redirectLocation = path + "/"
          if query:
            redirectLocation += "?" + query
          self.send_header("Location",  redirectLocation)
          self.end_headers()
          return

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if query == "frame":
          self.wfile.write("<html><frameset cols=*,200><frame name=pdf>" +
            "<frame src='" + path + "'></frameset></html>")
          return

        location = os.path.abspath(os.path.realpath(DOC_ROOT + os.sep + path))
        self.wfile.write("<html><body><h1>PDFs of " + path + "</h1>\n")
        for filename in os.listdir(location):
          if filename.lower().endswith('.pdf'):
            self.wfile.write("<a href='/web/viewer.html?file=" +
              urllib.quote_plus(path + filename, '/') + "' target=pdf>" +
              filename + "</a><br>\n")
        self.wfile.write("</body></html>")


    def do_POST(self):
        with lock:
            numBytes = int(self.headers['Content-Length'])

            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()

            url = urlparse(self.path)
            if url.path == "/tellMeToQuit":
                tellAppToQuit(url.path, url.query)
                return

            result = json.loads(self.rfile.read(numBytes))
            browser = result['browser']
            State.lastPost[browser] = int(time.time())
            if url.path == "/info":
                print result['message']
                return

            id = result['id']
            failure = result['failure']
            round = result['round']
            page = result['page']
            snapshot = result['snapshot']

            taskResults = State.taskResults[browser][id]
            taskResults[round].append(Result(snapshot, failure, page))
            if State.saveStats:
                stat = {
                    'browser': browser,
                    'pdf': id,
                    'page': page,
                    'round': round,
                    'stats': result['stats']
                }
                State.stats.append(stat)

            def isTaskDone():
                last_page_num = result['lastPageNum']
                rounds = State.manifest[id]['rounds']
                for round in range(0,rounds):
                    if not taskResults[round]:
                        return False
                    latest_page = taskResults[round][-1]
                    if not latest_page.page == last_page_num:
                        return False
                return True

            if isTaskDone():
                # sort the results since they sometimes come in out of order
                for results in taskResults:
                    results.sort(key=lambda result: result.page)
                check(State.manifest[id], taskResults, browser,
                    self.server.masterMode)
                # Please oh please GC this ...
                del State.taskResults[browser][id]
                State.remaining[browser] -= 1

                checkIfDone()

def checkIfDone():
    State.done = True
    for key in State.remaining:
        if State.remaining[key] != 0:
            State.done = False
            return

# Applescript hack to quit Chrome on Mac
def tellAppToQuit(path, query):
    if platform.system() != "Darwin":
        return
    d = parse_qs(query)
    path = d['path'][0]
    cmd = """osascript<<END
tell application "%s"
quit
end tell
END""" % path
    os.system(cmd)

class BaseBrowserCommand(object):
    def __init__(self, browserRecord):
        self.name = browserRecord["name"]
        self.path = browserRecord["path"]
        self.tempDir = None
        self.process = None

        if platform.system() == "Darwin" and (self.path.endswith(".app") or self.path.endswith(".app/")):
            self._fixupMacPath()

        if not os.path.exists(self.path):
            raise Exception("Path to browser '%s' does not exist." % self.path)

    def setup(self):
        self.tempDir = tempfile.mkdtemp()
        self.profileDir = os.path.join(self.tempDir, "profile")
        self.browserLog = open(BROWSERLOG_FILE, "w")

    def teardown(self):
        self.process.terminate()

        # If the browser is still running, wait up to ten seconds for it to quit
        if self.process and self.process.poll() is None:
            checks = 0
            while self.process.poll() is None and checks < 20:
                checks += 1
                time.sleep(.5)
            # If it's still not dead, try to kill it
            if self.process.poll() is None:
                print "Process %s is still running. Killing." % self.name
                self.process.kill()
                self.process.wait()
            
        if self.tempDir is not None and os.path.exists(self.tempDir):
            shutil.rmtree(self.tempDir)

        self.browserLog.close()

    def start(self, url):
        raise Exception("Can't start BaseBrowserCommand")

class FirefoxBrowserCommand(BaseBrowserCommand):
    def _fixupMacPath(self):
        self.path = os.path.join(self.path, "Contents", "MacOS", "firefox-bin")

    def setup(self):
        super(FirefoxBrowserCommand, self).setup()
        shutil.copytree(os.path.join(DOC_ROOT, "test", "resources", "firefox"),
                        self.profileDir)

    def start(self, url):
        cmds = [self.path]
        if platform.system() == "Darwin":
            cmds.append("-foreground")
        cmds.extend(["-no-remote", "-profile", self.profileDir, url])
        self.process = subprocess.Popen(cmds, stdout = self.browserLog, stderr = self.browserLog)

class ChromeBrowserCommand(BaseBrowserCommand):
    def _fixupMacPath(self):
        self.path = os.path.join(self.path, "Contents", "MacOS", "Google Chrome")

    def start(self, url):
        cmds = [self.path]
        cmds.extend(["--user-data-dir=%s" % self.profileDir,
                     "--no-first-run", "--disable-sync", url])
        self.process = subprocess.Popen(cmds, stdout = self.browserLog, stderr = self.browserLog)

def makeBrowserCommand(browser):
    path = browser["path"].lower()
    name = browser["name"]
    if name is not None:
        name = name.lower()

    types = {"firefox": FirefoxBrowserCommand,
             "chrome": ChromeBrowserCommand }
    command = None
    for key in types.keys():
        if (name and name.find(key) > -1) or path.find(key) > -1:
            command = types[key](browser)
            command.name = command.name or key
            break

    if command is None:
        raise Exception("Unrecognized browser: %s" % browser)

    return command 

def makeBrowserCommands(browserManifestFile):
    with open(browserManifestFile) as bmf:
        browsers = [makeBrowserCommand(browser) for browser in json.load(bmf)]
    return browsers

def downloadLinkedPDF(f):
    linkFile = open(f +'.link')
    link = linkFile.read()
    linkFile.close()

    sys.stdout.write('Downloading '+ link +' to '+ f +' ...')
    sys.stdout.flush()
    response = urllib2.urlopen(link)

    with open(f, 'wb') as out:
        out.write(response.read())

    print 'done'

def downloadLinkedPDFs(manifestList):
    for item in manifestList:
        f, isLink = item['file'], item.get('link', False)
        if isLink and not os.access(f, os.R_OK):
            try:
                downloadLinkedPDF(f)
            except:
                exc_type, exc_value, exc_traceback = sys.exc_info()
                print 'ERROR: Unable to download file "' + f + '".'
                open(f, 'wb').close()
                with open(f + '.error', 'w') as out:
                  out.write('\n'.join(traceback.format_exception(exc_type,
                                                                 exc_value,
                                                                 exc_traceback)))

def verifyPDFs(manifestList):
    error = False
    for item in manifestList:
        f = item['file']
        if os.path.isfile(f + '.error'):
            print 'WARNING: File was not downloaded. See "' + f + '.error" file.'
            error = True
        elif os.access(f, os.R_OK):
            fileMd5 = hashlib.md5(open(f, 'rb').read()).hexdigest()
            if 'md5' not in item:
                print 'WARNING: Missing md5 for file "' + f + '".',
                print 'Hash for current file is "' + fileMd5 + '"'
                error = True
                continue
            md5 = item['md5']
            if fileMd5 != md5:
                print 'WARNING: MD5 of file "' + f + '" does not match file.',
                print 'Expected "' + md5 + '" computed "' + fileMd5 + '"'
                error = True
                continue
        else:
            print 'WARNING: Unable to open file for reading "' + f + '".'
            error = True
    return not error

def getTestBrowsers(options):
    testBrowsers = []
    if options.browserManifestFile:
        testBrowsers = makeBrowserCommands(options.browserManifestFile)
    elif options.browser:
        testBrowsers = [makeBrowserCommand({"path":options.browser, "name":None})]

    if options.browserManifestFile or options.browser:
        assert len(testBrowsers) > 0
    return testBrowsers

def setUp(options):
    # Only serve files from a pdf.js clone
    assert not GIT_CLONE_CHECK or os.path.isfile('../src/pdf.js') and os.path.isdir('../.git')

    if options.masterMode and os.path.isdir(TMPDIR):
        print 'Temporary snapshot dir tmp/ is still around.'
        print 'tmp/ can be removed if it has nothing you need.'
        if options.noPrompts or prompt('SHOULD THIS SCRIPT REMOVE tmp/?  THINK CAREFULLY'):
            subprocess.call(( 'rm', '-rf', 'tmp' ))

    assert not os.path.isdir(TMPDIR)

    testBrowsers = getTestBrowsers(options)

    with open(options.manifestFile) as mf:
        manifestList = json.load(mf)

    if not options.noDownload:
        downloadLinkedPDFs(manifestList)

        if not verifyPDFs(manifestList):
          print 'Unable to verify the checksum for the files that are used for testing.'
          print 'Please re-download the files, or adjust the MD5 checksum in the manifest for the files listed above.\n'

    for b in testBrowsers:
        State.taskResults[b.name] = { }
        State.remaining[b.name] = len(manifestList)
        State.lastPost[b.name] = int(time.time())
        for item in manifestList:
            id, rounds = item['id'], int(item['rounds'])
            State.manifest[id] = item
            taskResults = [ ]
            for r in xrange(rounds):
                taskResults.append([ ])
            State.taskResults[b.name][id] = taskResults

    if options.statsFile != None:
        State.saveStats = True
    return testBrowsers

def setUpUnitTests(options):
    # Only serve files from a pdf.js clone
    assert not GIT_CLONE_CHECK or os.path.isfile('../src/pdf.js') and os.path.isdir('../.git')

    testBrowsers = getTestBrowsers(options)

    UnitTestState.browsersRunning = len(testBrowsers)
    for b in testBrowsers:
        UnitTestState.lastPost[b.name] = int(time.time())
    return testBrowsers

def startBrowsers(browsers, options, path):
    for b in browsers:
        b.setup()
        print 'Launching', b.name
        host = 'http://%s:%s' % (SERVER_HOST, options.port) 
        qs = '?browser='+ urllib.quote(b.name) +'&manifestFile='+ urllib.quote(options.manifestFile)
        qs += '&path=' + b.path
        qs += '&delay=' + str(options.statsDelay)
        qs += '&masterMode=' + str(options.masterMode)
        b.start(host + path + qs)

def teardownBrowsers(browsers):
    for b in browsers:
        try:
            b.teardown()
        except:
            print "Error cleaning up after browser at ", b.path
            print "Temp dir was ", b.tempDir
            print "Error:", sys.exc_info()[0]

def check(task, results, browser, masterMode):
    failed = False
    for r in xrange(len(results)):
        pageResults = results[r]
        for p in xrange(len(pageResults)):
            pageResult = pageResults[p]
            if pageResult is None:
                continue
            failure = pageResult.failure
            if failure:
                failed = True
                if os.path.isfile(task['file'] + '.error'):
                  print 'TEST-SKIPPED | PDF was not downloaded', task['id'], '| in', browser, '| page', p + 1, 'round', r, '|', failure
                else:
                  State.numErrors += 1
                  print 'TEST-UNEXPECTED-FAIL | test failed', task['id'], '| in', browser, '| page', p + 1, 'round', r, '|', failure

    if failed:
        return

    kind = task['type']
    if 'eq' == kind or 'text' == kind:
        checkEq(task, results, browser, masterMode)
    elif 'fbf' == kind:
        checkFBF(task, results, browser)
    elif 'load' == kind:
        checkLoad(task, results, browser)
    else:
        assert 0 and 'Unknown test type'

def createDir(dir):
    try:
        os.makedirs(dir)
    except OSError, e:
        if e.errno != 17: # file exists
            print >>sys.stderr, 'Creating', dir, 'failed!'


def readDataUri(data):
    metadata, encoded = data.rsplit(",", 1)
    return base64.b64decode(encoded)

def checkEq(task, results, browser, masterMode):
    pfx = os.path.join(REFDIR, sys.platform, browser, task['id'])
    testSnapshotDir = os.path.join(TEST_SNAPSHOTS, sys.platform, browser, task['id'])
    results = results[0]
    taskId = task['id']
    taskType = task['type']

    passed = True
    for result in results:
        page = result.page
        snapshot = readDataUri(result.snapshot)
        ref = None
        eq = True

        path = os.path.join(pfx, str(page) + '.png')
        if not os.access(path, os.R_OK):
            State.numEqNoSnapshot += 1
            if not masterMode:
                print 'WARNING: no reference snapshot', path
        else:
            f = open(path, 'rb')
            ref = f.read()
            f.close()

            eq = (ref == snapshot)
            if not eq:
                print 'TEST-UNEXPECTED-FAIL |', taskType, taskId, '| in', browser, '| rendering of page', page, '!= reference rendering'

                if not State.eqLog:
                    State.eqLog = open(EQLOG_FILE, 'w')
                eqLog = State.eqLog

                createDir(testSnapshotDir)
                testSnapshotPath = os.path.join(testSnapshotDir, str(page) + '.png')
                handle = open(testSnapshotPath, 'wb')
                handle.write(snapshot)
                handle.close()

                refSnapshotPath = os.path.join(testSnapshotDir, str(page) + '_ref.png')
                handle = open(refSnapshotPath, 'wb')
                handle.write(ref)
                handle.close()

                # NB: this follows the format of Mozilla reftest
                # output so that we can reuse its reftest-analyzer
                # script
                eqLog.write('REFTEST TEST-UNEXPECTED-FAIL | ' + browser +'-'+ taskId +'-page'+ str(page) + ' | image comparison (==)\n')
                eqLog.write('REFTEST   IMAGE 1 (TEST): ' + testSnapshotPath + '\n')
                eqLog.write('REFTEST   IMAGE 2 (REFERENCE): ' + refSnapshotPath + '\n')

                passed = False
                State.numEqFailures += 1

        if masterMode and (ref is None or not eq):
            tmpTaskDir = os.path.join(TMPDIR, sys.platform, browser, task['id'])
            createDir(tmpTaskDir)

            handle = open(os.path.join(tmpTaskDir, str(page)) + '.png', 'wb')
            handle.write(snapshot)
            handle.close()

    if passed:
        print 'TEST-PASS |', taskType, 'test', task['id'], '| in', browser

def checkFBF(task, results, browser):
    round0, round1 = results[0], results[1]
    assert len(round0) == len(round1)

    passed = True
    for page in xrange(len(round1)):
        r0Page, r1Page = round0[page], round1[page]
        if r0Page is None:
            break
        if r0Page.snapshot != r1Page.snapshot:
            print 'TEST-UNEXPECTED-FAIL | forward-back-forward test', task['id'], '| in', browser, '| first rendering of page', page + 1, '!= second'
            passed = False
            State.numFBFFailures += 1
    if passed:
        print 'TEST-PASS | forward-back-forward test', task['id'], '| in', browser


def checkLoad(task, results, browser):
    # Load just checks for absence of failure, so if we got here the
    # test has passed
    print 'TEST-PASS | load test', task['id'], '| in', browser


def processResults(options):
    print ''
    numFatalFailures = (State.numErrors + State.numFBFFailures)
    if 0 == State.numEqFailures and 0 == numFatalFailures:
        print 'All regression tests passed.'
    else:
        print 'OHNOES!  Some tests failed!'
        if 0 < State.numErrors:
            print '  errors:', State.numErrors
        if 0 < State.numEqFailures:
            print '  different ref/snapshot:', State.numEqFailures
        if 0 < State.numFBFFailures:
            print '  different first/second rendering:', State.numFBFFailures
    if options.statsFile != None:
        with open(options.statsFile, 'w') as sf:
            sf.write(json.dumps(State.stats, sort_keys=True, indent=4))
        print 'Wrote stats file: ' + options.statsFile


def maybeUpdateRefImages(options, browser):
    if options.masterMode and (0 < State.numEqFailures or 0 < State.numEqNoSnapshot): 
        print "Some eq tests failed or didn't have snapshots."
        print 'Checking to see if master references can be updated...'
        numFatalFailures = (State.numErrors + State.numFBFFailures)
        if 0 < numFatalFailures:
            print '  No.  Some non-eq tests failed.'
        else:
            print '  Yes!  The references in tmp/ can be synced with ref/.'
            if options.reftest:                                                                                                              
                startReftest(browser, options)
            if options.noPrompts or prompt('Would you like to update the master copy in ref/?'):
                sys.stdout.write('  Updating ref/ ... ')

                if not os.path.exists('ref'):
                    subprocess.check_call('mkdir ref', shell = True)
                subprocess.check_call('cp -Rf tmp/* ref/', shell = True)

                print 'done'
            else:
                print '  OK, not updating.'

def startReftest(browser, options):
    url = "http://%s:%s" % (SERVER_HOST, options.port)
    url += "/test/resources/reftest-analyzer.xhtml"
    url += "#web=/test/eq.log"
    try:
        browser.setup()
        browser.start(url)
        print "Waiting for browser..."
        browser.process.wait()
    finally:
        teardownBrowsers([browser])
    print "Completed reftest usage."

def runTests(options, browsers):
    try:
        shutil.rmtree(TEST_SNAPSHOTS);
    except OSError, e:
        if e.errno != 2: # folder doesn't exist
            print >>sys.stderr, 'Deleting', dir, 'failed!'
    t1 = time.time()
    try:
        startBrowsers(browsers, options, '/test/test_slave.html')
        while not State.done:
            for b in State.lastPost:
                if State.remaining[b] > 0 and int(time.time()) - State.lastPost[b] > BROWSER_TIMEOUT:
                    print 'TEST-UNEXPECTED-FAIL | test failed', b, "has not responded in", BROWSER_TIMEOUT, "s"
                    State.numErrors += State.remaining[b]
                    State.remaining[b] = 0
                    checkIfDone()
            time.sleep(1)
        processResults(options)
    finally:
        teardownBrowsers(browsers)
    t2 = time.time()
    print "Runtime was", int(t2 - t1), "seconds"
    if State.eqLog:
        State.eqLog.close();
    if options.masterMode:
        maybeUpdateRefImages(options, browsers[0])
    elif options.reftest and State.numEqFailures > 0:
        print "\nStarting reftest harness to examine %d eq test failures." % State.numEqFailures
        startReftest(browsers[0], options)

def runUnitTests(options, browsers, url, name):
    t1 = time.time()
    try:
        startBrowsers(browsers, options, url)
        while UnitTestState.browsersRunning > 0:
            for b in UnitTestState.lastPost:
                if UnitTestState.lastPost[b] != None and int(time.time()) - UnitTestState.lastPost[b] > BROWSER_TIMEOUT:
                    print 'TEST-UNEXPECTED-FAIL | test failed', b, "has not responded in", BROWSER_TIMEOUT, "s"
                    UnitTestState.lastPost[b] = None
                    UnitTestState.browsersRunning -= 1
                    UnitTestState.numErrors += 1
            time.sleep(1)
        print ''
        print 'Ran', UnitTestState.numRun, 'tests'
        if UnitTestState.numErrors > 0:
            print 'OHNOES!  Some', name, 'tests failed!'
            print '  ', UnitTestState.numErrors, 'of', UnitTestState.numRun, 'failed'
        else:
            print 'All', name, 'tests passed.'
    finally:
        teardownBrowsers(browsers)
    t2 = time.time()
    print '', name, 'tests runtime was', int(t2 - t1), 'seconds'

def main():
    optionParser = TestOptions()
    options, args = optionParser.parse_args()
    options = optionParser.verifyOptions(options)
    if options == None:
        sys.exit(1)

    if options.unitTest or options.fontTest:
        httpd = TestServer((SERVER_HOST, options.port), UnitTestHandler)
        httpd_thread = threading.Thread(target=httpd.serve_forever)
        httpd_thread.setDaemon(True)
        httpd_thread.start()

        browsers = setUpUnitTests(options)
        if len(browsers) > 0:
            if options.unitTest:
              runUnitTests(options, browsers, '/test/unit/unit_test.html', 'unit')
            if options.fontTest:
              runUnitTests(options, browsers, '/test/font/font_test.html', 'font')
    else:
        httpd = TestServer((SERVER_HOST, options.port), PDFTestHandler)
        httpd.masterMode = options.masterMode
        httpd_thread = threading.Thread(target=httpd.serve_forever)
        httpd_thread.setDaemon(True)
        httpd_thread.start()

        browsers = setUp(options)
        if len(browsers) > 0:
            runTests(options, browsers)
        else:
            # just run the server
            print "Running HTTP server. Press Ctrl-C to quit."
            try:
                while True:
                    time.sleep(1)
            except (KeyboardInterrupt):
                print "\nExiting."

if __name__ == '__main__':
    main()
