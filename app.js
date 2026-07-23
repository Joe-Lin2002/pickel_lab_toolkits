"use strict";

const SUPABASE_URL = "https://klpsqhugljdujfuislzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_vx6z9_wSGdRYsG-btENzmQ_jB0pKbdO";

const database = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/*
  Equipment list
*/

const resources = [
  {
    id: 1,
    name: "ETC 1.204D",
  },
  {
    id: 2,
    name: "ETC 1.204E",
  },
  {
    id: 3,
    name: "ETC 1.204F",
  },
];

/*
  Schedule range:
  8:00 AM to 6:00 PM

  6 PM is allowed as an end time,
  but is not displayed in the header.
*/

const DISPLAY_START_HOUR = 8;
const DISPLAY_END_HOUR = 18;

const HOURS_VISIBLE =
  DISPLAY_END_HOUR - DISPLAY_START_HOUR;

const DISPLAY_MINUTES =
  HOURS_VISIBLE * 60;

/*
  HTML elements
*/

const scheduleElement =
  document.querySelector("#schedule");

const scheduleCard =
  document.querySelector("#schedule-card");

const datePicker =
  document.querySelector("#date-picker");

const statusMessage =
  document.querySelector("#status-message");

const dialog =
  document.querySelector("#reservation-dialog");

const dialogTitle =
  document.querySelector("#dialog-title");

const form =
  document.querySelector("#reservation-form");

const reservationIdInput =
  document.querySelector("#reservation-id");

const resourceIdInput =
  document.querySelector("#resource-id");

const resourceNameInput =
  document.querySelector("#resource-name");

const personNameInput =
  document.querySelector("#person-name");

const titleInput =
  document.querySelector("#reservation-title");

const startTimeInput =
  document.querySelector("#start-time");

const endTimeInput =
  document.querySelector("#end-time");

const formError =
  document.querySelector("#form-error");

const deleteButton =
  document.querySelector("#delete-button");

let currentReservations = [];

let scheduleResizeObserver = null;

/*
  Start application
*/

initialize();

async function initialize() {
  datePicker.value =
    formatDateInput(new Date());

  attachEventListeners();

  initializeResponsiveSchedule();

  /*
    Render empty schedule first.
  */

  renderSchedule();

  await loadReservations();
}

/*
  Event listeners
*/

function attachEventListeners() {
  document
    .querySelector("#previous-day")
    .addEventListener(
      "click",
      async () => {
        changeDate(-1);
        await loadReservations();
      }
    );

  document
    .querySelector("#next-day")
    .addEventListener(
      "click",
      async () => {
        changeDate(1);
        await loadReservations();
      }
    );

  document
    .querySelector("#today-button")
    .addEventListener(
      "click",
      async () => {
        datePicker.value =
          formatDateInput(new Date());

        await loadReservations();
      }
    );

  datePicker.addEventListener(
    "change",
    loadReservations
  );

  form.addEventListener(
    "submit",
    saveReservation
  );

  document
    .querySelector("#cancel-button")
    .addEventListener(
      "click",
      () => {
        dialog.close();
      }
    );

  deleteButton.addEventListener(
    "click",
    deleteReservation
  );

  /*
    Close dialog when clicking backdrop.
  */

  dialog.addEventListener(
    "click",
    event => {
      if (event.target === dialog) {
        dialog.close();
      }
    }
  );
}

/*
  Responsive schedule sizing

  Teams embeds the page inside an iframe.
  ResizeObserver watches the actual schedule-card width,
  including when the Teams window or sidebar changes size.
*/

function initializeResponsiveSchedule() {
  const root =
    document.documentElement;

  function updateScheduleDimensions() {
    const availableWidth =
      Math.max(
        0,
        scheduleCard.clientWidth
      );

    /*
      Select equipment-column width based on
      the actual iframe/container width.
    */

    let resourceColumnWidth = 145;

    if (availableWidth < 850) {
      resourceColumnWidth = 130;
    }

    if (availableWidth < 650) {
      resourceColumnWidth = 115;
    }

    /*
      Minimum readable width per hour.

      Narrow Teams:
      schedule scrolls horizontally.

      Wide Teams:
      timeline expands and fills the width.
    */

    let minimumHourWidth = 72;

    if (availableWidth < 800) {
      minimumHourWidth = 68;
    }

    const minimumTimelineWidth =
      minimumHourWidth * HOURS_VISIBLE;

    const availableTimelineWidth =
      Math.max(
        0,
        availableWidth -
        resourceColumnWidth
      );

    const timelineWidth =
      Math.max(
        minimumTimelineWidth,
        availableTimelineWidth
      );

    const scheduleWidth =
      resourceColumnWidth +
      timelineWidth;

    root.style.setProperty(
      "--resource-column-width",
      `${resourceColumnWidth}px`
    );

    root.style.setProperty(
      "--timeline-min-width",
      `${timelineWidth}px`
    );

    root.style.setProperty(
      "--schedule-min-width",
      `${scheduleWidth}px`
    );
  }

  /*
    Observe actual element width.
  */

  if ("ResizeObserver" in window) {
    scheduleResizeObserver =
      new ResizeObserver(() => {
        updateScheduleDimensions();
      });

    scheduleResizeObserver.observe(
      scheduleCard
    );
  }

  /*
    Initial calculation.
  */

  updateScheduleDimensions();

  /*
    Browser fallback.
  */

  window.addEventListener(
    "resize",
    updateScheduleDimensions
  );
}

