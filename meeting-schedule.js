"use strict";

const MEETINGS_API_URL = "/api/meetings";
const DEFAULT_TIME_ZONE = "America/Chicago";
const TIME_ZONE_STORAGE_KEY = "pickel_lab_meeting_timezone";
const VIEW_STORAGE_KEY = "pickel_lab_meeting_view";

const SUPPORTED_TIME_ZONES = new Set([
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

const previousPeriodButton = document.querySelector("#previous-period");
const currentPeriodButton = document.querySelector("#current-period");
const nextPeriodButton = document.querySelector("#next-period");
const refreshMeetingsButton = document.querySelector("#refresh-meetings");
const weekViewButton = document.querySelector("#week-view-button");
const monthViewButton = document.querySelector("#month-view-button");
const timezoneSelect = document.querySelector("#meeting-timezone-select");
const periodLabel = document.querySelector("#meeting-period-label");
const syncStatus = document.querySelector("#meeting-sync-status");
const meetingWeek = document.querySelector("#meeting-week");
const meetingMonthWrap = document.querySelector("#meeting-month-wrap");
const meetingMonthGrid = document.querySelector("#meeting-month-grid");
const statusMessage = document.querySelector("#meeting-status-message");

let selectedTimeZone = DEFAULT_TIME_ZONE;
let selectedView = "week";
let anchorDate = new Date();
let events = [];

initialize();

async function initialize() {
  validateElements();
  initializeTimeZone();
  initializeView();
  attachEventListeners();
  updateTimeZoneLabels();
  updateViewButtons();
  await loadMeetings();
}

function validateElements() {
  const required = {
    previousPeriodButton,
    currentPeriodButton,
    nextPeriodButton,
    refreshMeetingsButton,
    weekViewButton,
    monthViewButton,
    timezoneSelect,
    periodLabel,
    syncStatus,
    meetingWeek,
    meetingMonthWrap,
    meetingMonthGrid,
    statusMessage,
  };

  const missing = Object.entries(required)
    .filter(([, element]) => !element)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error("Missing HTML elements: " + missing.join(", "));
  }

  if (!window.pickelAuth || typeof window.pickelAuth.fetch !== "function") {
    throw new Error("auth-guard.js was not loaded correctly.");
  }
}

function attachEventListeners() {
  previousPeriodButton.addEventListener("click", async () => {
    anchorDate = selectedView === "week"
      ? addDays(anchorDate, -7)
      : addMonths(anchorDate, -1);
    await loadMeetings();
  });

  nextPeriodButton.addEventListener("click", async () => {
    anchorDate = selectedView === "week"
      ? addDays(anchorDate, 7)
      : addMonths(anchorDate, 1);
    await loadMeetings();
  });

  currentPeriodButton.addEventListener("click", async () => {
    anchorDate = new Date();
    await loadMeetings();
  });

  refreshMeetingsButton.addEventListener("click", () => {
    loadMeetings();
  });

  weekViewButton.addEventListener("click", async () => {
    if (selectedView === "week") return;
    selectedView = "week";
    localStorage.setItem(VIEW_STORAGE_KEY, selectedView);
    updateViewButtons();
    await loadMeetings();
  });

  monthViewButton.addEventListener("click", async () => {
    if (selectedView === "month") return;
    selectedView = "month";
    localStorage.setItem(VIEW_STORAGE_KEY, selectedView);
    updateViewButtons();
    await loadMeetings();
  });

  timezoneSelect.addEventListener("change", () => {
    selectedTimeZone = SUPPORTED_TIME_ZONES.has(timezoneSelect.value)
      ? timezoneSelect.value
      : DEFAULT_TIME_ZONE;

    timezoneSelect.value = selectedTimeZone;
    localStorage.setItem(TIME_ZONE_STORAGE_KEY, selectedTimeZone);
    renderCurrentView();
    updateSyncStatusFromCurrentText();
  });
}

function initializeTimeZone() {
  const saved = localStorage.getItem(TIME_ZONE_STORAGE_KEY);
  selectedTimeZone = saved && SUPPORTED_TIME_ZONES.has(saved)
    ? saved
    : detectTimeZone();
  timezoneSelect.value = selectedTimeZone;
}

function initializeView() {
  const saved = localStorage.getItem(VIEW_STORAGE_KEY);
  selectedView = saved === "month" ? "month" : "week";
}

function detectTimeZone() {
  let zone = "";

  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }

  const aliases = {
    "US/Eastern": "America/New_York",
    "US/Central": "America/Chicago",
    "US/Mountain": "America/Denver",
    "US/Pacific": "America/Los_Angeles",
    "America/Detroit": "America/New_York",
    "America/Indiana/Indianapolis": "America/New_York",
    "America/Boise": "America/Denver",
  };

  zone = aliases[zone] ?? zone;
  return SUPPORTED_TIME_ZONES.has(zone) ? zone : DEFAULT_TIME_ZONE;
}

