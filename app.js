"use strict";

const SUPABASE_URL = "https://klpsqhugljdujfuislzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_vx6z9_wSGdRYsG-btENzmQ_jB0pKbdO";

const database = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

/* =========================================================
   Equipment configuration
   ========================================================= */

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

/* =========================================================
   Schedule configuration

   The timeline runs from 8:00 AM to 6:00 PM.

   The header displays 8 AM through 5 PM.
   The right edge of the timeline represents 6 PM.

   Users may end a reservation exactly at 6:00 PM.
   ========================================================= */

const DISPLAY_START_HOUR = 8;
const DISPLAY_END_HOUR = 18;

const HOURS_VISIBLE =
  DISPLAY_END_HOUR - DISPLAY_START_HOUR;

const DISPLAY_MINUTES =
  HOURS_VISIBLE * 60;

const MINIMUM_HOUR_WIDTH = 82;
const DEFAULT_RESERVATION_MINUTES = 60;
const TIME_INCREMENT_MINUTES = 15;

/* =========================================================
   HTML elements
   ========================================================= */

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

const cancelButton =
  document.querySelector("#cancel-button");

const previousDayButton =
  document.querySelector("#previous-day");

const todayButton =
  document.querySelector("#today-button");

const nextDayButton =
  document.querySelector("#next-day");

const scrollLeftButton =
  document.querySelector("#scroll-left");

const scrollRightButton =
  document.querySelector("#scroll-right");

/* =========================================================
   Application state
   ========================================================= */

let currentReservations = [];
let scheduleResizeObserver = null;

/* =========================================================
   Start application
   ========================================================= */

initialize();

async function initialize() {
  validateRequiredElements();

  datePicker.value =
    formatDateInput(new Date());

  attachEventListeners();

  initializeResponsiveSchedule();
  initializeScheduleScrolling();

  /*
    Render the empty schedule immediately so the grid remains
    visible even if Supabase cannot be reached.
  */

  renderSchedule();

  await loadReservations();
}

/* =========================================================
   Validate required HTML elements
   ========================================================= */

function validateRequiredElements() {
  const requiredElements = {
    scheduleElement,
    scheduleCard,
    datePicker,
    statusMessage,
    dialog,
    dialogTitle,
    form,
    reservationIdInput,
    resourceIdInput,
    resourceNameInput,
    personNameInput,
    titleInput,
    startTimeInput,
    endTimeInput,
    formError,
    deleteButton,
    cancelButton,
    previousDayButton,
    todayButton,
    nextDayButton,
  };

  const missingElements =
    Object.entries(requiredElements)
      .filter(([, element]) => !element)
      .map(([name]) => name);

  if (missingElements.length > 0) {
    throw new Error(
      `Missing required HTML elements: ${missingElements.join(", ")}`
    );
  }
}

/* =========================================================
   Event listeners
   ========================================================= */