/*
  Date navigation
*/

function changeDate(numberOfDays) {
  const date =
    selectedLocalDate();

  date.setDate(
    date.getDate() + numberOfDays
  );

  datePicker.value =
    formatDateInput(date);
}

/*
  Load reservations
*/

async function loadReservations() {
  setStatus("Loading schedule...");

  const dayStart =
    selectedLocalDate();

  const dayEnd =
    new Date(dayStart);

  dayEnd.setDate(
    dayEnd.getDate() + 1
  );

  const { data, error } =
    await database
      .from("reservations")
      .select("*")
      .lt(
        "start_time",
        dayEnd.toISOString()
      )
      .gt(
        "end_time",
        dayStart.toISOString()
      )
      .order(
        "start_time",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(error);

    currentReservations = [];

    renderSchedule();

    setStatus(
      `Could not load reservations: ${error.message}`
    );

    return;
  }

  currentReservations =
    data ?? [];

  renderSchedule();

  setStatus("");
}

/*
  Render full schedule
*/

function renderSchedule() {
  scheduleElement.innerHTML = "";

  createScheduleHeader();

  for (const resource of resources) {
    createResourceRow(resource);
  }
}

/*
  Create timeline header

  Uses hour < DISPLAY_END_HOUR.

  Therefore it displays:
  8 AM through 5 PM.

  The right edge still represents 6 PM.
*/

function createScheduleHeader() {
  const header =
    document.createElement("div");

  header.className =
    "schedule-header";

  const corner =
    document.createElement("div");

  corner.className =
    "corner-cell";

  const timelineHeader =
    document.createElement("div");

  timelineHeader.className =
    "timeline-header";

  for (
    let hour = DISPLAY_START_HOUR;
    hour < DISPLAY_END_HOUR;
    hour += 1
  ) {
    const label =
      document.createElement("div");

    label.className =
      "hour-label";

    const minutesFromStart =
      (hour - DISPLAY_START_HOUR) * 60;

    label.style.left =
      `${minutesToPercent(
        minutesFromStart
      )}%`;

    label.textContent =
      formatHourLabel(hour);

    timelineHeader.appendChild(label);
  }

  header.append(
    corner,
    timelineHeader
  );

  scheduleElement.appendChild(header);
}

/*
  Create equipment row
*/

function createResourceRow(resource) {
  const row =
    document.createElement("div");

  row.className =
    "resource-row";

  const name =
    document.createElement("div");

  name.className =
    "resource-name";

  name.textContent =
    resource.name;

  const timeline =
    document.createElement("div");

  timeline.className =
    "timeline-row";

  timeline.dataset.resourceId =
    String(resource.id);

  timeline.addEventListener(
    "click",
    event => {
      openCreateDialog(
        resource,
        event
      );
    }
  );

  const reservationsForResource =
    currentReservations.filter(
      reservation =>
        Number(reservation.resource_id) ===
        Number(resource.id)
    );

  for (
    const reservation
    of reservationsForResource
  ) {
    const block =
      createReservationBlock(
        reservation
      );

    if (block) {
      timeline.appendChild(block);
    }
  }

  row.append(
    name,
    timeline
  );

  scheduleElement.appendChild(row);
}

/*
  Create reservation block
*/

