import json, os, sys, subprocess, urllib2
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from urlparse import urlparse

def prompt(question):
    '''Return True iff the user answered "yes" to |question|.'''
    inp = raw_input(question +' [yes/no] > ')
    return inp == 'yes'

ANAL = True
DEFAULT_MANIFEST_FILE = 'test_manifest.json'
EQLOG_FILE = 'eq.log'
REFDIR = 'ref'
TMPDIR = 'tmp'
VERBOSE = False

MIMEs = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/json',
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


class PDFTestHandler(BaseHTTPRequestHandler):
    # Disable annoying noise by default
    def log_request(code=0, size=0):
        if VERBOSE:
            BaseHTTPRequestHandler.log_request(code, size)

    def do_GET(self):
        url = urlparse(self.path)
        # Ignore query string
        path, _ = url.path, url.query
        cwd = os.getcwd()
        path = os.path.abspath(os.path.realpath(cwd + os.sep + path))
        cwd = os.path.abspath(cwd)
        prefix = os.path.commonprefix(( path, cwd ))
        _, ext = os.path.splitext(path)

        if not (prefix == cwd
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


def setUp(manifestFile, masterMode):
    # Only serve files from a pdf.js clone
    assert not ANAL or os.path.isfile('pdf.js') and os.path.isdir('.git')

    State.masterMode = masterMode
    if masterMode and os.path.isdir(TMPDIR):
        print 'Temporary snapshot dir tmp/ is still around.'
        print 'tmp/ can be removed if it has nothing you need.'
        if prompt('SHOULD THIS SCRIPT REMOVE tmp/?  THINK CAREFULLY'):
            subprocess.call(( 'rm', '-rf', 'tmp' ))

    assert not os.path.isdir(TMPDIR)

    testBrowsers = [ b for b in
                     ( 'firefox5', )
#'chrome12', 'chrome13', 'firefox4', 'firefox6','opera11' ):
                     if os.access(b, os.R_OK | os.X_OK) ]

    mf = open(manifestFile)
    manifestList = json.load(mf)
    mf.close()

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
        State.taskResults[b] = { }
        for item in manifestList:
            id, rounds = item['id'], int(item['rounds'])
            State.manifest[id] = item
            taskResults = [ ]
            for r in xrange(rounds):
                taskResults.append([ ])
            State.taskResults[b][id] = taskResults

    State.remaining = len(manifestList)

    for b in testBrowsers:
        print 'Launching', b
        qs = 'browser='+ b +'&manifestFile='+ manifestFile
        subprocess.Popen(( os.path.abspath(os.path.realpath(b)),
                           'http://localhost:8080/test_slave.html?'+ qs))


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


def main(args):
    masterMode = False
    manifestFile = DEFAULT_MANIFEST_FILE
    if len(args) == 1:
        masterMode = (args[0] == '-m')
        manifestFile = args[0] if not masterMode else manifestFile



    masterMode = True



    setUp(manifestFile, masterMode)

    server = HTTPServer(('127.0.0.1', 8080), PDFTestHandler)
    while not State.done:
        server.handle_request()

    processResults()

if __name__ == '__main__':
    main(sys.argv[1:])
