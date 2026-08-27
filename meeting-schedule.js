"use strict";

/* =========================================================
   Configuration
   ========================================================= */

const MEETINGS_API_URL =
  "/api/meetings";

const DEFAULT_TIME_ZONE =
  "America/Chicago";

const TIME_ZONE_STORAGE_KEY =
  "pickel_lab_meeting_timezone";

const AUTO_REFRESH_INTERVAL =
  60 * 1000;

const SUPPORTED_TIME_ZONES =
  new Set([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ]);

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/* =========================================================
   Elements
   ========================================================= */

const previousWeekButton =
  document.querySelector(
    "#previous-week"
  );

const currentWeekButton =
  document.querySelector(
    "#current-week"
  );

const nextWeekButton =
  document.querySelector(
    "#next-week"
  );

const refreshMeetingsButton =
  document.querySelector(
    "#refresh-meetings"
  );

const timezoneSelect =
  document.querySelector(
    "#meeting-timezone-select"
  );

const weekLabel =
  document.querySelector(
    "#meeting-week-label"
  );

const syncStatus =
  document.querySelector(
    "#meeting-sync-status"
  );

const meetingWeek =
  document.querySelector(
    "#meeting-week"
  );

const statusMessage =
  document.querySelector(
    "#meeting-status-message"
  );

/* =========================================================
   State
   ========================================================= */

let selectedTimeZone =
  DEFAULT_TIME_ZONE;

let weekAnchor =
  new Date();

let events = [];

let refreshTimer = null;

/* =========================================================
   Initialization
   ========================================================= */

initialize();

async function initialize() {
  validateElements();

  initializeTimeZone();

  attachEventListeners();

  updateTimeZoneLabels();

  await loadMeetings();

  refreshTimer =
    window.setInterval(
      () => {
        loadMeetings({
          silent: true,
        });
      },
      AUTO_REFRESH_INTERVAL
    );
}

/* =========================================================
   Validation
   ========================================================= */

function validateElements() {
  const required = {
    previousWeekButton,
    currentWeekButton,
    nextWeekButton,
    refreshMeetingsButton,
    timezoneSelect,
    weekLabel,
    syncStatus,
    meetingWeek,
    statusMessage,
  };

  const missing =
    Object.entries(required)
      .filter(
        ([, element]) =>
          !element
      )
      .map(
        ([name]) =>
          name
      );

  if (missing.length > 0) {
    throw new Error(
      "Missing HTML elements: " +
      missing.join(", ")
    );
  }

  if (
    !window.pickelAuth ||
    typeof window.pickelAuth.fetch !==
      "function"
  ) {
    throw new Error(
      "auth-guard.js was not loaded correctly."
    );
  }
}

/* =========================================================
   Events
   ========================================================= */

function attachEventListeners() {
  previousWeekButton.addEventListener(
    "click",
    async () => {
      weekAnchor =
        addDays(
          weekAnchor,
          -7
        );

      await loadMeetings();
    }
  );

  nextWeekButton.addEventListener(
    "click",
    async () => {
      weekAnchor =
        addDays(
          weekAnchor,
          7
        );

      await loadMeetings();
    }
  );

  currentWeekButton.addEventListener(
    "click",
    async () => {
      weekAnchor =
        new Date();

      await loadMeetings();
    }
  );

  refreshMeetingsButton.addEventListener(
    "click",
    () => {
      loadMeetings();
    }
  );

  timezoneSelect.addEventListener(
    "change",
    () => {
      selectedTimeZone =
        SUPPORTED_TIME_ZONES.has(
          timezoneSelect.value
        )
          ? timezoneSelect.value
          : DEFAULT_TIME_ZONE;

      timezoneSelect.value =
        selectedTimeZone;

      localStorage.setItem(
        TIME_ZONE_STORAGE_KEY,
        selectedTimeZone
      );

      renderWeek();
    }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      if (refreshTimer) {
        clearInterval(
          refreshTimer
        );
      }
    }
  );
}

/* =========================================================
   Time zone
   ========================================================= */

function initializeTimeZone() {
  const saved =
    localStorage.getItem(
      TIME_ZONE_STORAGE_KEY
    );

  if (
    saved &&
    SUPPORTED_TIME_ZONES.has(
      saved
    )
  ) {
    selectedTimeZone =
      saved;
  } else {
    selectedTimeZone =
      detectTimeZone();
  }

  timezoneSelect.value =
    selectedTimeZone;
}