function createReservationBlock(
  reservation
) {
  const dayStart =
    selectedLocalDate();

  const displayStart =
    new Date(dayStart);

  displayStart.setHours(
    DISPLAY_START_HOUR,
    0,
    0,
    0
  );

  const displayEnd =
    new Date(dayStart);

  displayEnd.setHours(
    DISPLAY_END_HOUR,
    0,
    0,
    0
  );

  const start =
    new Date(
      reservation.start_time
    );

  const end =
    new Date(
      reservation.end_time
    );

  /*
    Ignore reservations completely outside
    the visible range.
  */

  if (
    end <= displayStart ||
    start >= displayEnd
  ) {
    return null;
  }

  const startMinutes =
    (start - displayStart) / 60000;

  const endMinutes =
    (end - displayStart) / 60000;

  const clippedStart =
    Math.max(
      0,
      startMinutes
    );

  const clippedEnd =
    Math.min(
      DISPLAY_MINUTES,
      endMinutes
    );

  const visibleDuration =
    clippedEnd - clippedStart;

  if (visibleDuration <= 0) {
    return null;
  }

  const block =
    document.createElement("button");

  block.type =
    "button";

  block.className =
    "reservation";

  block.style.left =
    `${minutesToPercent(
      clippedStart
    )}%`;

  block.style.width =
    `${minutesToPercent(
      visibleDuration
    )}%`;

  block.title =
    `${reservation.title}\n` +
    `${reservation.person_name}\n` +
    `${formatTime(start)}–${formatTime(end)}`;

  const title =
    document.createElement("span");

  title.className =
    "reservation-title";

  title.textContent =
    reservation.title;

  const details =
    document.createElement("span");

  details.className =
    "reservation-details";

  details.textContent =
    `${reservation.person_name} · ` +
    `${formatTime(start)}–${formatTime(end)}`;

  block.append(
    title,
    details
  );

  block.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      openEditDialog(
        reservation
      );
    }
  );

  return block;
}

/*
  Open create dialog
*/

function openCreateDialog(
  resource,
  clickEvent
) {
  clearDialog();

  dialogTitle.textContent =
    "Add Reservation";

  const timelineRect =
    clickEvent.currentTarget
      .getBoundingClientRect();

  const clickPosition =
    clickEvent.clientX -
    timelineRect.left;

  const fraction =
    clamp(
      clickPosition /
      timelineRect.width,
      0,
      1
    );

  let selectedMinutes =
    DISPLAY_START_HOUR * 60 +
    fraction * DISPLAY_MINUTES;

  /*
    Round to nearest 15 minutes.
  */

  selectedMinutes =
    Math.round(
      selectedMinutes / 15
    ) * 15;

  const minimumMinutes =
    DISPLAY_START_HOUR * 60;

  const maximumMinutes =
    DISPLAY_END_HOUR * 60;

  /*
    Latest valid start is 5:45 PM.
  */

  selectedMinutes =
    clamp(
      selectedMinutes,
      minimumMinutes,
      maximumMinutes - 15
    );

  /*
    Default duration is one hour,
    but never later than 6 PM.
  */

  const endMinutes =
    Math.min(
      selectedMinutes + 60,
      maximumMinutes
    );

  resourceIdInput.value =
    String(resource.id);

  resourceNameInput.value =
    resource.name;

  startTimeInput.value =
    minutesToTimeInput(
      selectedMinutes
    );

  endTimeInput.value =
    minutesToTimeInput(
      endMinutes
    );

  deleteButton.classList.add(
    "hidden"
  );

  dialog.showModal();

  personNameInput.focus();
}

/*
  Open edit dialog
*/

function openEditDialog(
  reservation
) {
  clearDialog();

  dialogTitle.textContent =
    "Edit Reservation";

  const resource =
    resources.find(
      item =>
        Number(item.id) ===
        Number(reservation.resource_id)
    );

  reservationIdInput.value =
    String(reservation.id);

  resourceIdInput.value =
    String(
      reservation.resource_id
    );

  resourceNameInput.value =
    resource?.name ??
    "Unknown equipment";

  personNameInput.value =
    reservation.person_name;

  titleInput.value =
    reservation.title;

  startTimeInput.value =
    dateToTimeInput(
      new Date(
        reservation.start_time
      )
    );

  endTimeInput.value =
    dateToTimeInput(
      new Date(
        reservation.end_time
      )
    );

  deleteButton.classList.remove(
    "hidden"
  );

  dialog.showModal();

  personNameInput.focus();
}

/*
  Clear dialog
*/

function clearDialog() {
  form.reset();

  reservationIdInput.value =
    "";

  resourceIdInput.value =
    "";

  formError.textContent =
    "";
}

/*
  Save reservation
*/

