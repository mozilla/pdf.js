/* PDF.js Annotation Events Sandbox - Event Logging */

import {
  apiEventLog,
  apiEventFilter,
  autoScrollApi,
  legacyEventLog,
  legacyEventFilter,
  autoScrollLegacy,
} from "./dom-elements.js";

// Counter variables
let apiEventCounter = 0;
let legacyEventCounter = 0;

// Log an API event to the API event log
function logApiEvent(message, category, data) {
  const entry = document.createElement("div");
  entry.className = `event-entry ${category || ""}`;
  entry.dataset.category = category || "";
  entry.dataset.id = ++apiEventCounter;

  const timeSpan = document.createElement("div");
  timeSpan.className = "event-time";
  timeSpan.textContent = new Date().toLocaleTimeString();

  const messageSpan = document.createElement("div");
  messageSpan.className = "event-type";
  messageSpan.textContent = message;

  entry.appendChild(timeSpan);
  entry.appendChild(messageSpan);

  if (data) {
    const dataToggle = document.createElement("div");
    dataToggle.className = "event-data-toggle";
    dataToggle.textContent = "Show data";
    dataToggle.addEventListener("click", () => {
      const dataDiv = entry.querySelector(".event-data");
      if (dataDiv.style.display === "none") {
        dataDiv.style.display = "block";
        dataToggle.textContent = "Hide data";
      } else {
        dataDiv.style.display = "none";
        dataToggle.textContent = "Show data";
      }
    });

    const dataDiv = document.createElement("div");
    dataDiv.className = "event-data";
    dataDiv.style.display = "none";
    dataDiv.textContent = JSON.stringify(data, null, 2);

    entry.appendChild(dataToggle);
    entry.appendChild(dataDiv);
  }

  apiEventLog.appendChild(entry);

  if (autoScrollApi.checked) {
    apiEventLog.scrollTop = apiEventLog.scrollHeight;
  }

  // Apply current filter
  filterEventLog("api");
}

// Log a legacy event to the legacy event log
function logLegacyEvent(message, category, data) {
  const entry = document.createElement("div");
  entry.className = `event-entry ${category || ""}`;
  entry.dataset.category = category || "";
  entry.dataset.id = ++legacyEventCounter;

  const timeSpan = document.createElement("div");
  timeSpan.className = "event-time";
  timeSpan.textContent = new Date().toLocaleTimeString();

  const messageSpan = document.createElement("div");
  messageSpan.className = "event-type";
  messageSpan.textContent = message;

  entry.appendChild(timeSpan);
  entry.appendChild(messageSpan);

  if (data) {
    const dataToggle = document.createElement("div");
    dataToggle.className = "event-data-toggle";
    dataToggle.textContent = "Show data";
    dataToggle.addEventListener("click", () => {
      const dataDiv = entry.querySelector(".event-data");
      if (dataDiv.style.display === "none") {
        dataDiv.style.display = "block";
        dataToggle.textContent = "Hide data";
      } else {
        dataDiv.style.display = "none";
        dataToggle.textContent = "Show data";
      }
    });

    const dataDiv = document.createElement("div");
    dataDiv.className = "event-data";
    dataDiv.style.display = "none";
    dataDiv.textContent = JSON.stringify(data, null, 2);

    entry.appendChild(dataToggle);
    entry.appendChild(dataDiv);
  }

  legacyEventLog.appendChild(entry);

  if (autoScrollLegacy.checked) {
    legacyEventLog.scrollTop = legacyEventLog.scrollHeight;
  }

  // Apply current filter
  filterEventLog("legacy");
}

// Filter the event log based on the selected filter
function filterEventLog(logType) {
  if (logType === "api" || logType === "both") {
    const filter = apiEventFilter.value;
    const entries = apiEventLog.querySelectorAll(".event-entry");

    entries.forEach(entry => {
      if (filter === "all" || entry.dataset.category === filter) {
        entry.style.display = "block";
      } else {
        entry.style.display = "none";
      }
    });
  }

  if (logType === "legacy" || logType === "both") {
    const filter = legacyEventFilter.value;
    const entries = legacyEventLog.querySelectorAll(".event-entry");

    entries.forEach(entry => {
      if (filter === "all" || entry.dataset.category === filter) {
        entry.style.display = "block";
      } else {
        entry.style.display = "none";
      }
    });
  }
}

// Clear the API event log
function clearApiEventLog() {
  apiEventLog.innerHTML = "";
  apiEventCounter = 0;
  logApiEvent("API Event log cleared", "ui");
}

// Clear the legacy event log
function clearLegacyEventLog() {
  legacyEventLog.innerHTML = "";
  legacyEventCounter = 0;
  logLegacyEvent("Legacy Event log cleared", "ui");
}

// Clear all event logs
function clearAllEventLogs() {
  clearApiEventLog();
  clearLegacyEventLog();
}

export {
  logApiEvent,
  logLegacyEvent,
  filterEventLog,
  clearApiEventLog,
  clearLegacyEventLog,
  clearAllEventLogs,
};
