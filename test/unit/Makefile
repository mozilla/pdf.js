# Create temporary profile directory name.
TEMP_PROFILE_DIR=./test_reports/temp_profile

# These are the Firefox command line arguments.
FIREFOX_ARGS=-no-remote -profile $(TEMP_PROFILE_DIR)

# These are the Chrome command line arguments.
CHROME_ARGS=--user-data-dir=$(TEMP_PROFILE_DIR) --no-first-run --disable-sync

# Unit test uses the manifest from ref test to determine which browsers will
# be used for running the unit tests.
MANIFEST=../resources/browser_manifests/browser_manifest.json

# Fetch the paths to browsers that are going to be used in testing.
# For OS X the path to the binary needs to be added.
# Add the browser arguments for each browser.
# Create random profile directory for each browser.
# Replace " with @@@@ so that echoing do not destroy the quotation marks.
BROWSERS_WITH_UKNOWN_RANDOM_PROFILE_PATHS=$(shell echo `\
  sed -n 's|.*"path":\(.*\)|\1,|p' $(MANIFEST) | \
  sed 's|\(Aurora\.app\)|\1/Contents/MacOS/firefox-bin|' | \
  sed 's|\(Firefox.*\.app\)|\1/Contents/MacOS/firefox-bin|' | \
  sed 's|\(Google Chrome\.app\)|\1/Contents/MacOS/Google Chrome|' | \
  sed "s|\(irefox.*\)\",|\1;$(FIREFOX_ARGS)\",|" | \
  sed "s|\(hrome.*\)\",|\1;$(CHROME_ARGS)\",|" | \
  sed 's|\(temp_profile\)|\1_$$(echo $$RANDOM$$RANDOM)|' | \
  sed 's|"|@@@@|g' | \
  tr -d '\n' \
`)

# Echo the variable so that the unknown random directories become known.
# Replace @@@@ with " so that jsTestDriver will work properly.
BROWSERS:=$(shell echo "$(BROWSERS_WITH_UKNOWN_RANDOM_PROFILE_PATHS)" | \
  sed 's|@@@@|"|g' \
)

# Split the browsers to separate lines.
# Get the known random directories for browsers. This information will be used
# to create the profile directories beforehand.
# Join the separate lines back together.
PROFILES:=$(shell echo $(BROWSERS) | \
  sed 's|,|\n|g' | \
  sed -n "s|.*\(\..*_[0-9]\+\).*|\1 |p" | \
  tr -d '\n' \
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

test:
	@mkdir -p $(PROFILES)
	$(PROG)
	@rm -rf $(PROFILES)

.phony:: test

