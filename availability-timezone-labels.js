"use strict";

(() => {
  const TIME_ZONE_LABELS = {
    "America/New_York": "US Eastern Time",
    "America/Chicago": "US Central Time",
    "America/Denver": "US Mountain Time",
    "America/Los_Angeles": "US Pacific Time",
  };

  const ABBREVIATION_PATTERN = /\s\((?:EDT|EST|CDT|CST|MDT|MST|PDT|PST)\)/g;
  const TRAILING_ABBREVIATION_PATTERN = /\s(?:EDT|EST|CDT|CST|MDT|MST|PDT|PST)\b/g;

  function applySelectLabels() {
    const select = document.querySelector("#timezone-select");
    if (!select) return;

    for (const option of select.options) {
      if (TIME_ZONE_LABELS[option.value]) {
        option.textContent = TIME_ZONE_LABELS[option.value];
      } else {
        option.textContent = option.textContent.replace(ABBREVIATION_PATTERN, "");
      }
    }
  }

  function cleanTimeZoneText(element) {
    if (!element) return;

    const select = document.querySelector("#timezone-select");
    const zoneLabel = select
      ? TIME_ZONE_LABELS[select.value]
      : "";

    let text = element.textContent ?? "";
    text = text
      .replace(ABBREVIATION_PATTERN, "")
      .replace(TRAILING_ABBREVIATION_PATTERN, "")
      .trim();

    if (zoneLabel && element.id === "last-updated-message" && text && !text.includes(zoneLabel)) {
      text += ` · ${zoneLabel}`;
    }

    if (zoneLabel && element.id === "availability-details-title" && text && !text.includes(zoneLabel)) {
      text += ` · ${zoneLabel}`;
    }

    if (element.textContent !== text) {
      element.textContent = text;
    }
  }

  function applyAllLabels() {
    applySelectLabels();
    cleanTimeZoneText(document.querySelector("#last-updated-message"));
    cleanTimeZoneText(document.querySelector("#availability-details-title"));
  }

  function initialize() {
    applyAllLabels();

    const select = document.querySelector("#timezone-select");
    if (select) {
      select.addEventListener("change", () => {
        queueMicrotask(applyAllLabels);
      });
    }

    const observer = new MutationObserver(() => {
      applyAllLabels();
    });

    const lastUpdated = document.querySelector("#last-updated-message");
    const detailsTitle = document.querySelector("#availability-details-title");

    if (lastUpdated) {
      observer.observe(lastUpdated, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    if (detailsTitle) {
      observer.observe(detailsTitle, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
