REPO = git@github.com:mozilla/pdf.js.git
BUILD_DIR := build
BUILD_TARGET := $(BUILD_DIR)/pdf.js
DEFAULT_BROWSERS := resources/browser_manifests/browser_manifest.json
DEFAULT_TESTS := test_manifest.json
DEFAULT_PYTHON := python2.7

EXTENSION_SRC := ./extensions/
EXTENSION_BASE_VERSION := 4bb289ec499013de66eb421737a4dbb4a9273eda
FIREFOX_EXTENSION_NAME := pdf.js.xpi
FIREFOX_AMO_EXTENSION_NAME := pdf.js.amo.xpi
CHROME_EXTENSION_NAME := pdf.js.crx

all: bundle

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
  ../external/jpgjs/jpg.js \
  jpx.js \
	$(NULL)

# make server
#
# This target starts a local web server at localhost:8888. This can be
# used for testing all browsers.
server:
	@cd test; $(DEFAULT_PYTHON) test.py --port=8888;

# make test
#
# This target runs all the tests excluding the unit-test. This can be used for
# testing all browsers.
test: shell-test browser-test

#
# Create production output (pdf.js, and corresponding changes to web files)
#
production: | bundle
	@echo "Preparing web/viewer-production.html"; \
	cd web; \
	sed '/PDFJSSCRIPT_REMOVE/d' viewer.html > viewer-1.tmp; \
	sed '/PDFJSSCRIPT_INCLUDE_BUILD/ r viewer-snippet.html' viewer-1.tmp > viewer-production.html; \
	rm -f *.tmp; \
	cd ..

#
# Bundle pdf.js
#
bundle: | $(BUILD_DIR)
	@echo "Bundling source files into $(BUILD_TARGET)"
	@cd src; \
	cat $(PDF_JS_FILES) > all_files.tmp; \
	sed '/PDFJSSCRIPT_INCLUDE_ALL/ r all_files.tmp' pdf.js > ../$(BUILD_TARGET); \
	sed -i.bak "s/PDFJSSCRIPT_BUNDLE_VER/`git log --format="%h" -n 1`/" ../$(BUILD_TARGET); \
	rm -f ../$(BUILD_TARGET).bak; \
	rm -f *.tmp; \
	cd ..

# make unit-test
#
# This target runs in-browser unit tests with js-test-driver and jasmine unit
# test framework.
unit-test:
	@cd test/unit/ ; make ;

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
	$(DEFAULT_PYTHON) test.py --reftest \
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
SRC_DIRS := . src utils web test examples/helloworld extensions/firefox \
            extensions/firefox/components extensions/chrome test/unit