async function saveReservation(event) {
  event.preventDefault();

  formError.textContent =
    "";

  const reservationId =
    reservationIdInput.value;

  const resourceId =
    Number(
      resourceIdInput.value
    );

  const personName =
    personNameInput.value.trim();

  const reservationTitle =
    titleInput.value.trim();

  if (!personName) {
    formError.textContent =
      "Please enter your name.";

    return;
  }

  if (!reservationTitle) {
    formError.textContent =
      "Please enter a description.";

    return;
  }

  if (
    !startTimeInput.value ||
    !endTimeInput.value
  ) {
    formError.textContent =
      "Please select a start and end time.";

    return;
  }

  const start =
    combineSelectedDateAndTime(
      startTimeInput.value
    );

  const end =
    combineSelectedDateAndTime(
      endTimeInput.value
    );

  if (!(start < end)) {
    formError.textContent =
      "End time must be after start time.";

    return;
  }

  const displayStart =
    selectedLocalDate();

  displayStart.setHours(
    DISPLAY_START_HOUR,
    0,
    0,
    0
  );

  const displayEnd =
    selectedLocalDate();

  displayEnd.setHours(
    DISPLAY_END_HOUR,
    0,
    0,
    0
  );

  /*
    End exactly at 6 PM is valid.
  */

  if (
    start < displayStart ||
    end > displayEnd
  ) {
    formError.textContent =
      "Reservations must be between " +
      `${formatHourLabel(
        DISPLAY_START_HOUR
      )} and ` +
      `${formatHourLabel(
        DISPLAY_END_HOUR
      )}.`;

    return;
  }

  /*
    Check conflicts.
  */

  const hasConflict =
    currentReservations.some(
      reservation => {
        const isSameResource =
          Number(
            reservation.resource_id
          ) ===
          resourceId;

        const isDifferentReservation =
          String(
            reservation.id
          ) !==
          String(
            reservationId
          );

        const existingStart =
          new Date(
            reservation.start_time
          );

        const existingEnd =
          new Date(
            reservation.end_time
          );

        const overlaps =
          start < existingEnd &&
          end > existingStart;

        return (
          isSameResource &&
          isDifferentReservation &&
          overlaps
        );
      }
    );

  if (hasConflict) {
    formError.textContent =
      "This equipment is already reserved during that time.";

    return;
  }

  const record = {
    resource_id: resourceId,
    person_name: personName,
    title: reservationTitle,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };

  let result;

  if (reservationId) {
    result =
      await database
        .from("reservations")
        .update(record)
        .eq(
          "id",
          reservationId
        );
  } else {
    result =
      await database
        .from("reservations")
        .insert(record);
  }

  if (result.error) {
    console.error(
      result.error
    );

    formError.textContent =
      result.error.message;

    return;
  }

  dialog.close();

  await loadReservations();
}

/*
  Delete reservation
*/

async function deleteReservation() {
  const reservationId =
    reservationIdInput.value;

  if (!reservationId) {
    return;
  }

  const confirmed =
    window.confirm(
      "Are you sure you want to delete this reservation?"
    );

  if (!confirmed) {
    return;
  }

  const { error } =
    await database
      .from("reservations")
      .delete()
      .eq(
        "id",
        reservationId
      );

  if (error) {
    console.error(error);

    formError.textContent =
      error.message;

    return;
  }

  dialog.close();

  await loadReservations();
}

/*
  Selected date at local midnight
*/

function selectedLocalDate() {
  const [
    year,
    month,
    day,
  ] =
    datePicker.value
      .split("-")
      .map(Number);

  return new Date(
    year,
    month - 1,
    day,
    0,
    0,
    0,
    0
  );
}

/*
  Combine date and time
*/

function combineSelectedDateAndTime(
  timeValue
) {
  const date =
    selectedLocalDate();

  const [
    hours,
    minutes,
  ] =
    timeValue
      .split(":")
      .map(Number);

  date.setHours(
    hours,
    minutes,
    0,
    0
  );

  return date;
}

/*
  Minutes to timeline percentage
*/

function minutesToPercent(minutes) {
  return (
    minutes /
    DISPLAY_MINUTES
  ) * 100;
}

/*
  Minutes to HH:MM
*/

function minutesToTimeInput(
  totalMinutes
) {
  const hours =
    Math.floor(
      totalMinutes / 60
    );

  const minutes =
    totalMinutes % 60;

  return (
    String(hours)
      .padStart(2, "0") +
    ":" +
    String(minutes)
      .padStart(2, "0")
  );
}

/*
  Date to HH:MM
*/

function dateToTimeInput(date) {
  return (
    String(
      date.getHours()
    ).padStart(2, "0") +
    ":" +
    String(
      date.getMinutes()
    ).padStart(2, "0")
  );
}

/*
  Date to YYYY-MM-DD
*/

function formatDateInput(date) {
  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  return (
    `${year}-${month}-${day}`
  );
}

/*
  Format hour label
*/

function formatHourLabel(hour) {
  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  const displayedHour =
    hour % 12 || 12;

  return (
    `${displayedHour} ${suffix}`
  );
}

/*
  Format reservation time
*/

function formatTime(date) {
  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

/*
  Clamp number
*/

function clamp(
  value,
  minimum,
  maximum
) {
  return Math.min(
    Math.max(
      value,
      minimum
    ),
    maximum
  );
}

/*
  Status message
*/

function setStatus(message) {
  statusMessage.textContent =
    message;
}