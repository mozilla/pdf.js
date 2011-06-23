import json, platform, os, shutil, sys, subprocess, tempfile, threading, urllib, urllib2
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
import SocketServer
from optparse import OptionParser
from urlparse import urlparse

USAGE_EXAMPLE = "%prog"

# The local web server uses the git repo as the document root.
DOC_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),".."))

ANAL = True
DEFAULT_MANIFEST_FILE = 'test_manifest.json'
DEFAULT_BROWSER_MANIFEST_FILE = 'browser_manifest.json'
EQLOG_FILE = 'eq.log'
REFDIR = 'ref'
TMPDIR = 'tmp'
VERBOSE = False

class TestOptions(OptionParser):
    def __init__(self, **kwargs):
        OptionParser.__init__(self, **kwargs)
        self.add_option("-m", "--masterMode", action="store_true", dest="masterMode",
                        help="Run the script in master mode.", default=False)
        self.add_option("--manifestFile", action="store", type="string", dest="manifestFile",
                        help="A JSON file in the form of test_manifest.json (the default).")
        self.add_option("--browserManifestFile", action="store", type="string",
                        dest="browserManifestFile",
                        help="A JSON file in the form of browser_manifest.json (the default).",
                        default=DEFAULT_BROWSER_MANIFEST_FILE)
        self.set_usage(USAGE_EXAMPLE)

    def verifyOptions(self, options):
        if options.masterMode and options.manifestFile:
            self.error("--masterMode and --manifestFile must not be specified at the same time.")
        options.manifestFile = DEFAULT_MANIFEST_FILE
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
    '.pdf': 'application/pdf',
    '.xhtml': 'application/xhtml+xml',
}

class State:
    browsers = [ ]
    manifest = { }
    taskResults = { }
    remaining = 0
    results = { }
    done = False
    masterMode = False
    numErrors = 0
    numEqFailures = 0
    numEqNoSnapshot = 0
    numFBFFailures = 0
    numLoadFailures = 0
    eqLog = None

class Result:
    def __init__(self, snapshot, failure):
        self.snapshot = snapshot
        self.failure = failure

class TestServer(SocketServer.TCPServer):
    allow_reuse_address = True

class PDFTestHandler(BaseHTTPRequestHandler):

    # Disable annoying noise by default
    def log_request(code=0, size=0):
        if VERBOSE:
            BaseHTTPRequestHandler.log_request(code, size)

    def do_GET(self):
        url = urlparse(self.path)
        # Ignore query string
        path, _ = url.path, url.query
        path = os.path.abspath(os.path.realpath(DOC_ROOT + os.sep + path))
        prefix = os.path.commonprefix(( path, DOC_ROOT ))
        _, ext = os.path.splitext(path)

        if not (prefix == DOC_ROOT
                and os.path.isfile(path) 
                and ext in MIMEs):
            self.send_error(404)
            return

        if 'Range' in self.headers:
            # TODO for fetch-as-you-go
            self.send_error(501)
            return

        self.send_response(200)
        self.send_header("Content-Type", MIMEs[ext])
        self.end_headers()

        # Sigh, os.sendfile() plz
        f = open(path)
        self.wfile.write(f.read())
        f.close()


    def do_POST(self):
        numBytes = int(self.headers['Content-Length'])

        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()

        result = json.loads(self.rfile.read(numBytes))
        browser, id, failure, round, page, snapshot = result['browser'], result['id'], result['failure'], result['round'], result['page'], result['snapshot']
        taskResults = State.taskResults[browser][id]
        taskResults[round].append(Result(snapshot, failure))
        assert len(taskResults[round]) == page

        if result['taskDone']:
            check(State.manifest[id], taskResults, browser)
            # Please oh please GC this ...
            del State.taskResults[browser][id]
            State.remaining -= 1

        State.done = (0 == State.remaining)

# this just does Firefox for now
class BrowserCommand():
    def __init__(self, browserRecord):
        self.name = browserRecord["name"]
        self.path = browserRecord["path"]
        self.type = browserRecord["type"]

        if platform.system() == "Darwin" and self.path.endswith(".app"):
            self._fixupMacPath()

        if not os.path.exists(self.path):
            throw("Path to browser '%s' does not exist." % self.path)

    def _fixupMacPath(self):
        self.path = self.path + "/Contents/MacOS/firefox-bin"

    def setup(self):
        self.tempDir = tempfile.mkdtemp()
        self.profileDir = os.path.join(self.tempDir, "profile")
        shutil.copytree(os.path.join(DOC_ROOT, "test", "resources", "firefox"),
                        self.profileDir)

    def teardown(self):
        shutil.rmtree(self.tempDir)

    def start(self, url):
        cmds = [self.path, "-no-remote", "-profile", self.profileDir, url]
        subprocess.call(cmds)

