# Create temporary profile directory name.
TEMP_PROFILE_DIR:=$(shell echo ./test_reports/temp`date +"%Y%m%d%H%M%S"profile`)

# These are the Firefox command line arguments.
FIREFOX_ARGS:=-no-remote -profile $(TEMP_PROFILE_DIR)

# These are the Chrome command line arguments.
CHROME_ARGS:=--user-data-dir=$(TEMP_PROFILE_DIR) --no-first-run --disable-sync

# Unit test uses the manifest from ref test to determine which browsers will
# be used for running the unit tests.
MANIFEST:=../resources/browser_manifests/browser_manifest.json

# Fetch the paths to browsers that are going to be used in testing.
# For OS X the path to the binary needs to be added. Also the browser
# arguments are added for each of the browser.
BROWSERS:=$(shell echo `\
  sed -n 's/.*"path":\(.*\)/\1,/p' $(MANIFEST) | \
  tr -d '\n' | \
  sed 's/\(Google Chrome\.app\)/\1\/Contents\/MacOS\/Google Chrome/' | \
  sed 's/\(Aurora\.app\)/\1\/Contents\/MacOS\/firefox-bin/' | \
  sed 's/\(Firefox[ Beta]*\.app\)/\1\/Contents\/MacOS\/firefox-bin/' | \
  sed "s|\(irefox[.exe\-bin]*\)\"|\1;$(FIREFOX_ARGS)\"|g" | \
  sed "s|\(hrome*\)\"|\1;$(CHROME_ARGS)\"|g" \
`)

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
	$(PROG)
	@rm -rf $(TEMP_PROFILE_DIR)

.phony:: test

