#!/usr/bin/env python
"""static - A stupidly simple WSGI way to serve static (or mixed) content.

(See the docstrings of the various functions and classes.)

Copyright (C) 2006-2009 Luke Arno - http://lukearno.com/

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either
version 2.1 of the License, or (at your option) any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library; if not, write to:

The Free Software Foundation, Inc.,
51 Franklin Street, Fifth Floor,
Boston, MA  02110-1301, USA.

Luke Arno can be found at http://lukearno.com/

"""

import mimetypes
import rfc822
import time
import string
import sys
from os import path, stat, getcwd
from wsgiref import util
from wsgiref.headers import Headers
from wsgiref.simple_server import make_server
from optparse import OptionParser

try: from pkg_resources import resource_filename, Requirement
except: pass

try: import kid
except: pass


class MagicError(Exception): pass


class StatusApp:
    """Used by WSGI apps to return some HTTP status."""

    def __init__(self, status, message=None):
        self.status = status
        if message is None:
            self.message = status
        else:
            self.message = message

    def __call__(self, environ, start_response, headers=[]):
        if self.message:
            Headers(headers).add_header('Content-type', 'text/plain')
        start_response(self.status, headers)
        if environ['REQUEST_METHOD'] == 'HEAD':
            return [""]
        else:
            return [self.message]


class Cling(object):
    """A stupidly simple way to serve static content via WSGI.

    Serve the file of the same path as PATH_INFO in self.datadir.

    Look up the Content-type in self.content_types by extension
    or use 'text/plain' if the extension is not found.

    Serve up the contents of the file or delegate to self.not_found.
    """

    block_size = 16 * 4096
    index_file = 'index.html'
    not_found = StatusApp('404 Not Found')
    not_modified = StatusApp('304 Not Modified', "")
    moved_permanently = StatusApp('301 Moved Permanently')
    method_not_allowed = StatusApp('405 Method Not Allowed')

    def __init__(self, root, **kw):
        """Just set the root and any other attribs passes via **kw."""
        self.root = root
        for k, v in kw.iteritems():
            setattr(self, k, v)

    def __call__(self, environ, start_response):
        """Respond to a request when called in the usual WSGI way."""
        if environ['REQUEST_METHOD'] not in ('GET', 'HEAD'):
            headers = [('Allow', 'GET, HEAD')]
            return self.method_not_allowed(environ, start_response, headers)
        path_info = environ.get('PATH_INFO', '')
        full_path = self._full_path(path_info)
        if not self._is_under_root(full_path):
            return self.not_found(environ, start_response)
        if path.isdir(full_path):
            if full_path[-1] <> '/' or full_path == self.root:
                location = util.request_uri(environ, include_query=False) + '/'
                if environ.get('QUERY_STRING'):
                    location += '?' + environ.get('QUERY_STRING')
                headers = [('Location', location)]
                return self.moved_permanently(environ, start_response, headers)
            else:
                full_path = self._full_path(path_info + self.index_file)
        content_type = self._guess_type(full_path)
        try:
            etag, last_modified = self._conditions(full_path, environ)
            headers = [('Date', rfc822.formatdate(time.time())),
                       ('Last-Modified', last_modified),
                       ('ETag', etag)]
            if_modified = environ.get('HTTP_IF_MODIFIED_SINCE')
            if if_modified and (rfc822.parsedate(if_modified)
                                >= rfc822.parsedate(last_modified)):
                return self.not_modified(environ, start_response, headers)
            if_none = environ.get('HTTP_IF_NONE_MATCH')
            if if_none and (if_none == '*' or etag in if_none):
                return self.not_modified(environ, start_response, headers)
            file_like = self._file_like(full_path)
            headers.append(('Content-Type', content_type))
            start_response("200 OK", headers)
            if environ['REQUEST_METHOD'] == 'GET':
                return self._body(full_path, environ, file_like)
            else:
                return ['']
        except (IOError, OSError), e:
            print e
            return self.not_found(environ, start_response)

    def _full_path(self, path_info):
        """Return the full path from which to read."""
        return self.root + path_info

    def _is_under_root(self, full_path):
        """Guard against arbitrary file retrieval."""
        if (path.abspath(full_path) + path.sep)\
            .startswith(path.abspath(self.root) + path.sep):
            return True
        else:
            return False

    def _guess_type(self, full_path):
        """Guess the mime type using the mimetypes module."""
        return mimetypes.guess_type(full_path)[0] or 'text/plain'

    def _conditions(self, full_path, environ):
        """Return a tuple of etag, last_modified by mtime from stat."""
        mtime = stat(full_path).st_mtime
        return str(mtime), rfc822.formatdate(mtime)

    def _file_like(self, full_path):
        """Return the appropriate file object."""
        return open(full_path, 'rb')

    def _body(self, full_path, environ, file_like):
        """Return an iterator over the body of the response."""
        way_to_send = environ.get('wsgi.file_wrapper', iter_and_close)
        return way_to_send(file_like, self.block_size)


def iter_and_close(file_like, block_size):
    """Yield file contents by block then close the file."""
    while 1:
        try:
            block = file_like.read(block_size)
            if block: yield block
            else: raise StopIteration
        except StopIteration, si:
            file_like.close()
            return


def cling_wrap(package_name, dir_name, **kw):
    """Return a Cling that serves from the given package and dir_name.

    This uses pkg_resources.resource_filename which is not the
    recommended way, since it extracts the files.

    I think this works fine unless you have some _very_ serious
    requirements for static content, in which case you probably
    shouldn't be serving it through a WSGI app, IMHO. YMMV.
    """
    resource = Requirement.parse(package_name)
    return Cling(resource_filename(resource, dir_name), **kw)


def command():
    parser = OptionParser(usage="%prog DIR [HOST][:][PORT]",
                          version="static 0.3.6")
    options, args = parser.parse_args()
    if len(args) in (1, 2):
        if len(args) == 2:
            parts = args[1].split(":")
            if len(parts) == 1:
                host = parts[0]
                port = None
            elif len(parts) == 2:
                host, port = parts
            else:
                sys.exit("Invalid host:port specification.")
        elif len(args) == 1:
            host, port = None, None
        if not host:
            host = '0.0.0.0'
        if not port:
            port = 8888
        try:
            port = int(port)
        except:
            sys.exit("Invalid host:port specification.")
        app = Cling(args[0])
        try:
            make_server(host, port, app).serve_forever()
        except KeyboardInterrupt, ki:
            print "Cio, baby!"
        except:
            sys.exit("Problem initializing server.")
    else:
        parser.print_help(sys.stderr)
        sys.exit(1)


def test():
    from wsgiref.validate import validator
    app = Cling(getcwd())
    try:
        print "Serving " + getcwd() + " to http://localhost:8888"
        make_server('0.0.0.0', 8888, validator(app)).serve_forever()
    except KeyboardInterrupt, ki:
        print ""
        print "Ciao, baby!"


if __name__ == '__main__':
    test()