function detectTimeZone() {
  let zone = "";

  try {
    zone =
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }

  const aliases = {
    "US/Eastern":
      "America/New_York",

    "US/Central":
      "America/Chicago",

    "US/Mountain":
      "America/Denver",

    "US/Pacific":
      "America/Los_Angeles",

    "America/Detroit":
      "America/New_York",

    "America/Indiana/Indianapolis":
      "America/New_York",

    "America/Boise":
      "America/Denver",
  };

  zone =
    aliases[zone] ??
    zone;

  return SUPPORTED_TIME_ZONES.has(
    zone
  )
    ? zone
    : DEFAULT_TIME_ZONE;
}

function updateTimeZoneLabels() {
  const names = {
    "America/New_York":
      "Eastern Time",

    "America/Chicago":
      "Central Time",

    "America/Denver":
      "Mountain Time",

    "America/Los_Angeles":
      "Pacific Time",
  };

  for (
    const option
    of timezoneSelect.options
  ) {
    const abbreviation =
      getTimeZoneAbbreviation(
        option.value
      );

    option.textContent =
      `${names[option.value]} (${abbreviation})`;
  }
}

function getTimeZoneAbbreviation(
  timeZone
) {
  try {
    const parts =
      new Intl.DateTimeFormat(
        "en-US",
        {
          timeZone,
          timeZoneName:
            "short",
        }
      )
        .formatToParts(
          new Date()
        );

    return (
      parts.find(
        item =>
          item.type ===
          "timeZoneName"
      )?.value ??
      ""
    );
  } catch {
    return "";
  }
}

/* =========================================================
   Load meetings
   ========================================================= */

async function loadMeetings(
  options = {}
) {
  const silent =
    options.silent === true;

  if (!silent) {
    setBusy(true);

    setStatus(
      "Loading meeting schedule..."
    );
  } else {
    syncStatus.textContent =
      "Checking for updates...";
  }

  const weekStart =
    getWeekStart(
      weekAnchor
    );

  /*
    Add a safety margin around the requested week because
    timezone conversion can move an event across a day edge.
  */

  const requestStart =
    addDays(
      weekStart,
      -2
    );

  const requestEnd =
    addDays(
      weekStart,
      9
    );

  const query =
    new URLSearchParams({
      start:
        requestStart
          .toISOString(),

      end:
        requestEnd
          .toISOString(),
    });

  try {
    const response =
      await window
        .pickelAuth
        .fetch(
          `${MEETINGS_API_URL}?${query.toString()}`,
          {
            method: "GET",
          }
        );

    let payload = {};

    try {
      payload =
        await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(
        payload.error ??
        "Could not load meeting calendar."
      );
    }

    events =
      Array.isArray(
        payload.events
      )
        ? payload.events
        : [];

    renderWeek();

    updateSyncStatus(
      payload.fetched_at
    );

    setStatus("");
  } catch (error) {
    console.error(
      "Meeting schedule error:",
      error
    );

    if (
      error?.message !==
      "Authentication required."
    ) {
      setStatus(
        error?.message ??
        "Could not load meeting schedule."
      );

      syncStatus.textContent =
        "Unable to update calendar";
    }
  } finally {
    if (!silent) {
      setBusy(false);
    }
  }
}

/* =========================================================
   Render
   ========================================================= */

function renderWeek() {
  meetingWeek.innerHTML =
    "";

  const weekStart =
    getWeekStart(
      weekAnchor
    );

  const weekEnd =
    addDays(
      weekStart,
      7
    );

  weekLabel.textContent =
    formatWeekRange(
      weekStart,
      addDays(
        weekStart,
        6
      )
    );

  for (
    let dayOffset = 0;
    dayOffset < 7;
    dayOffset += 1
  ) {
    const dayDate =
      addDays(
        weekStart,
        dayOffset
      );

    const column =
      document.createElement(
        "section"
      );

    column.className =
      "meeting-day";

    if (
      isTodayInSelectedTimeZone(
        dayDate
      )
    ) {
      column.classList.add(
        "today"
      );
    }

    const header =
      document.createElement(
        "header"
      );

    header.className =
      "meeting-day-header";

    const dayName =
      document.createElement(
        "strong"
      );

    dayName.textContent =
      DAY_NAMES[
        dayOffset
      ];

    const dateText =
      document.createElement(
        "span"
      );

    dateText.textContent =
      formatDateOnly(
        dayDate
      );

    header.append(
      dayName,
      dateText
    );

    column.appendChild(
      header
    );

    const dayEvents =
      getEventsForDay(
        dayDate,
        events
      );

    if (
      dayEvents.length === 0
    ) {
      const empty =
        document.createElement(
          "p"
        );

      empty.className =
        "meeting-empty";

      empty.textContent =
        "No meetings";

      column.appendChild(
        empty
      );
    } else {
      for (
        const event
        of dayEvents
      ) {
        column.appendChild(
          createMeetingCard(
            event
          )
        );
      }
    }

    meetingWeek.appendChild(
      column
    );
  }
}

