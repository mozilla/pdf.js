# Create temporary profile directory name.
TEMP_PROFILE:=$(shell echo `pwd`)/test_reports/temp_profile

# These are the Firefox command line arguments.
FIREFOX_ARGS:=-no-remote -profile $(TEMP_PROFILE)

# These are the Chrome command line arguments.
CHROME_ARGS:=--user-data-dir=$(TEMP_PROFILE) --no-first-run --disable-sync

# Unit test uses the manifest from ref test to determine which browsers will
# be used for running the unit tests.
MANIFEST:=../resources/browser_manifests/browser_manifest.json

# This is a helper command to separate multiple browsers to their own lines
# for an easier sed operation.
SPLIT_LINES:=sed 's|,|,@|g' | tr '@' '\n'

# This is a helper command to join multiple lines together.
JOIN_LINES:=tr -d '\n'

# Fetch the paths to browsers that are going to be used in testing.
# For OS X the path to the binary needs to be added.
# Add the browser arguments for each browser.
# Create random profile directory for each browser.
BROWSERS_PATHS:=$(shell echo `\
  sed -n 's|.*"path":\(.*\)|\1,|p' $(MANIFEST) | \
  $(JOIN_LINES) \
`)

# The browser_manifest.json file has only the app directory for mac browsers.
# The absolute path to the browser binary needs to be used.
BROWSERS_PATHS_WITH_MAC_CORRECTION:=$(shell echo '$(BROWSERS_PATHS)' | \
  $(SPLIT_LINES) | \
  sed 's|\(Aurora\.app\)|\1/Contents/MacOS/firefox-bin|' | \
  sed 's|\(Firefox.*\.app\)|\1/Contents/MacOS/firefox-bin|' | \
  sed 's|\(Google Chrome\.app\)|\1/Contents/MacOS/Google Chrome|' | \
  $(JOIN_LINES) \
)

# Replace " with @@@@ so that echoing do not destroy the quotation marks.
QUOTATION_MARK:=\"
SUBSTITUTE_FOR_QUOTATION_MARK:=@@@@

# Each of the browser can have their own separate arguments.
BROWSERS_WITH_ARGUMENTS:=$(shell echo '$(BROWSERS_PATHS_WITH_MAC_CORRECTION)' | \
  $(SPLIT_LINES) | \
  sed "s|\(irefox.*\)\($(QUOTATION_MARK)\),|\1;$(FIREFOX_ARGS)\2,|" | \
  sed "s|\(hrome.*\)\($(QUOTATION_MARK)\),|\1;$(CHROME_ARGS)\2,|" | \
  $(JOIN_LINES) \
)

# A temporary profile directory is needed for each of the browser. In this way
# a unit test run will not disturb the main browsing session of the user. The
# $RANDOM shell variable is used to generate non-conflicting temporary
# directories.
BROWSERS_WITH_UKNOWN_RANDOM_PROFILE_PATHS:=$(shell echo '$(BROWSERS_WITH_ARGUMENTS)' | \
  $(SPLIT_LINES) | \
  sed 's|\(temp_profile\)|\1_$$RANDOM$$RANDOM|' | \
  sed "s|$(QUOTATION_MARK)|$(SUBSTITUTE_FOR_QUOTATION_MARK)|g" | \
  $(JOIN_LINES) \
)

# Echo the variable so that the unknown random directories become known.
# Replace @@@@ with " so that jsTestDriver will work properly.
BROWSERS:=$(shell echo "$(BROWSERS_WITH_UKNOWN_RANDOM_PROFILE_PATHS)" | \
  sed "s|$(SUBSTITUTE_FOR_QUOTATION_MARK)|$(QUOTATION_MARK)|g" \
)

# Get the known random directories for browsers. This information will be used
# to create the profile directories beforehand. Create also the dummy temp
# profile directory so that the mkdir command would not fail for browsers that
# do not need it.
PROFILES:=$(TEMP_PROFILE) $(shell echo '$(BROWSERS)' | \
  $(SPLIT_LINES) | \
  sed -n "s|.*\( $(TEMP_PROFILE)_[0-9]\+\).*|\1|p" | \
  $(JOIN_LINES) \
)

# This is the command to invoke the unit test.
PROG:=java \
-Xms512m \
-Xmx1024m \
-jar ../../external/jsTestDriver/JsTestDriver-1.3.3d.jar \
--config ./jsTestDriver.conf \
--reset \
--port 4224 \
--browser $(BROWSERS) \
--tests all \
--testOutput ./test_reports/

# This default rule runs the unit tests with the constructed command.
test:
	@mkdir -p $(PROFILES)
	$(PROG)
	@rm -rf $(PROFILES)

# In case this Makefile needs to be debugged then this rule will provide all
# the information from intermediate steps.
debug:
	@echo 'Debug browsers paths: $(BROWSERS_PATHS)'
	@echo
	@echo 'Debug browsers paths with mac correction: $(BROWSERS_PATHS_WITH_MAC_CORRECTION)'
	@echo
	@echo 'Debug browsers with arguments: $(BROWSERS_WITH_ARGUMENTS)'
	@echo
	@echo 'Debug browsers random profile paths: $(BROWSERS_WITH_UKNOWN_RANDOM_PROFILE_PATHS)'
	@echo
	@echo 'Debug browsers: $(BROWSERS)'
	@echo
	@echo 'Debug profiles: $(PROFILES)'
	@echo
	@echo 'Command to be run: $(PROG)'
	@echo

.phony:: test

