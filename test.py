import json, os, sys, subprocess
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

ANAL = True
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
        cwd = os.getcwd()
        path = os.path.abspath(os.path.realpath(cwd + os.sep + self.path))
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
        browser = 'firefox4'
        id, failure, round, page, snapshot = result['id'], result['failure'], result['round'], result['page'], result['snapshot']
        taskResults = State.taskResults[browser][id]
        taskResults[round][page - 1] = Result(snapshot, failure)

        if result['taskDone']:
            check(State.manifest[id], taskResults, browser)
            State.remaining -= 1

        State.done = (0 == State.remaining)
            

def set_up():
    # Only serve files from a pdf.js clone
    assert not ANAL or os.path.isfile('pdf.js') and os.path.isdir('.git')

    testBrowsers = [ b for b in
                     ( 'firefox4', )
#'chrome12', 'chrome13', 'firefox5', 'firefox6','opera11' ):
                     if os.access(b, os.R_OK | os.X_OK) ]

    mf = open('test_manifest.json')
    manifestList = json.load(mf)
    mf.close()

    for b in testBrowsers:
        State.taskResults[b] = { }
        for item in manifestList:
            id, rounds = item['id'], int(item['rounds'])
            State.manifest[id] = item
            taskResults = [ ]
            for r in xrange(rounds):
                taskResults.append([ None ] * 100)
            State.taskResults[b][id] = taskResults

    State.remaining = len(manifestList)

    for b in testBrowsers:
        print 'Launching', b
        subprocess.Popen(( os.path.abspath(os.path.realpath(b)),
                           'http://localhost:8080/test_slave.html' ))


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
    if '==' == kind:
        checkEq(task, results, browser)
    elif 'fbf' == kind:
        checkFBF(task, results, browser)
    elif 'load' == kind:
        checkLoad(task, results, browser)
    else:
        assert 0 and 'Unknown test type'


def checkEq(task, results, browser):
    print '  !!! [TODO: == tests] !!!'
    print 'TEST-PASS | == test', task['id'], '| in', browser


printed = [False]

def checkFBF(task, results, browser):
    round0, round1 = results[0], results[1]
    assert len(round0) == len(round1)

    for page in xrange(len(round1)):
        r0Page, r1Page = round0[page], round1[page]
        if r0Page is None:
            break
        if r0Page.snapshot != r1Page.snapshot:
            print 'TEST-UNEXPECTED-FAIL | forward-back-forward test', task['id'], '| in', browser, '| first rendering of page', page + 1, '!= second'
    print 'TEST-PASS | forward-back-forward test', task['id'], '| in', browser


def checkLoad(task, results, browser):
    # Load just checks for absence of failure, so if we got here the
    # test has passed
    print 'TEST-PASS | load test', task['id'], '| in', browser


def main():
    set_up()
    server = HTTPServer(('127.0.0.1', 8080), PDFTestHandler)
    while not State.done:
        server.handle_request()

if __name__ == '__main__':
    main()
