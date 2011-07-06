REPO = git@github.com:andreasgal/pdf.js.git
BUILD_DIR := build
DEFAULT_BROWSERS := test/resources/browser_manifests/browser_manifest.json
DEFAULT_TESTS := test/test_manifest.json

# JS files needed for pdf.js.
# This list doesn't account for the 'worker' directory.
PDF_JS_FILES = \
	pdf.js \
	crypto.js \
	fonts.js \
	glyphlist.js \
	$(NULL)

# not sure what to do for all yet
all: help

# make server
#
# This target starts a local web server at localhost:8888. This can be
# used for testing all browsers.
server:
	@cd test; python test.py --port=8888;

test: shell-test browser-test

# make browser-test
#
# This target runs in-browser tests using two primary arguments: a
# test manifest file, and a browser manifest file. Both are simple
# JSON formats, and examples can be found in the test/ directory. The
# target will inspect the environment for the PDF_TESTS and
# PDF_BROWSERS variables, and use those if found. Otherwise, the
# defaults at the top of this file are used.
ifeq ($(PDF_TESTS),)
PDF_TESTS := $(DEFAULT_TESTS)
endif
ifeq ($(PDF_BROWSERS),)
PDF_BROWSERS := $(DEFAULT_BROWSERS)
endif

browser-test:
	@if [ ! -f "$(PDF_BROWSERS)" ]; then \
	echo "Browser manifest file $(PDF_BROWSERS) does not exist."; \
	echo "Try copying one of the examples" \
              "in test/resources/browser_manifests/"; \
	exit 1; \
	fi;

	cd test; \
	python test.py --reftest \
	--browserManifestFile=$(abspath $(PDF_BROWSERS)) \
	--manifestFile=$(abspath $(PDF_TESTS))

# make shell-test
#
# This target runs all of the tests that can be run in a JS shell.
# The shell used is taken from the JS_SHELL environment variable. If
# that variable is not defined, the script will attempt to use the copy
# of Rhino that comes with the Closure compiler used for producing the
# website.
SHELL_TARGET = $(NULL)
ifeq ($(JS_SHELL),)
JS_SHELL := "java -cp $(BUILD_DIR)/compiler.jar"
JS_SHELL += "com.google.javascript.jscomp.mozilla.rhino.tools.shell.Main"
SHELL_TARGET = compiler
endif

shell-test: shell-msg $(SHELL_TARGET) font-test
shell-msg:
ifeq ($(SHELL_TARGET), compiler)
	@echo "No JS_SHELL env variable present."
	@echo "The default is to find a copy of Rhino and try that."
endif
	@echo "JS shell command is: $(JS_SHELL)"

font-test:
	@echo "font test stub."

# make lint
#
# This target runs the Closure Linter on most of our JS files.
# To install gjslint, see:
#
# <http://code.google.com/closure/utilities/docs/linter_howto.html>
SRC_DIRS := . utils worker web
GJSLINT_FILES = $(foreach DIR,$(SRC_DIRS),$(wildcard $(DIR)/*.js))
lint:
	gjslint $(GJSLINT_FILES)

# make web
#
# This target produces the website for the project, by checking out
# the gh-pages branch underneath the build directory, and then move
# the various viewer files into place.
#
# TODO: Use the Closure compiler to optimize the pdf.js files.
#
GH_PAGES = $(BUILD_DIR)/gh-pages
web: | compiler pages-repo \
	$(addprefix $(GH_PAGES)/, $(PDF_JS_FILES)) \
	$(addprefix $(GH_PAGES)/, $(wildcard web/*.*)) \
	$(addprefix $(GH_PAGES)/, $(wildcard web/images/*.*))

	@cp $(GH_PAGES)/web/index.html.template $(GH_PAGES)/index.html;
	@cd $(GH_PAGES); git add -A;
	@echo "Website built in $(GH_PAGES)."

# make pages-repo
#
# This target clones the gh-pages repo into the build directory. It
# deletes the current contents of the repo, since we overwrite
# everything with data from the master repo. The 'make web' target
# then uses 'git add -A' to track additions, modifications, moves,
# and deletions.
pages-repo: | $(BUILD_DIR)
	@if [ ! -d "$(GH_PAGES)" ]; then \
	git clone -b gh-pages $(REPO) $(GH_PAGES); \
	rm -rf $(GH_PAGES)/*; \
	fi;
	@mkdir -p $(GH_PAGES)/web;
	@mkdir -p $(GH_PAGES)/web/images;

$(GH_PAGES)/%.js: %.js
	@cp $< $@

$(GH_PAGES)/web/%: web/%
	@cp $< $@

$(GH_PAGES)/web/images/%: web/images/%
	@cp $< $@

# make compiler
#
# This target downloads the Closure compiler, and places it in the
# build directory. This target is also useful when the user doesn't
# have a JS shell available--we can have them use the Rhino shell that
# comes with Closure.
COMPILER_URL = http://closure-compiler.googlecode.com/files/compiler-latest.zip

compiler: $(BUILD_DIR)/compiler.zip
$(BUILD_DIR)/compiler.zip: | $(BUILD_DIR)
	curl $(COMPILER_URL) > $(BUILD_DIR)/compiler.zip;
	cd $(BUILD_DIR); unzip compiler.zip compiler.jar;

# Make sure there's a build directory.
$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

clean:
	rm -rf $(BUILD_DIR)

# make help
#
# This target just prints out a message to read these comments. :)
help:
	@echo "Read the comments in the Makefile for guidance.";

.PHONY: all test browser-test font-test shell-test \
	shell-msg lint clean web compiler help server
