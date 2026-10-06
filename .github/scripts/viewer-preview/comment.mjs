import fs from "fs";
import path from "path";
import process from "process";
import { stripVTControlCharacters } from "util";

const MARKER = "<!-- viewer-preview -->";
const TARGETS = [
  { name: "generic", title: "Modern" },
  { name: "generic-legacy", title: "Legacy" },
];
const MAX_ERROR_LINES = 80;
const MAX_ERROR_CHARS = 12000;

const {
  ARTIFACT,
  SITE,
  PR,
  HEAD_SHA,
  BUILD_RUN_URL,
  RUN_URL,
  PREVIEW_URL,
  ACTION,
  APPROVAL,
  PUBLISH_OUTCOME,
  DEPLOY,
  RETENTION_DAYS,
  LABEL,
} = process.env;

function readMeta() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(ARTIFACT, "meta.json"), "utf8")
    );
  } catch {
    return {};
  }
}

function readLog(target) {
  try {
    return fs.readFileSync(
      path.join(ARTIFACT, "logs", `${target}.log`),
      "utf8"
    );
  } catch {
    return "";
  }
}

function isPublished(target) {
  return fs.existsSync(path.join(SITE, target, "web", "viewer.html"));
}

function extractErrors(log) {
  const lines = stripVTControlCharacters(log)
    .replaceAll(/\/home\/runner\/work\/[^/\s]+\/[^/\s]+\//g, "")
    .split(/\r?\n/);
  const errors = [];
  let inError = false;
  let failed = false;
  for (const line of lines) {
    if (/^\s+at /.test(line)) {
      continue;
    }
    if (line.startsWith("ERROR in ")) {
      inError = true;
    } else if (/^webpack \S+ compiled/.test(line)) {
      inError = false;
    } else if (/^\[[\d:]+\] '.+' errored after/.test(line)) {
      failed = true;
    }
    if (inError || failed) {
      errors.push(line);
    }
  }
  const selected = errors.length ? errors : lines.slice(-MAX_ERROR_LINES);
  let text = selected.slice(0, MAX_ERROR_LINES).join("\n").trim();
  if (selected.length > MAX_ERROR_LINES || text.length > MAX_ERROR_CHARS) {
    text = `${text.slice(0, MAX_ERROR_CHARS)}\n…`;
  }
  return text;
}

function codeBlock(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map(s => s.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

const meta = readMeta();
const trusted = ACTION === "publish";
const results = TARGETS.map(target => ({
  ...target,
  built: meta.targets?.[target.name] === "success",
}));

const body = [MARKER, "### Viewer preview", ""];

if (ACTION === "remove") {
  body.push(":wastebasket: Viewer previews removed.");
} else if (meta.install !== "success") {
  body.push(
    `Commit ${HEAD_SHA} ([build logs](${BUILD_RUN_URL})).`,
    "",
    ":x: Dependencies were not installed; no viewer was built."
  );
} else {
  body.push(
    `Commit ${HEAD_SHA} ([build logs](${BUILD_RUN_URL})).`,
    "",
    "| Viewer | Build | Preview |",
    "| --- | --- | --- |"
  );
  for (const { name, title, built } of results) {
    let preview = "–";
    if (built) {
      if (!trusted) {
        preview = "not published";
      } else if (PUBLISH_OUTCOME !== "success") {
        preview = ":warning: not published";
      } else if (isPublished(name)) {
        preview =
          DEPLOY === "pending"
            ? ":hourglass: waiting"
            : `[viewer.html](${PREVIEW_URL}/${PR}/${name}/web/viewer.html)`;
      }
    }
    body.push(
      `| ${title} (\`gulp ${name}\`) | ${built ? ":white_check_mark:" : ":x:"} | ${preview} |`
    );
  }
  body.push("");

  for (const { name, built } of results) {
    if (built) {
      continue;
    }
    body.push(
      `<details open><summary>Errors from <code>gulp ${name}</code></summary>`,
      "",
      codeBlock(extractErrors(readLog(name))),
      "",
      "</details>",
      ""
    );
  }

  if (!results.some(r => r.built)) {
    body.push("No viewer was built.");
  } else if (!trusted && APPROVAL === "timeout") {
    body.push(
      `:hourglass: Timed out waiting for \`${LABEL}\` approval. ` +
        "To retry, re-add the label (remove it first if still present)."
    );
  } else if (!trusted) {
    body.push(
      `:lock: A user with write access must approve this commit with the \`${LABEL}\` label to publish the viewers.`
    );
  } else if (PUBLISH_OUTCOME !== "success") {
    body.push(
      `:warning: Publication did not complete; see the [workflow run](${RUN_URL}).`
    );
  } else if (DEPLOY === "pending") {
    body.push(":hourglass: Waiting for preview deployment.");
  } else {
    if (DEPLOY === "timeout") {
      body.push(
        ":warning: Deployment unconfirmed; preview links may be unavailable.",
        ""
      );
    }
    body.push(
      `Previews are removed when the PR closes and may be pruned after ${RETENTION_DAYS} days without an update.`
    );
  }
}

process.stdout.write(`${body.join("\n").trim()}\n`);