GJSLINT_FILES = $(foreach DIR,$(SRC_DIRS),$(wildcard $(DIR)/*.js))
lint:
	gjslint --nojsdoc $(GJSLINT_FILES)

# make web
#
# This target produces the website for the project, by checking out
# the gh-pages branch underneath the build directory, and then move
# the various viewer files into place.
#
# TODO: Use the Closure compiler to optimize the pdf.js files.
#
GH_PAGES = $(BUILD_DIR)/gh-pages
web: | production extension compiler pages-repo
	@cp $(BUILD_TARGET) $(GH_PAGES)/$(BUILD_TARGET)
	@cp -R web/* $(GH_PAGES)/web
	@cp web/images/* $(GH_PAGES)/web/images
	@cp $(FIREFOX_BUILD_DIR)/$(FIREFOX_EXTENSION_NAME) \
		$(FIREFOX_BUILD_DIR)/$(FIREFOX_AMO_EXTENSION_NAME) \
		$(FIREFOX_BUILD_DIR)/update.rdf \
		$(GH_PAGES)/$(EXTENSION_SRC)/firefox/
	@cp $(GH_PAGES)/web/index.html.template $(GH_PAGES)/index.html;
	@mv -f $(GH_PAGES)/web/viewer-production.html $(GH_PAGES)/web/viewer.html;
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
	@mkdir -p $(GH_PAGES)/build;
	@mkdir -p $(GH_PAGES)/$(EXTENSION_SRC)/firefox;

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
BUILD_NUMBER := `git log --format=oneline $(EXTENSION_BASE_VERSION).. | wc -l | awk '{print $$1}'`
PDF_WEB_FILES = \
	web/images \
	web/compatibility.js \
	web/viewer.css \
	web/viewer.js \
	web/viewer-production.html \
	$(NULL)

FIREFOX_BUILD_DIR := $(BUILD_DIR)/firefox
FIREFOX_BUILD_CONTENT := $(FIREFOX_BUILD_DIR)/$(CONTENT_DIR)/
FIREFOX_CONTENT_DIR := $(EXTENSION_SRC)/firefox/$(CONTENT_DIR)/
FIREFOX_EXTENSION_FILES_TO_COPY = \
	*.js \
	*.rdf \
	chrome.manifest \
	components \
	$(NULL)
FIREFOX_EXTENSION_FILES = \
	content \
	*.js \
	install.rdf \
	chrome.manifest \
	components \
	content \
	$(NULL)

CHROME_BUILD_DIR := $(BUILD_DIR)/chrome
CHROME_CONTENT_DIR := $(EXTENSION_SRC)/chrome/$(CONTENT_DIR)/
CHROME_BUILD_CONTENT := $(CHROME_BUILD_DIR)/$(CONTENT_DIR)/
CHROME_EXTENSION_FILES = \
	extensions/chrome/*.json \
	extensions/chrome/*.html \
	$(NULL)
extension: | production
	# Clear out everything in the firefox extension build directory
	@rm -Rf $(FIREFOX_BUILD_DIR)
	@mkdir -p $(FIREFOX_BUILD_CONTENT)
	@mkdir -p $(FIREFOX_BUILD_CONTENT)/$(BUILD_DIR)
	@mkdir -p $(FIREFOX_BUILD_CONTENT)/web
	@cd extensions/firefox; cp -r $(FIREFOX_EXTENSION_FILES_TO_COPY) ../../$(FIREFOX_BUILD_DIR)/
	# Copy a standalone version of pdf.js inside the content directory
	@cp $(BUILD_TARGET) $(FIREFOX_BUILD_CONTENT)/$(BUILD_DIR)/
	@cp -r $(PDF_WEB_FILES) $(FIREFOX_BUILD_CONTENT)/web/
	@mv -f $(FIREFOX_BUILD_CONTENT)/web/viewer-production.html $(FIREFOX_BUILD_CONTENT)/web/viewer.html
	# Update the build version number
	@sed -i.bak "s/PDFJSSCRIPT_BUILD/$(BUILD_NUMBER)/" $(FIREFOX_BUILD_DIR)/install.rdf
	@sed -i.bak "s/PDFJSSCRIPT_BUILD/$(BUILD_NUMBER)/" $(FIREFOX_BUILD_DIR)/update.rdf
	@rm -f $(FIREFOX_BUILD_DIR)/*.bak
	# Create the xpi
	@cd $(FIREFOX_BUILD_DIR); zip -r $(FIREFOX_EXTENSION_NAME) $(FIREFOX_EXTENSION_FILES)
	@echo "extension created: " $(FIREFOX_EXTENSION_NAME)
	# Build the amo extension too (remove the updateUrl)
	@sed -i.bak "/updateURL/d" $(FIREFOX_BUILD_DIR)/install.rdf
	@rm -f $(FIREFOX_BUILD_DIR)/*.bak
	@cd $(FIREFOX_BUILD_DIR); zip -r $(FIREFOX_AMO_EXTENSION_NAME) $(FIREFOX_EXTENSION_FILES)
	@echo "AMO extension created: " $(FIREFOX_AMO_EXTENSION_NAME)

	# Clear out everything in the chrome extension build directory
	@rm -Rf $(CHROME_BUILD_DIR)
	@mkdir -p $(CHROME_BUILD_CONTENT)
	@mkdir -p $(CHROME_BUILD_CONTENT)/$(BUILD_DIR)
	@mkdir -p $(CHROME_BUILD_CONTENT)/web
	@cp -R $(CHROME_EXTENSION_FILES) $(CHROME_BUILD_DIR)/
	# Copy a standalone version of pdf.js inside the content directory
	@cp $(BUILD_TARGET) $(CHROME_BUILD_CONTENT)/$(BUILD_DIR)/
	@cp -r $(PDF_WEB_FILES) $(CHROME_BUILD_CONTENT)/web/
	@mv -f $(CHROME_BUILD_CONTENT)/web/viewer-production.html $(CHROME_BUILD_CONTENT)/web/viewer.html

  # Create the crx
  #TODO



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

.PHONY:: production test browser-test font-test shell-test \
	shell-msg lint clean web compiler help server
