import json, platform, os, shutil, sys, subprocess, tempfile, threading, time, urllib, urllib2
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import SocketServer
from optparse import OptionParser
from urlparse import urlparse, parse_qs

USAGE_EXAMPLE = "%prog"

# The local web server uses the git repo as the document root.
DOC_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),".."))

ANAL = True
DEFAULT_MANIFEST_FILE = 'test_manifest.json'
EQLOG_FILE = 'eq.log'
REFDIR = 'ref'
TMPDIR = 'tmp'
VERBOSE = False

SERVER_HOST = "localhost"

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
        self.set_usage(USAGE_EXAMPLE)

    def verifyOptions(self, options):
        if options.masterMode and options.manifestFile:
            self.error("--masterMode and --manifestFile must not be specified at the same time.")
        if not options.manifestFile:
            options.manifestFile = DEFAULT_MANIFEST_FILE
        if options.browser and options.browserManifestFile:
            print "Warning: ignoring browser argument since manifest file was also supplied"
        if not options.browser and not options.browserManifestFile:
            print "Starting server on port %s." % options.port
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
    '.ico': 'image/x-icon',
    '.log': 'text/plain'
}

class State:
    browsers = [ ]
    manifest = { }
    taskResults = { }
    remaining = 0
    results = { }
    done = False
    numErrors = 0
    numEqFailures = 0
    numEqNoSnapshot = 0
    numFBFFailures = 0
    numLoadFailures = 0
    eqLog = None

class Result:
    def __init__(self, snapshot, failure, page):
        self.snapshot = snapshot
        self.failure = failure
        self.page = page

class TestServer(SocketServer.TCPServer):
    allow_reuse_address = True

class PDFTestHandler(BaseHTTPRequestHandler):

    # Disable annoying noise by default
    def log_request(code=0, size=0):
        if VERBOSE:
            BaseHTTPRequestHandler.log_request(code, size)

    def sendFile(self, path, ext):
        self.send_response(200)
        self.send_header("Content-Type", MIMEs[ext])
        self.send_header("Content-Length", os.path.getsize(path))
        self.end_headers()
        with open(path, "rb") as f:
            self.wfile.write(f.read())

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
            # TODO for fetch-as-you-go
            self.send_error(501)
            return

        self.sendFile(path, ext)

    def do_POST(self):
        numBytes = int(self.headers['Content-Length'])

        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()

        url = urlparse(self.path)
        if url.path == "/tellMeToQuit":
            tellAppToQuit(url.path, url.query)
            return

        result = json.loads(self.rfile.read(numBytes))
        browser, id, failure, round, page, snapshot = result['browser'], result['id'], result['failure'], result['round'], result['page'], result['snapshot']
        taskResults = State.taskResults[browser][id]
        taskResults[round].append(Result(snapshot, failure, page))

        def isTaskDone():
            numPages = result["numPages"]
            rounds = State.manifest[id]["rounds"]
            for round in range(0,rounds):
                if len(taskResults[round]) < numPages:
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
            State.remaining -= 1

        State.done = (0 == State.remaining)

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

    def teardown(self):
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
            
        if self.tempDir is not None and os.path.exists(self.tempDir):
            shutil.rmtree(self.tempDir)

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
        self.process = subprocess.Popen(cmds)

class ChromeBrowserCommand(BaseBrowserCommand):
    def _fixupMacPath(self):
        self.path = os.path.join(self.path, "Contents", "MacOS", "Google Chrome")

    def start(self, url):
        cmds = [self.path]
        cmds.extend(["--user-data-dir=%s" % self.profileDir,
                     "--no-first-run", "--disable-sync", url])
        self.process = subprocess.Popen(cmds)

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

def downloadLinkedPDFs(manifestList):
    for item in manifestList:
        f, isLink = item['file'], item.get('link', False)
        if isLink and not os.access(f, os.R_OK):
            linkFile = open(f +'.link')
            link = linkFile.read()
            linkFile.close()

            sys.stdout.write('Downloading '+ link +' to '+ f +' ...')
            sys.stdout.flush()
            response = urllib2.urlopen(link)

            with open(f, 'wb') as out:
                out.write(response.read())

            print 'done'

def setUp(options):
    # Only serve files from a pdf.js clone
    assert not ANAL or os.path.isfile('../pdf.js') and os.path.isdir('../.git')

    if options.masterMode and os.path.isdir(TMPDIR):
        print 'Temporary snapshot dir tmp/ is still around.'
        print 'tmp/ can be removed if it has nothing you need.'
        if options.noPrompts or prompt('SHOULD THIS SCRIPT REMOVE tmp/?  THINK CAREFULLY'):
            subprocess.call(( 'rm', '-rf', 'tmp' ))

    assert not os.path.isdir(TMPDIR)

    testBrowsers = []
    if options.browserManifestFile:
        testBrowsers = makeBrowserCommands(options.browserManifestFile)
    elif options.browser:
        testBrowsers = [makeBrowserCommand({"path":options.browser, "name":None})]

    if options.browserManifestFile or options.browser:
        assert len(testBrowsers) > 0

    with open(options.manifestFile) as mf:
        manifestList = json.load(mf)

    downloadLinkedPDFs(manifestList)

    for b in testBrowsers:
        State.taskResults[b.name] = { }
        for item in manifestList:
            id, rounds = item['id'], int(item['rounds'])
            State.manifest[id] = item
            taskResults = [ ]
            for r in xrange(rounds):
                taskResults.append([ ])
            State.taskResults[b.name][id] = taskResults

    State.remaining = len(testBrowsers) * len(manifestList)

    return testBrowsers

