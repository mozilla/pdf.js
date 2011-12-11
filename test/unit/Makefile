# Fetch the paths to browsers that are going to be used in testing.
MANIFEST=../resources/browser_manifests/browser_manifest.json
BROWSERS=$(shell echo `sed -n 's/.*"path":\(.*\)/\1,/p' $(MANIFEST) | tr -d '\n' | \
  sed 's/\(Google Chrome\.app\)/\1\/Contents\/MacOS\/Google Chrome/' | \
  sed 's/\(Firefox[ Beta]*\.app\)/\1\/Contents\/MacOS\/firefox-bin/' \
`)

# Command to invoke the unit test.
PROG=java \
-Xms512m \
-Xmx1024m \
-jar ../../external/jsTestDriver/JsTestDriver-1.3.3d.jar \
--reset \
--port 4224 \
--browser $(BROWSERS) \
--tests all \
--testOutput ./test_reports/

test:
	$(PROG)

.phony:: test

