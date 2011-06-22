import json, os, sys, subprocess, urllib2
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from urlparse import urlparse

ANAL = True
DEFAULT_MANIFEST_FILE = 'test_manifest.json'
REFDIR = 'ref'
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


def set_up(manifestFile):
    # Only serve files from a pdf.js clone
    assert not ANAL or os.path.isfile('pdf.js') and os.path.isdir('.git')

    testBrowsers = [ b for b in
                     ( 'firefox4', )
#'chrome12', 'chrome13', 'firefox5', 'firefox6','opera11' ):
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

    passed = True
    for page in xrange(len(results)):
        ref = None
        try:
            path = os.path.join(pfx, str(page + 1))
            f = open(path)
            ref = f.read()
            f.close()
        except IOError, ioe:
            continue

        snapshot = results[page]
        if ref != snapshot:
            print 'TEST-UNEXPECTED-FAIL | eq', task['id'], '| in', browser, '| rendering of page', page + 1, '!= reference rendering'
            passed = False
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
    if passed:
        print 'TEST-PASS | forward-back-forward test', task['id'], '| in', browser


def checkLoad(task, results, browser):
    # Load just checks for absence of failure, so if we got here the
    # test has passed
    print 'TEST-PASS | load test', task['id'], '| in', browser


def main(args):
    manifestFile = args[0] if len(args) == 1 else DEFAULT_MANIFEST_FILE
    set_up(manifestFile)
    server = HTTPServer(('127.0.0.1', 8080), PDFTestHandler)
    while not State.done:
        server.handle_request()

if __name__ == '__main__':
    main(sys.argv[1:])