function updateTimeZoneLabels() {
  const names = {
    "America/New_York": "Eastern Time",
    "America/Chicago": "Central Time",
    "America/Denver": "Mountain Time",
    "America/Los_Angeles": "Pacific Time",
  };

  for (const option of timezoneSelect.options) {
    const abbreviation = getTimeZoneAbbreviation(option.value);
    option.textContent = `${names[option.value]} (${abbreviation})`;
  }
}

function getTimeZoneAbbreviation(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(new Date());

    return parts.find(item => item.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

function updateViewButtons() {
  const isWeek = selectedView === "week";
  weekViewButton.classList.toggle("active", isWeek);
  monthViewButton.classList.toggle("active", !isWeek);
  weekViewButton.setAttribute("aria-pressed", String(isWeek));
  monthViewButton.setAttribute("aria-pressed", String(!isWeek));

  meetingWeek.classList.toggle("hidden", !isWeek);
  meetingMonthWrap.classList.toggle("hidden", isWeek);
}

async function loadMeetings() {
  setBusy(true);
  setStatus("Loading meeting schedule...");
  syncStatus.textContent = "Refreshing calendar...";

  const { requestStart, requestEnd } = getRequestRange();

  const query = new URLSearchParams({
    start: requestStart.toISOString(),
    end: requestEnd.toISOString(),
  });

  try {
    const response = await window.pickelAuth.fetch(
      `${MEETINGS_API_URL}?${query.toString()}`,
      { method: "GET" }
    );

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      throw new Error(payload.error ?? "Could not load meeting calendar.");
    }

    events = Array.isArray(payload.events) ? payload.events : [];
    renderCurrentView();
    updateSyncStatus(payload.fetched_at);
    setStatus("");
  } catch (error) {
    console.error("Meeting schedule error:", error);

    if (error?.message !== "Authentication required.") {
      setStatus(error?.message ?? "Could not load meeting schedule.");
      syncStatus.textContent = "Unable to refresh calendar";
    }
  } finally {
    setBusy(false);
  }
}

function getRequestRange() {
  if (selectedView === "week") {
    const weekStart = getWeekStart(anchorDate);
    return {
      requestStart: addDays(weekStart, -2),
      requestEnd: addDays(weekStart, 9),
    };
  }

  const monthStart = startOfMonth(anchorDate);
  const gridStart = getWeekStart(monthStart);
  const monthEnd = endOfMonth(anchorDate);
  const gridEnd = addDays(getWeekStart(monthEnd), 7);

  return {
    requestStart: addDays(gridStart, -2),
    requestEnd: addDays(gridEnd, 2),
  };
}

function renderCurrentView() {
  updateViewButtons();

  if (selectedView === "month") {
    renderMonth();
  } else {
    renderWeek();
  }
}

function renderWeek() {
  meetingWeek.innerHTML = "";

  const weekStart = getWeekStart(anchorDate);
  periodLabel.textContent = formatWeekRange(weekStart, addDays(weekStart, 6));

  for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
    const dayDate = addDays(weekStart, dayOffset);
    const column = document.createElement("section");
    column.className = "meeting-day";

    if (isToday(dayDate)) column.classList.add("today");

    const header = document.createElement("header");
    header.className = "meeting-day-header";

    const dayName = document.createElement("strong");
    dayName.textContent = DAY_NAMES[dayOffset];

    const dateText = document.createElement("span");
    dateText.textContent = formatDateOnly(dayDate);

    header.append(dayName, dateText);
    column.appendChild(header);

    const dayEvents = getEventsForDay(dayDate, events);

    if (dayEvents.length === 0) {
      const empty = document.createElement("p");
      empty.className = "meeting-empty";
      empty.textContent = "No meetings";
      column.appendChild(empty);
    } else {
      for (const event of dayEvents) {
        column.appendChild(createMeetingCard(event));
      }
    }

    meetingWeek.appendChild(column);
  }
}