function attachEventListeners() {
  previousDayButton.addEventListener(
    "click",
    async () => {
      changeDate(-1);
      resetScheduleScroll();
      await loadReservations();
    }
  );

  nextDayButton.addEventListener(
    "click",
    async () => {
      changeDate(1);
      resetScheduleScroll();
      await loadReservations();
    }
  );

  todayButton.addEventListener(
    "click",
    async () => {
      datePicker.value =
        formatDateInput(new Date());

      resetScheduleScroll();

      await loadReservations();
    }
  );

  datePicker.addEventListener(
    "change",
    async () => {
      resetScheduleScroll();
      await loadReservations();
    }
  );

  form.addEventListener(
    "submit",
    saveReservation
  );

  cancelButton.addEventListener(
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
    Close dialog when clicking the backdrop.
  */

  dialog.addEventListener(
    "click",
    event => {
      if (event.target === dialog) {
        dialog.close();
      }
    }
  );

  /*
    Improve end-time defaults when start time changes.
  */

  startTimeInput.addEventListener(
    "change",
    updateSuggestedEndTime
  );
}

/* =========================================================
   Responsive schedule sizing

   Teams embeds this page in an iframe. This function measures
   the actual schedule-card width rather than relying only on
   window.innerWidth or CSS media queries.

   Narrow Teams window:
   - timeline keeps a readable pixel width
   - schedule-card scrolls horizontally

   Wide Teams window:
   - timeline expands to fill the available width
   ========================================================= */

function initializeResponsiveSchedule() {
  const root =
    document.documentElement;

  function updateScheduleDimensions() {
    const cardWidth =
      Math.max(
        0,
        scheduleCard.clientWidth
      );

    let resourceColumnWidth = 145;

    if (cardWidth < 800) {
      resourceColumnWidth = 125;
    }

    if (cardWidth < 600) {
      resourceColumnWidth = 110;
    }

    const minimumTimelineWidth =
      HOURS_VISIBLE *
      MINIMUM_HOUR_WIDTH;

    const availableTimelineWidth =
      Math.max(
        0,
        cardWidth -
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
      "--timeline-width",
      `${timelineWidth}px`
    );

    root.style.setProperty(
      "--schedule-width",
      `${scheduleWidth}px`
    );

    /*
      Inline dimensions provide an additional safeguard for
      the embedded Teams browser.
    */

    scheduleElement.style.width =
      `${scheduleWidth}px`;

    scheduleElement.style.minWidth =
      `${scheduleWidth}px`;

    const scheduleHeaders =
      scheduleElement.querySelectorAll(
        ".schedule-header"
      );

    const resourceRows =
      scheduleElement.querySelectorAll(
        ".resource-row"
      );

    const timelineHeaders =
      scheduleElement.querySelectorAll(
        ".timeline-header"
      );

    const timelineRows =
      scheduleElement.querySelectorAll(
        ".timeline-row"
      );

    scheduleHeaders.forEach(element => {
      element.style.width =
        `${scheduleWidth}px`;

      element.style.minWidth =
        `${scheduleWidth}px`;
    });

    resourceRows.forEach(element => {
      element.style.width =
        `${scheduleWidth}px`;

      element.style.minWidth =
        `${scheduleWidth}px`;
    });

    timelineHeaders.forEach(element => {
      element.style.width =
        `${timelineWidth}px`;

      element.style.minWidth =
        `${timelineWidth}px`;
    });

    timelineRows.forEach(element => {
      element.style.width =
        `${timelineWidth}px`;

      element.style.minWidth =
        `${timelineWidth}px`;
    });
  }

  updateScheduleDimensions();

  if ("ResizeObserver" in window) {
    scheduleResizeObserver =
      new ResizeObserver(() => {
        updateScheduleDimensions();
      });

    scheduleResizeObserver.observe(
      scheduleCard
    );
  }

  window.addEventListener(
    "resize",
    updateScheduleDimensions
  );

  /*
    Teams may finish sizing the iframe after initial load.
  */

  window.setTimeout(
    updateScheduleDimensions,
    100
  );

  window.setTimeout(
    updateScheduleDimensions,
    300
  );

  window.setTimeout(
    updateScheduleDimensions,
    750
  );

  window.setTimeout(
    updateScheduleDimensions,
    1500
  );

  /*
    Make the function available after every re-render.
  */

  initializeResponsiveSchedule.update =
    updateScheduleDimensions;
}

/* =========================================================
   Schedule scrolling

   Supported methods:
   - visible horizontal scrollbar
   - Earlier / Later buttons
   - mouse wheel
   - trackpad horizontal movement
   - keyboard left/right arrows
   ========================================================= */

function initializeScheduleScrolling() {
  const scrollAmount = 360;

  if (scrollLeftButton) {
    scrollLeftButton.addEventListener(
      "click",
      () => {
        scheduleCard.scrollBy({
          left: -scrollAmount,
          behavior: "smooth",
        });
      }
    );
  }

  if (scrollRightButton) {
    scrollRightButton.addEventListener(
      "click",
      () => {
        scheduleCard.scrollBy({
          left: scrollAmount,
          behavior: "smooth",
        });
      }
    );
  }

  scheduleCard.addEventListener(
    "wheel",
    event => {
      const canScrollHorizontally =
        scheduleCard.scrollWidth >
        scheduleCard.clientWidth;

      if (!canScrollHorizontally) {
        return;
      }

      const movement =
        Math.abs(event.deltaX) >
        Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (movement === 0) {
        return;
      }

      event.preventDefault();

      scheduleCard.scrollLeft += movement;
    },
    {
      passive: false,
    }
  );

  scheduleCard.addEventListener(
    "keydown",
    event => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();

        scheduleCard.scrollBy({
          left: -scrollAmount,
          behavior: "smooth",
        });
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();

        scheduleCard.scrollBy({
          left: scrollAmount,
          behavior: "smooth",
        });
      }

      if (event.key === "Home") {
        event.preventDefault();

        scheduleCard.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      }

      if (event.key === "End") {
        event.preventDefault();

        scheduleCard.scrollTo({
          left:
            scheduleCard.scrollWidth,
          behavior: "smooth",
        });
      }
    }
  );
}