def makeBrowserCommands(browserManifestFile):
    with open(browserManifestFile) as bmf:
        browsers = [BrowserCommand(browser) for browser in json.load(bmf)]
    return browsers

def setUp(options):
    # Only serve files from a pdf.js clone
    assert not ANAL or os.path.isfile('../pdf.js') and os.path.isdir('../.git')

    State.masterMode = options.masterMode
    if options.masterMode and os.path.isdir(TMPDIR):
        print 'Temporary snapshot dir tmp/ is still around.'
        print 'tmp/ can be removed if it has nothing you need.'
        if prompt('SHOULD THIS SCRIPT REMOVE tmp/?  THINK CAREFULLY'):
            subprocess.call(( 'rm', '-rf', 'tmp' ))

    assert not os.path.isdir(TMPDIR)

    testBrowsers = makeBrowserCommands(options.browserManifestFile)

    with open(options.manifestFile) as mf:
        manifestList = json.load(mf)

    for item in manifestList:
        f, isLink = item['file'], item.get('link', False)
        if isLink and not os.access(f, os.R_OK):
            linkFile = open(f +'.link')
            link = linkFile.read()
            linkFile.close()

            sys.stdout.write('Downloading '+ link +' to '+ f +' ...')
            sys.stdout.flush()
            response = urllib2.urlopen(link)

            out = open(f, 'w')
            out.write(response.read())
            out.close()

            print 'done'

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

    for b in testBrowsers:
        try:
            b.setup()
            print 'Launching', b.name
            qs = 'browser='+ urllib.quote(b.name) +'&manifestFile='+ urllib.quote(options.manifestFile)
            b.start('http://localhost:8080/test/test_slave.html?'+ qs)
        finally:
            b.teardown()

def check(task, results, browser):
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
        checkEq(task, results, browser)
    elif 'fbf' == kind:
        checkFBF(task, results, browser)
    elif 'load' == kind:
        checkLoad(task, results, browser)
    else:
        assert 0 and 'Unknown test type'


def checkEq(task, results, browser):
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
            print 'WARNING: no reference snapshot', path
            State.numEqNoSnapshot += 1
        else:
            f = open(path)
            ref = f.read()
            f.close()

            eq = (ref == snapshot)
            if not eq:
                print 'TEST-UNEXPECTED-FAIL | eq', taskId, '| in', browser, '| rendering of page', page + 1, '!= reference rendering'
                # XXX need to dump this always, somehow, when we have
                # the reference repository
                if State.masterMode:
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

        if State.masterMode and (ref is None or not eq):
            tmpTaskDir = os.path.join(TMPDIR, sys.platform, browser, task['id'])
            try:
                os.makedirs(tmpTaskDir)
            except OSError, e:
                pass

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
    numErrors, numEqFailures, numEqNoSnapshot, numFBFFailures = State.numErrors, State.numEqFailures, State.numEqNoSnapshot, State.numFBFFailures
    numFatalFailures = (numErrors + numFBFFailures)
    if 0 == numEqFailures and 0 == numFatalFailures:
        print 'All tests passed.'
    else:
        print 'OHNOES!  Some tests failed!'
        if 0 < numErrors:
            print '  errors:', numErrors
        if 0 < numEqFailures:
            print '  different ref/snapshot:', numEqFailures
        if 0 < numFBFFailures:
            print '  different first/second rendering:', numFBFFailures

    if State.masterMode and (0 < numEqFailures or 0 < numEqNoSnapshot):
        print "Some eq tests failed or didn't have snapshots."
        print 'Checking to see if master references can be updated...'
        if 0 < numFatalFailures:
            print '  No.  Some non-eq tests failed.'
        else:
            '  Yes!  The references in tmp/ can be synced with ref/.'
            if not prompt('Would you like to update the master copy in ref/?'):
                print '  OK, not updating.'
            else:
                sys.stdout.write('  Updating ... ')

                # XXX unclear what to do on errors here ...
                # NB: do *NOT* pass --delete to rsync.  That breaks this
                # entire scheme.
                subprocess.check_call(( 'rsync', '-arv', 'tmp/', 'ref/' ))

                print 'done'


def main():
    optionParser = TestOptions()
    options, args = optionParser.parse_args()
    options = optionParser.verifyOptions(options)
    if options == None:
        sys.exit(1)

    httpd = TestServer(('127.0.0.1', 8080), PDFTestHandler)
    httpd_thread = threading.Thread(target=httpd.serve_forever)
    httpd_thread.setDaemon(True)
    httpd_thread.start()

    setUp(options)
    processResults()

if __name__ == '__main__':
    main()