function renderMonth() {
  meetingMonthGrid.innerHTML = "";

  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);
  const gridStart = getWeekStart(monthStart);
  const gridEnd = addDays(getWeekStart(monthEnd), 7);

  periodLabel.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(monthStart);

  for (const dayName of DAY_NAMES) {
    const heading = document.createElement("div");
    heading.className = "meeting-month-weekday";
    heading.textContent = dayName.slice(0, 3);
    meetingMonthGrid.appendChild(heading);
  }

  for (let day = new Date(gridStart); day < gridEnd; day = addDays(day, 1)) {
    const dayCell = document.createElement("section");
    dayCell.className = "meeting-month-day";

    if (day.getMonth() !== monthStart.getMonth()) {
      dayCell.classList.add("outside-month");
    }

    if (isToday(day)) {
      dayCell.classList.add("today");
    }

    const dateLabel = document.createElement("div");
    dateLabel.className = "meeting-month-date";
    dateLabel.textContent = String(day.getDate());
    dayCell.appendChild(dateLabel);

    const eventList = document.createElement("div");
    eventList.className = "meeting-month-events";

    for (const event of getEventsForDay(day, events)) {
      eventList.appendChild(createMonthEvent(event));
    }

    dayCell.appendChild(eventList);
    meetingMonthGrid.appendChild(dayCell);
  }
}

function getEventsForDay(day, sourceEvents) {
  const targetKey = formatDateKey(day);

  return sourceEvents
    .filter(event => {
      const start = new Date(event.start);
      if (Number.isNaN(start.getTime())) return false;
      return formatDateKeyInTimeZone(start, selectedTimeZone) === targetKey;
    })
    .sort((first, second) => new Date(first.start) - new Date(second.start));
}

function createMeetingCard(event) {
  const card = document.createElement("article");
  card.className = "meeting-card";

  const title = document.createElement("h3");
  title.textContent = event.title || "Untitled meeting";
  card.appendChild(title);

  const time = document.createElement("div");
  time.className = "meeting-time";
  time.textContent = event.all_day
    ? "All day"
    : `${formatMeetingTime(new Date(event.start))} – ${formatMeetingTime(new Date(event.end))}`;
  card.appendChild(time);

  if (event.location) {
    const location = document.createElement("div");
    location.className = "meeting-location";
    location.textContent = event.location;
    card.appendChild(location);
  }

  if (event.recurring) {
    const recurring = document.createElement("span");
    recurring.className = "meeting-recurring";
    recurring.textContent = "Recurring";
    card.appendChild(recurring);
  }

  return card;
}

function createMonthEvent(event) {
  const item = document.createElement("div");
  item.className = "meeting-month-event";

  const time = document.createElement("span");
  time.className = "meeting-month-event-time";
  time.textContent = event.all_day
    ? "All day"
    : formatMeetingTimeCompact(new Date(event.start));

  const title = document.createElement("span");
  title.className = "meeting-month-event-title";
  title.textContent = event.title || "Untitled meeting";

  item.append(time, title);
  item.title = buildEventTooltip(event);
  return item;
}

function buildEventTooltip(event) {
  const lines = [event.title || "Untitled meeting"];

  if (event.all_day) {
    lines.push("All day");
  } else {
    lines.push(
      `${formatMeetingTime(new Date(event.start))} – ${formatMeetingTime(new Date(event.end))}`
    );
  }

  if (event.location) lines.push(event.location);
  if (event.recurring) lines.push("Recurring");
  return lines.join("\n");
}

function formatMeetingTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: selectedTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).format(date);
}

function formatMeetingTimeCompact(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: selectedTimeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekRange(start, end) {
  const startText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(start);

  const endText = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(end);

  return `${startText} – ${endText}`;
}

let lastFetchedAt = null;

function updateSyncStatus(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    lastFetchedAt = null;
    syncStatus.textContent = "Calendar refreshed";
    return;
  }

  lastFetchedAt = date;
  updateSyncStatusFromCurrentText();
}

function updateSyncStatusFromCurrentText() {
  if (!lastFetchedAt) return;

  syncStatus.textContent = "Last refreshed " + new Intl.DateTimeFormat("en-US", {
    timeZone: selectedTimeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(lastFetchedAt);
}

function getWeekStart(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);

  const day = result.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + difference);
  return result;
}

function startOfMonth(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setDate(1);
  return result;
}

function endOfMonth(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  result.setMonth(result.getMonth() + 1, 0);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const maxDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, maxDay));
  return result;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateKeyInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function isToday(date) {
  return formatDateKey(date) === formatDateKeyInTimeZone(new Date(), selectedTimeZone);
}

function setBusy(busy) {
  previousPeriodButton.disabled = busy;
  currentPeriodButton.disabled = busy;
  nextPeriodButton.disabled = busy;
  refreshMeetingsButton.disabled = busy;
  weekViewButton.disabled = busy;
  monthViewButton.disabled = busy;
  refreshMeetingsButton.textContent = busy ? "Refreshing..." : "↻ Refresh";
}

function setStatus(message) {
  statusMessage.textContent = message;
}