/* =========================================================
   Date navigation
   ========================================================= */

function changeDate(numberOfDays) {
  const date =
    selectedLocalDate();

  date.setDate(
    date.getDate() +
    numberOfDays
  );

  datePicker.value =
    formatDateInput(date);
}

function resetScheduleScroll() {
  scheduleCard.scrollLeft = 0;
}

/* =========================================================
   Load reservations from Supabase
   ========================================================= */

async function loadReservations() {
  setStatus(
    "Loading schedule..."
  );

  const dayStart =
    selectedLocalDate();

  const dayEnd =
    new Date(dayStart);

  dayEnd.setDate(
    dayEnd.getDate() + 1
  );

  try {
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
      throw error;
    }

    currentReservations =
      data ?? [];

    renderSchedule();

    setStatus("");
  } catch (error) {
    console.error(
      "Could not load reservations:",
      error
    );

    currentReservations = [];

    renderSchedule();

    setStatus(
      `Could not load reservations: ${
        error?.message ??
        "Unknown error"
      }`
    );
  }
}

/* =========================================================
   Render schedule
   ========================================================= */

function renderSchedule() {
  scheduleElement.innerHTML = "";

  createScheduleHeader();

  for (const resource of resources) {
    createResourceRow(resource);
  }

  /*
    Reapply the actual pixel width after the DOM is rebuilt.
  */

  if (
    typeof initializeResponsiveSchedule.update ===
    "function"
  ) {
    requestAnimationFrame(() => {
      initializeResponsiveSchedule.update();
    });
  }
}

/* =========================================================
   Create timeline header

   Important:
   hour < DISPLAY_END_HOUR

   This displays:
   8 AM, 9 AM, 10 AM, ..., 5 PM

   It does not display 6 PM.

   The right edge of the schedule still represents 6 PM.
   ========================================================= */

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
      (hour -
        DISPLAY_START_HOUR) *
      60;

    label.style.left =
      `${minutesToPercent(
        minutesFromStart
      )}%`;

    label.textContent =
      formatHourLabel(hour);

    timelineHeader.appendChild(
      label
    );
  }

  header.append(
    corner,
    timelineHeader
  );

  scheduleElement.appendChild(
    header
  );
}

/* =========================================================
   Create one equipment row
   ========================================================= */

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

  name.title =
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
        Number(
          reservation.resource_id
        ) ===
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

/* =========================================================
   Create a reservation block
   ========================================================= */

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

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    console.warn(
      "Invalid reservation time:",
      reservation
    );

    return null;
  }

  /*
    Do not display reservations completely outside
    the visible 8 AM–6 PM range.
  */

  if (
    end <= displayStart ||
    start >= displayEnd
  ) {
    return null;
  }

  const startMinutes =
    (start - displayStart) /
    60000;

  const endMinutes =
    (end - displayStart) /
    60000;

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
    clippedEnd -
    clippedStart;

  if (visibleDuration <= 0) {
    return null;
  }

  const block =
    document.createElement("button");

  block.type = "button";
  block.className = "reservation";

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

/* =========================================================
   Open create dialog
   ========================================================= */