/* =========================================================
   Event grouping
   ========================================================= */

function getEventsForDay(
  day,
  sourceEvents
) {
  const targetKey =
    formatDateKey(
      day
    );

  return sourceEvents
    .filter(
      event => {
        const start =
          new Date(
            event.start
          );

        if (
          Number.isNaN(
            start.getTime()
          )
        ) {
          return false;
        }

        return (
          formatDateKeyInTimeZone(
            start,
            selectedTimeZone
          ) ===
          targetKey
        );
      }
    )
    .sort(
      (first, second) =>
        new Date(
          first.start
        ) -
        new Date(
          second.start
        )
    );
}

/* =========================================================
   Meeting card
   ========================================================= */

function createMeetingCard(
  event
) {
  const card =
    document.createElement(
      "article"
    );

  card.className =
    "meeting-card";

  const title =
    document.createElement(
      "h3"
    );

  title.textContent =
    event.title ||
    "Untitled meeting";

  card.appendChild(
    title
  );

  const time =
    document.createElement(
      "div"
    );

  time.className =
    "meeting-time";

  if (event.all_day) {
    time.textContent =
      "All day";
  } else {
    const start =
      new Date(
        event.start
      );

    const end =
      new Date(
        event.end
      );

    time.textContent =
      `${formatMeetingTime(start)} – ` +
      `${formatMeetingTime(end)}`;
  }

  card.appendChild(
    time
  );

  if (event.location) {
    const location =
      document.createElement(
        "div"
      );

    location.className =
      "meeting-location";

    location.textContent =
      event.location;

    card.appendChild(
      location
    );
  }

  if (event.recurring) {
    const recurring =
      document.createElement(
        "span"
      );

    recurring.className =
      "meeting-recurring";

    recurring.textContent =
      "Recurring";

    card.appendChild(
      recurring
    );
  }

  return card;
}

/* =========================================================
   Formatting
   ========================================================= */

function formatMeetingTime(
  date
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        selectedTimeZone,

      hour:
        "numeric",

      minute:
        "2-digit",

      hour12:
        true,

      timeZoneName:
        "short",
    }
  ).format(date);
}

function formatDateOnly(
  date
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      month:
        "short",

      day:
        "numeric",
    }
  ).format(date);
}

function formatWeekRange(
  start,
  end
) {
  const startText =
    new Intl.DateTimeFormat(
      "en-US",
      {
        month:
          "short",

        day:
          "numeric",
      }
    ).format(start);

  const endText =
    new Intl.DateTimeFormat(
      "en-US",
      {
        month:
          "short",

        day:
          "numeric",

        year:
          "numeric",
      }
    ).format(end);

  return (
    `${startText} – ${endText}`
  );
}

function updateSyncStatus(
  timestamp
) {
  const date =
    new Date(
      timestamp
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    syncStatus.textContent =
      "Calendar updated";

    return;
  }

  syncStatus.textContent =
    "Last synced " +
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone:
          selectedTimeZone,

        hour:
          "numeric",

        minute:
          "2-digit",

        second:
          "2-digit",

        timeZoneName:
          "short",
      }
    ).format(date);
}

/* =========================================================
   Week utilities
   ========================================================= */

function getWeekStart(
  date
) {
  const result =
    new Date(
      date
    );

  result.setHours(
    12,
    0,
    0,
    0
  );

  const day =
    result.getDay();

  const difference =
    day === 0
      ? -6
      : 1 - day;

  result.setDate(
    result.getDate() +
    difference
  );

  return result;
}

function addDays(
  date,
  days
) {
  const result =
    new Date(
      date
    );

  result.setDate(
    result.getDate() +
    days
  );

  return result;
}

function formatDateKey(
  date
) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );
}

function formatDateKeyInTimeZone(
  date,
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",
      }
    )
      .formatToParts(
        date
      );

  const values = {};

  for (
    const part
    of parts
  ) {
    if (
      part.type !==
      "literal"
    ) {
      values[
        part.type
      ] =
        part.value;
    }
  }

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}

function isTodayInSelectedTimeZone(
  date
) {
  return (
    formatDateKey(date) ===
    formatDateKeyInTimeZone(
      new Date(),
      selectedTimeZone
    )
  );
}

/* =========================================================
   UI state
   ========================================================= */

function setBusy(
  busy
) {
  previousWeekButton.disabled =
    busy;

  currentWeekButton.disabled =
    busy;

  nextWeekButton.disabled =
    busy;

  refreshMeetingsButton.disabled =
    busy;

  refreshMeetingsButton.textContent =
    busy
      ? "Refreshing..."
      : "Refresh";
}

function setStatus(
  message
) {
  statusMessage.textContent =
    message;
}