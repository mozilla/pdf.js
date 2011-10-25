REPO = git@github.com:andreasgal/pdf.js.git
BUILD_DIR := build
PDFJS_TARGET := $(BUILD_DIR)/pdf.js
DEFAULT_BROWSERS := resources/browser_manifests/browser_manifest.json
DEFAULT_TESTS := test_manifest.json

EXTENSION_SRC := ./extensions/firefox
EXTENSION_NAME := pdf.js.xpi

# Let folks define custom rules for their clones.
-include local.mk

# JS files needed for pdf.js.
PDF_JS_FILES = \
  core.js \
  util.js \
  canvas.js \
  obj.js \
  function.js \
  charsets.js \
  cidmaps.js \
  colorspace.js \
  core.js \
  crypto.js \
  evaluator.js \
  fonts.js \
  glyphlist.js \
  image.js \
  metrics.js \
  parser.js \
  pattern.js \
  stream.js \
  worker.js \
	$(NULL)

# make server
#
# This target starts a local web server at localhost:8888. This can be
# used for testing all browsers.
server:
	@cd test; python test.py --port=8888;

test: pdfjs shell-test browser-test

#
# Bundle pdf.js
#
pdfjs:
	@echo "Bundling source files..."
	@mkdir -p $(BUILD_DIR)
	@cd src; \
	cat $(PDF_JS_FILES) > all_files.tmp; \
	sed -E '/INSERT_POINT/ r all_files.tmp' pdf.js > ../$(PDFJS_TARGET); \
	rm -f all_files.tmp; \
	cd ..

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
	@if [ ! -f "test/$(PDF_BROWSERS)" ]; then \
	echo "Browser manifest file $(PDF_BROWSERS) does not exist."; \
	echo "Try copying one of the examples" \
              "in test/resources/browser_manifests/"; \
	exit 1; \
	fi;

	cd test; \
	python test.py --reftest \
	--browserManifestFile=$(PDF_BROWSERS) \
	--manifestFile=$(PDF_TESTS)

# # make shell-test
# #
# # This target runs all of the tests that can be run in a JS shell.
# # The shell used is taken from the JS_SHELL environment variable. If
# # that variable is not defined, the script will attempt to use the copy
# # of Rhino that comes with the Closure compiler used for producing the
# # website.
# SHELL_TARGET = $(NULL)
# ifeq ($(JS_SHELL),)
# JS_SHELL := "java -cp $(BUILD_DIR)/compiler.jar"
# JS_SHELL += "com.google.javascript.jscomp.mozilla.rhino.tools.shell.Main"
# SHELL_TARGET = compiler
# endif
# 
# shell-test: shell-msg $(SHELL_TARGET) font-test
# shell-msg:
# ifeq ($(SHELL_TARGET), compiler)
#   @echo "No JS_SHELL env variable present."
#   @echo "The default is to find a copy of Rhino and try that."
# endif
#   @echo "JS shell command is: $(JS_SHELL)"
# 
# font-test:
#   @echo "font test stub."

# make lint
#
# This target runs the Closure Linter on most of our JS files.
# To install gjslint, see:
#
# <http://code.google.com/closure/utilities/docs/linter_howto.html>
SRC_DIRS := . utils web test examples/helloworld extensions/firefox \
            extensions/firefox/components
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
web: | extension compiler pages-repo \
	$(addprefix $(GH_PAGES)/, $(PDF_JS_FILES)) \
	$(addprefix $(GH_PAGES)/, $(wildcard web/*.*)) \
	$(addprefix $(GH_PAGES)/, $(wildcard web/images/*.*)) \
	$(addprefix $(GH_PAGES)/, $(wildcard $(EXTENSION_SRC)/*.xpi))

	@cp $(GH_PAGES)/web/index.html.template $(GH_PAGES)/index.html;
	@cd $(GH_PAGES); git add -A;
	@echo
	@echo "Website built in $(GH_PAGES)."
	@echo "Don't forget to cd into $(GH_PAGES)/ and issue 'git commit' to push changes."

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
	@mkdir -p $(GH_PAGES)/$(EXTENSION_SRC);

$(GH_PAGES)/%.js: %.js
	@cp $< $@

$(GH_PAGES)/web/%: web/%
	@cp $< $@

$(GH_PAGES)/web/images/%: web/images/%
	@cp $< $@

$(GH_PAGES)/$(EXTENSION_SRC)/%: $(EXTENSION_SRC)/%
	@cp -R $< $@

# # make compiler
# #
# # This target downloads the Closure compiler, and places it in the
# # build directory. This target is also useful when the user doesn't
# # have a JS shell available--we can have them use the Rhino shell that
# # comes with Closure.
# COMPILER_URL = http://closure-compiler.googlecode.com/files/compiler-latest.zip
# 
# compiler: $(BUILD_DIR)/compiler.zip
# $(BUILD_DIR)/compiler.zip: | $(BUILD_DIR)
#   curl $(COMPILER_URL) > $(BUILD_DIR)/compiler.zip;
#   cd $(BUILD_DIR); unzip compiler.zip compiler.jar;

# make extension
#
# This target produce a restartless firefox extension containing a
# copy of the pdf.js source.
CONTENT_DIR := content
PDF_WEB_FILES = \
	web/images \
	web/compatibility.js \
	web/viewer.css \
	web/viewer.js \
	web/viewer.html \
	$(NULL)
extension: | pdfjs
	# Copy a standalone version of pdf.js inside the content directory
	@rm -Rf $(EXTENSION_SRC)/$(CONTENT_DIR)/
	@mkdir -p $(EXTENSION_SRC)/$(CONTENT_DIR)/$(BUILD_DIR)
	@mkdir -p $(EXTENSION_SRC)/$(CONTENT_DIR)/web
	@cp $(PDFJS_TARGET) $(EXTENSION_SRC)/$(CONTENT_DIR)/$(BUILD_DIR)
	@cp -r $(PDF_WEB_FILES) $(EXTENSION_SRC)/$(CONTENT_DIR)/web/

	# Create the xpi
	@cd $(EXTENSION_SRC); zip -r $(EXTENSION_NAME) *
	@echo "extension created: " $(EXTENSION_NAME)


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

#
# Watch for file changes, regenerate pdf.js if change found
#
watch:
	@echo "Watching for file changes in src/"
	@python watch.py src/*.js - 'make pdfjs'

.PHONY:: all pdfjs watch test browser-test font-test shell-test \
	shell-msg lint clean web compiler help server