function openCreateDialog(
  resource,
  clickEvent
) {
  clearDialog();

  dialogTitle.textContent =
    "Add Reservation";

  const timeline =
    clickEvent.currentTarget;

  const timelineRect =
    timeline.getBoundingClientRect();

  if (timelineRect.width <= 0) {
    formError.textContent =
      "Could not determine the selected time.";

    return;
  }

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
    DISPLAY_START_HOUR *
    60 +
    fraction *
    DISPLAY_MINUTES;

  selectedMinutes =
    Math.round(
      selectedMinutes /
      TIME_INCREMENT_MINUTES
    ) *
    TIME_INCREMENT_MINUTES;

  const minimumMinutes =
    DISPLAY_START_HOUR *
    60;

  const maximumMinutes =
    DISPLAY_END_HOUR *
    60;

  /*
    Latest possible start is 5:45 PM.
  */

  selectedMinutes =
    clamp(
      selectedMinutes,
      minimumMinutes,
      maximumMinutes -
        TIME_INCREMENT_MINUTES
    );

  const endMinutes =
    Math.min(
      selectedMinutes +
        DEFAULT_RESERVATION_MINUTES,
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

/* =========================================================
   Open edit dialog
   ========================================================= */

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
        Number(
          reservation.resource_id
        )
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
    reservation.person_name ??
    "";

  titleInput.value =
    reservation.title ??
    "";

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

/* =========================================================
   Clear dialog
   ========================================================= */

function clearDialog() {
  form.reset();

  reservationIdInput.value = "";
  resourceIdInput.value = "";

  resourceNameInput.value = "";

  formError.textContent = "";
}

/* =========================================================
   Suggest end time after start-time changes
   ========================================================= */

function updateSuggestedEndTime() {
  if (!startTimeInput.value) {
    return;
  }

  const startMinutes =
    timeInputToMinutes(
      startTimeInput.value
    );

  if (
    startMinutes === null
  ) {
    return;
  }

  const maximumMinutes =
    DISPLAY_END_HOUR *
    60;

  const suggestedEnd =
    Math.min(
      startMinutes +
        DEFAULT_RESERVATION_MINUTES,
      maximumMinutes
    );

  const existingEnd =
    timeInputToMinutes(
      endTimeInput.value
    );

  if (
    existingEnd === null ||
    existingEnd <= startMinutes
  ) {
    endTimeInput.value =
      minutesToTimeInput(
        suggestedEnd
      );
  }
}

/* =========================================================
   Save reservation
   ========================================================= */

async function saveReservation(event) {
  event.preventDefault();

  formError.textContent = "";

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

  if (
    !Number.isInteger(resourceId) ||
    resourceId < 1
  ) {
    formError.textContent =
      "Invalid equipment selection.";

    return;
  }

  if (!personName) {
    formError.textContent =
      "Please enter your name.";

    personNameInput.focus();

    return;
  }

  if (!reservationTitle) {
    formError.textContent =
      "Please enter a description.";

    titleInput.focus();

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

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    formError.textContent =
      "Invalid reservation time.";

    return;
  }

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
    Ending exactly at 6:00 PM is valid because only
    end > displayEnd is rejected.
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

  setDialogBusy(true);

  try {
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
      throw result.error;
    }

    dialog.close();

    await loadReservations();
  } catch (error) {
    console.error(
      "Could not save reservation:",
      error
    );

    formError.textContent =
      error?.message ??
      "Could not save the reservation.";
  } finally {
    setDialogBusy(false);
  }
}

/* =========================================================
   Delete reservation
   ========================================================= */

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

  setDialogBusy(true);

  try {
    const { error } =
      await database
        .from("reservations")
        .delete()
        .eq(
          "id",
          reservationId
        );

    if (error) {
      throw error;
    }

    dialog.close();

    await loadReservations();
  } catch (error) {
    console.error(
      "Could not delete reservation:",
      error
    );

    formError.textContent =
      error?.message ??
      "Could not delete the reservation.";
  } finally {
    setDialogBusy(false);
  }
}

/* =========================================================
   Disable dialog controls during database operations
   ========================================================= */

function setDialogBusy(isBusy) {
  const buttons =
    form.querySelectorAll(
      "button"
    );

  const editableInputs =
    form.querySelectorAll(
      "input:not([type='hidden']):not(:disabled)"
    );

  buttons.forEach(button => {
    button.disabled = isBusy;
  });

  editableInputs.forEach(input => {
    input.disabled = isBusy;
  });
}

/* =========================================================
   Date and time utilities
   ========================================================= */

function selectedLocalDate() {
  if (!datePicker.value) {
    return new Date();
  }

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

function minutesToPercent(minutes) {
  return (
    minutes /
    DISPLAY_MINUTES
  ) * 100;
}

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

function timeInputToMinutes(
  timeValue
) {
  if (!timeValue) {
    return null;
  }

  const parts =
    timeValue
      .split(":")
      .map(Number);

  if (
    parts.length < 2 ||
    parts.some(Number.isNaN)
  ) {
    return null;
  }

  return (
    parts[0] * 60 +
    parts[1]
  );
}

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

function formatTime(date) {
  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

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

/* =========================================================
   Status message
   ========================================================= */

function setStatus(message) {
  statusMessage.textContent =
    message;
}