def startBrowsers(browsers, options):
    for b in browsers:
        b.setup()
        print 'Launching', b.name
        host = 'http://%s:%s' % (SERVER_HOST, options.port) 
        path = '/test/test_slave.html?'
        qs = 'browser='+ urllib.quote(b.name) +'&manifestFile='+ urllib.quote(options.manifestFile)
        qs += '&path=' + b.path
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
                State.numErrors += 1
                print 'TEST-UNEXPECTED-FAIL | test failed', task['id'], '| in', browser, '| page', p + 1, 'round', r, '|', failure

    if failed:
        return

    kind = task['type']
    if 'eq' == kind:
        checkEq(task, results, browser, masterMode)
    elif 'fbf' == kind:
        checkFBF(task, results, browser)
    elif 'load' == kind:
        checkLoad(task, results, browser)
    else:
        assert 0 and 'Unknown test type'


def checkEq(task, results, browser, masterMode):
    pfx = os.path.join(REFDIR, sys.platform, browser, task['id'])
    results = results[0]
    taskId = task['id']

    passed = True
    for page in xrange(len(results)):
        snapshot = results[page].snapshot
        ref = None
        eq = True

        path = os.path.join(pfx, str(page + 1))
        if not os.access(path, os.R_OK):
            State.numEqNoSnapshot += 1
            if not masterMode:
                print 'WARNING: no reference snapshot', path
        else:
            f = open(path)
            ref = f.read()
            f.close()

            eq = (ref == snapshot)
            if not eq:
                print 'TEST-UNEXPECTED-FAIL | eq', taskId, '| in', browser, '| rendering of page', page + 1, '!= reference rendering'

                if not State.eqLog:
                    State.eqLog = open(EQLOG_FILE, 'w')
                eqLog = State.eqLog

                # NB: this follows the format of Mozilla reftest
                # output so that we can reuse its reftest-analyzer
                # script
                print >>eqLog, 'REFTEST TEST-UNEXPECTED-FAIL |', browser +'-'+ taskId +'-page'+ str(page + 1), '| image comparison (==)'
                print >>eqLog, 'REFTEST   IMAGE 1 (TEST):', snapshot
                print >>eqLog, 'REFTEST   IMAGE 2 (REFERENCE):', ref

                passed = False
                State.numEqFailures += 1

        if masterMode and (ref is None or not eq):
            tmpTaskDir = os.path.join(TMPDIR, sys.platform, browser, task['id'])
            try:
                os.makedirs(tmpTaskDir)
            except OSError, e:
                if e.errno != 17: # file exists
                    print >>sys.stderr, 'Creating', tmpTaskDir, 'failed!'
        
            of = open(os.path.join(tmpTaskDir, str(page + 1)), 'w')
            of.write(snapshot)
            of.close()

    if passed:
        print 'TEST-PASS | eq test', task['id'], '| in', browser


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


def processResults():
    print ''
    numFatalFailures = (State.numErrors + State.numFBFFailures)
    if 0 == State.numEqFailures and 0 == numFatalFailures:
        print 'All tests passed.'
    else:
        print 'OHNOES!  Some tests failed!'
        if 0 < State.numErrors:
            print '  errors:', State.numErrors
        if 0 < State.numEqFailures:
            print '  different ref/snapshot:', State.numEqFailures
        if 0 < State.numFBFFailures:
            print '  different first/second rendering:', State.numFBFFailures


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
            if options.noPrompts or not prompt('Would you like to update the master copy in ref/?'):
                print '  OK, not updating.'
            else:
                sys.stdout.write('  Updating ref/ ... ')

                # XXX unclear what to do on errors here ...
                # NB: do *NOT* pass --delete to rsync.  That breaks this
                # entire scheme.
                subprocess.check_call(( 'rsync', '-arv', 'tmp/', 'ref/' ))

                print 'done'

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
    t1 = time.time()
    try:
        startBrowsers(browsers, options)
        while not State.done:
            time.sleep(1)
        processResults()
    finally:
        teardownBrowsers(browsers)
    t2 = time.time()
    print "Runtime was", int(t2 - t1), "seconds"

    if options.masterMode:
        maybeUpdateRefImages(options, browsers[0])
    elif options.reftest and State.numEqFailures > 0:
        print "\nStarting reftest harness to examine %d eq test failures." % State.numEqFailures
        startReftest(browsers[0], options)

def main():
    optionParser = TestOptions()
    options, args = optionParser.parse_args()
    options = optionParser.verifyOptions(options)
    if options == None:
        sys.exit(1)

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
