"use strict";

/* =========================================================
   API endpoint
   ========================================================= */

const RESERVATIONS_API_URL =
  "/api/reservations";

/* =========================================================
   Equipment
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

   Reservable range:
   7:00 AM–11:00 PM

   Header labels:
   7 AM–10 PM

   The right edge represents 11:00 PM.
   ========================================================= */

const DISPLAY_START_HOUR = 7;
const DISPLAY_END_HOUR = 23;

const HOURS_VISIBLE =
  DISPLAY_END_HOUR -
  DISPLAY_START_HOUR;

const DISPLAY_MINUTES =
  HOURS_VISIBLE * 60;

const MINIMUM_HOUR_WIDTH = 82;

const TIME_INCREMENT_MINUTES = 15;

const DEFAULT_RESERVATION_MINUTES = 60;

const SCROLL_AMOUNT = 410;

/* =========================================================
   Schedule elements
   ========================================================= */

const scheduleElement =
  document.querySelector(
    "#schedule"
  );

const scheduleCard =
  document.querySelector(
    "#schedule-card"
  );

const datePicker =
  document.querySelector(
    "#date-picker"
  );

const statusMessage =
  document.querySelector(
    "#status-message"
  );

const previousDayButton =
  document.querySelector(
    "#previous-day"
  );

const todayButton =
  document.querySelector(
    "#today-button"
  );

const nextDayButton =
  document.querySelector(
    "#next-day"
  );

const scrollLeftButton =
  document.querySelector(
    "#scroll-left"
  );

const scrollRightButton =
  document.querySelector(
    "#scroll-right"
  );

/* =========================================================
   Reservation-dialog elements
   ========================================================= */

const dialog =
  document.querySelector(
    "#reservation-dialog"
  );

const dialogTitle =
  document.querySelector(
    "#dialog-title"
  );

const form =
  document.querySelector(
    "#reservation-form"
  );

const reservationIdInput =
  document.querySelector(
    "#reservation-id"
  );

const resourceIdInput =
  document.querySelector(
    "#resource-id"
  );

const resourceNameInput =
  document.querySelector(
    "#resource-name"
  );

const personNameInput =
  document.querySelector(
    "#person-name"
  );

const titleInput =
  document.querySelector(
    "#reservation-title"
  );

const startTimeInput =
  document.querySelector(
    "#start-time"
  );

const endTimeInput =
  document.querySelector(
    "#end-time"
  );

const formError =
  document.querySelector(
    "#form-error"
  );

const deleteButton =
  document.querySelector(
    "#delete-button"
  );

const cancelButton =
  document.querySelector(
    "#cancel-button"
  );

/* =========================================================
   State
   ========================================================= */

let currentReservations = [];

let scheduleResizeObserver = null;

let updateScheduleDimensions =
  () => {};

/* =========================================================
   Initialize
   ========================================================= */

initialize();

async function initialize() {
  validateRequiredElements();

  datePicker.value =
    formatDateInput(
      new Date()
    );

  attachEventListeners();

  initializeResponsiveSchedule();
  initializeScheduleScrolling();

  renderSchedule();

  await loadReservations();
}

/* =========================================================
   Validate page structure
   ========================================================= */

function validateRequiredElements() {
  const required = {
    scheduleElement,
    scheduleCard,
    datePicker,
    statusMessage,
    previousDayButton,
    todayButton,
    nextDayButton,
    scrollLeftButton,
    scrollRightButton,
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
        formatDateInput(
          new Date()
        );

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

  startTimeInput.addEventListener(
    "change",
    updateSuggestedEndTime
  );

  dialog.addEventListener(
    "click",
    event => {
      if (
        event.target === dialog
      ) {
        dialog.close();
      }
    }
  );

  dialog.addEventListener(
    "close",
    () => {
      resetDeleteConfirmation();
    }
  );
}

/* =========================================================
   Authenticated API request
   ========================================================= */

async function apiRequest(
  url,
  options = {}
) {
  let response;

  try {
    response =
      await window.pickelAuth.fetch(
        url,
        options
      );
  } catch (error) {
    if (
      error?.message ===
      "Authentication required."
    ) {
      throw error;
    }

    console.error(
      "API connection error:",
      error
    );

    throw new Error(
      "Could not connect to the reservation server."
    );
  }

  const payload =
    await readJsonResponse(
      response
    );

  if (!response.ok) {
    throw new Error(
      payload.error ??
      `Request failed with status ${response.status}.`
    );
  }

  return payload;
}

async function readJsonResponse(
  response
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/* =========================================================
   Responsive schedule width
   ========================================================= */

function initializeResponsiveSchedule() {
  const root =
    document.documentElement;

  updateScheduleDimensions =
    function updateDimensions() {
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

      scheduleElement.style.width =
        `${scheduleWidth}px`;

      scheduleElement.style.minWidth =
        `${scheduleWidth}px`;

      scheduleElement
        .querySelectorAll(
          ".schedule-header, .resource-row"
        )
        .forEach(element => {
          element.style.width =
            `${scheduleWidth}px`;

          element.style.minWidth =
            `${scheduleWidth}px`;
        });

      scheduleElement
        .querySelectorAll(
          ".timeline-header, .timeline-row"
        )
        .forEach(element => {
          element.style.width =
            `${timelineWidth}px`;

          element.style.minWidth =
            `${timelineWidth}px`;
        });

      updateScrollButtonStates();
    };

  updateScheduleDimensions();

  if (
    "ResizeObserver" in window
  ) {
    scheduleResizeObserver =
      new ResizeObserver(
        () => {
          updateScheduleDimensions();
        }
      );

    scheduleResizeObserver.observe(
      scheduleCard
    );
  }

  window.addEventListener(
    "resize",
    updateScheduleDimensions
  );

  window.setTimeout(
    updateScheduleDimensions,
    100
  );

  window.setTimeout(
    updateScheduleDimensions,
    500
  );

  window.setTimeout(
    updateScheduleDimensions,
    1500
  );
}

/* =========================================================
   Horizontal scrolling
   ========================================================= */

function initializeScheduleScrolling() {
  scrollLeftButton.addEventListener(
    "click",
    () => {
      scheduleCard.scrollBy({
        left: -SCROLL_AMOUNT,
        behavior: "smooth",
      });
    }
  );

  scrollRightButton.addEventListener(
    "click",
    () => {
      scheduleCard.scrollBy({
        left: SCROLL_AMOUNT,
        behavior: "smooth",
      });
    }
  );

  scheduleCard.addEventListener(
    "scroll",
    updateScrollButtonStates
  );

  scheduleCard.addEventListener(
    "wheel",
    event => {
      const canScroll =
        scheduleCard.scrollWidth >
        scheduleCard.clientWidth + 1;

      if (!canScroll) {
        return;
      }

      const movement =
        Math.abs(event.deltaX) >
        Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;

      if (!movement) {
        return;
      }

      event.preventDefault();

      scheduleCard.scrollLeft +=
        movement;
    },
    {
      passive: false,
    }
  );

  scheduleCard.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();

        scheduleCard.scrollBy({
          left: -SCROLL_AMOUNT,
          behavior: "smooth",
        });
      }

      if (
        event.key === "ArrowRight"
      ) {
        event.preventDefault();

        scheduleCard.scrollBy({
          left: SCROLL_AMOUNT,
          behavior: "smooth",
        });
      }

      if (
        event.key === "Home"
      ) {
        event.preventDefault();

        scheduleCard.scrollTo({
          left: 0,
          behavior: "smooth",
        });
      }

      if (
        event.key === "End"
      ) {
        event.preventDefault();

        scheduleCard.scrollTo({
          left:
            scheduleCard.scrollWidth,
          behavior: "smooth",
        });
      }
    }
  );

  updateScrollButtonStates();
}

function updateScrollButtonStates() {
  const maximumScroll =
    Math.max(
      0,
      scheduleCard.scrollWidth -
      scheduleCard.clientWidth
    );

  scrollLeftButton.disabled =
    scheduleCard.scrollLeft <= 1;

  scrollRightButton.disabled =
    scheduleCard.scrollLeft >=
    maximumScroll - 1;
}

function resetScheduleScroll() {
  scheduleCard.scrollLeft = 0;

  updateScrollButtonStates();
}

/* =========================================================
   Date navigation
   ========================================================= */

function changeDate(
  numberOfDays
) {
  const date =
    selectedLocalDate();

  date.setDate(
    date.getDate() +
    numberOfDays
  );

  datePicker.value =
    formatDateInput(date);
}

/* =========================================================
   Load reservations
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

  const query =
    new URLSearchParams({
      start:
        dayStart.toISOString(),

      end:
        dayEnd.toISOString(),
    });

  try {
    const payload =
      await apiRequest(
        `${RESERVATIONS_API_URL}?${query.toString()}`,
        {
          method: "GET",
        }
      );

    currentReservations =
      Array.isArray(
        payload.reservations
      )
        ? payload.reservations
        : [];

    renderSchedule();

    setStatus("");
  } catch (error) {
    console.error(
      "Could not load reservations:",
      error
    );

    currentReservations = [];

    renderSchedule();

    if (
      error?.message !==
      "Authentication required."
    ) {
      setStatus(
        error?.message ??
        "Could not load reservations."
      );
    }
  }
}

/* =========================================================
   Render schedule
   ========================================================= */

function renderSchedule() {
  scheduleElement.innerHTML = "";

  createScheduleHeader();

  for (
    const resource
    of resources
  ) {
    createResourceRow(
      resource
    );
  }

  requestAnimationFrame(
    () => {
      updateScheduleDimensions();
    }
  );
}

/* =========================================================
   Schedule header
   ========================================================= */

function createScheduleHeader() {
  const header =
    document.createElement(
      "div"
    );

  header.className =
    "schedule-header";

  const corner =
    document.createElement(
      "div"
    );

  corner.className =
    "corner-cell";

  const timelineHeader =
    document.createElement(
      "div"
    );

  timelineHeader.className =
    "timeline-header";

  for (
    let hour =
      DISPLAY_START_HOUR;
    hour <
      DISPLAY_END_HOUR;
    hour += 1
  ) {
    const label =
      document.createElement(
        "div"
      );

    label.className =
      "hour-label";

    const minutesFromStart =
      (
        hour -
        DISPLAY_START_HOUR
      ) * 60;

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
   Equipment rows
   ========================================================= */

function createResourceRow(
  resource
) {
  const row =
    document.createElement(
      "div"
    );

  row.className =
    "resource-row";

  const name =
    document.createElement(
      "div"
    );

  name.className =
    "resource-name";

  name.textContent =
    resource.name;

  name.title =
    resource.name;

  const timeline =
    document.createElement(
      "div"
    );

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

  const matchingReservations =
    currentReservations.filter(
      reservation =>
        Number(
          reservation.resource_id
        ) ===
        resource.id
    );

  for (
    const reservation
    of matchingReservations
  ) {
    const block =
      createReservationBlock(
        reservation
      );

    if (block) {
      timeline.appendChild(
        block
      );
    }
  }

  row.append(
    name,
    timeline
  );

  scheduleElement.appendChild(
    row
  );
}

/* =========================================================
   Reservation block
   ========================================================= */

function createReservationBlock(
  reservation
) {
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

  const start =
    new Date(
      reservation.start_time
    );

  const end =
    new Date(
      reservation.end_time
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return null;
  }

  if (
    end <= displayStart ||
    start >= displayEnd
  ) {
    return null;
  }

  const clippedStart =
    Math.max(
      0,
      (
        start -
        displayStart
      ) /
      60000
    );

  const clippedEnd =
    Math.min(
      DISPLAY_MINUTES,
      (
        end -
        displayStart
      ) /
      60000
    );

  const duration =
    clippedEnd -
    clippedStart;

  if (duration <= 0) {
    return null;
  }

  const block =
    document.createElement(
      "button"
    );

  block.type = "button";

  block.className =
    "reservation";

  block.style.left =
    `${minutesToPercent(
      clippedStart
    )}%`;

  block.style.width =
    `${minutesToPercent(
      duration
    )}%`;

  block.title =
    [
      reservation.title ?? "",
      reservation.person_name ?? "",
      `${formatTime(start)}–${formatTime(end)}`,
    ].join("\n");

  const title =
    document.createElement(
      "span"
    );

  title.className =
    "reservation-title";

  title.textContent =
    reservation.title ?? "";

  const details =
    document.createElement(
      "span"
    );

  details.className =
    "reservation-details";

  details.textContent =
    `${reservation.person_name ?? ""} · ` +
    `${formatTime(start)}–` +
    `${formatTime(end)}`;

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
  event
) {
  clearDialog();

  dialogTitle.textContent =
    "Add Reservation";

  const rectangle =
    event.currentTarget
      .getBoundingClientRect();

  if (
    rectangle.width <= 0
  ) {
    return;
  }

  const fraction =
    clamp(
      (
        event.clientX -
        rectangle.left
      ) /
      rectangle.width,
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

  selectedMinutes =
    clamp(
      selectedMinutes,
      DISPLAY_START_HOUR *
        60,
      DISPLAY_END_HOUR *
        60 -
        TIME_INCREMENT_MINUTES
    );

  const endMinutes =
    Math.min(
      selectedMinutes +
      DEFAULT_RESERVATION_MINUTES,
      DISPLAY_END_HOUR *
      60
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

  resetDeleteConfirmation();

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
        item.id ===
        Number(
          reservation.resource_id
        )
    );

  reservationIdInput.value =
    String(
      reservation.id
    );

  resourceIdInput.value =
    String(
      reservation.resource_id
    );

  resourceNameInput.value =
    resource?.name ??
    "Unknown equipment";

  personNameInput.value =
    reservation.person_name ?? "";

  titleInput.value =
    reservation.title ?? "";

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

  resetDeleteConfirmation();

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

  resourceNameInput.disabled = true;

  resetDeleteConfirmation();
}

/* =========================================================
   Suggested end time
   ========================================================= */

function updateSuggestedEndTime() {
  const startMinutes =
    timeInputToMinutes(
      startTimeInput.value
    );

  if (
    startMinutes === null
  ) {
    return;
  }

  const currentEndMinutes =
    timeInputToMinutes(
      endTimeInput.value
    );

  const suggestedEnd =
    Math.min(
      startMinutes +
      DEFAULT_RESERVATION_MINUTES,
      DISPLAY_END_HOUR *
      60
    );

  if (
    currentEndMinutes === null ||
    currentEndMinutes <=
      startMinutes
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

async function saveReservation(
  event
) {
  event.preventDefault();

  formError.textContent = "";

  const reservationId =
    reservationIdInput.value;

  const resourceId =
    Number(
      resourceIdInput.value
    );

  const personName =
    personNameInput
      .value
      .trim();

  const title =
    titleInput
      .value
      .trim();

  if (
    !resources.some(
      resource =>
        resource.id ===
        resourceId
    )
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

  if (
    personName.length > 50
  ) {
    formError.textContent =
      "Name cannot exceed 50 characters.";

    return;
  }

  if (!title) {
    formError.textContent =
      "Please enter a description.";

    titleInput.focus();

    return;
  }

  if (
    title.length > 100
  ) {
    formError.textContent =
      "Description cannot exceed 100 characters.";

    return;
  }

  if (
    containsMarkup(
      personName
    ) ||
    containsMarkup(title)
  ) {
    formError.textContent =
      "The name and description cannot contain < or >.";

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
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
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

  const allowedStart =
    selectedLocalDate();

  allowedStart.setHours(
    DISPLAY_START_HOUR,
    0,
    0,
    0
  );

  const allowedEnd =
    selectedLocalDate();

  allowedEnd.setHours(
    DISPLAY_END_HOUR,
    0,
    0,
    0
  );

  if (
    start < allowedStart ||
    end > allowedEnd
  ) {
    formError.textContent =
      "Reservations must be between 7:00 AM and 11:00 PM.";

    return;
  }

  const hasConflict =
    currentReservations.some(
      reservation => {
        const sameResource =
          Number(
            reservation.resource_id
          ) ===
          resourceId;

        const differentReservation =
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
          sameResource &&
          differentReservation &&
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
    resource_id:
      resourceId,

    person_name:
      personName,

    title,

    start_time:
      start.toISOString(),

    end_time:
      end.toISOString(),
  };

  setDialogBusy(true);

  try {
    if (reservationId) {
      await apiRequest(
        RESERVATIONS_API_URL,
        {
          method: "PUT",

          body:
            JSON.stringify({
              id:
                Number(
                  reservationId
                ),

              ...record,
            }),
        }
      );
    } else {
      await apiRequest(
        RESERVATIONS_API_URL,
        {
          method: "POST",

          body:
            JSON.stringify(
              record
            ),
        }
      );
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

   Teams may block window.confirm().
   The user must click Delete twice within four seconds.
   ========================================================= */

async function deleteReservation() {
  const reservationId =
    reservationIdInput.value;

  if (!reservationId) {
    return;
  }

  if (
    deleteButton.dataset.confirming !==
    "true"
  ) {
    deleteButton.dataset.confirming =
      "true";

    deleteButton.textContent =
      "Click again to confirm";

    window.setTimeout(
      () => {
        if (
          deleteButton.dataset.confirming ===
          "true"
        ) {
          resetDeleteConfirmation();
        }
      },
      4000
    );

    return;
  }

  setDialogBusy(true);

  try {
    await apiRequest(
      `${RESERVATIONS_API_URL}?id=${encodeURIComponent(
        reservationId
      )}`,
      {
        method: "DELETE",
      }
    );

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
    resetDeleteConfirmation();

    setDialogBusy(false);
  }
}

function resetDeleteConfirmation() {
  deleteButton.dataset.confirming =
    "false";

  deleteButton.textContent =
    "Delete";
}

/* =========================================================
   Busy form state

   This version fixes the issue where inputs stayed disabled
   after the first reservation was saved.
   ========================================================= */

function setDialogBusy(
  isBusy
) {
  const buttons =
    form.querySelectorAll(
      "button"
    );

  buttons.forEach(button => {
    button.disabled =
      isBusy;
  });

  personNameInput.readOnly =
    isBusy;

  titleInput.readOnly =
    isBusy;

  startTimeInput.readOnly =
    isBusy;

  endTimeInput.readOnly =
    isBusy;

  /*
    Equipment name should always remain disabled.
  */

  resourceNameInput.disabled =
    true;
}

/* =========================================================
   Date and time utilities
   ========================================================= */

function selectedLocalDate() {
  if (!datePicker.value) {
    const now =
      new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );
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
  value
) {
  const date =
    selectedLocalDate();

  const [
    hours,
    minutes,
  ] =
    value
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

function minutesToPercent(
  minutes
) {
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
  value
) {
  if (!value) {
    return null;
  }

  const [
    hours,
    minutes,
  ] =
    value
      .split(":")
      .map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }

  return (
    hours * 60 +
    minutes
  );
}

function dateToTimeInput(
  date
) {
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

function formatDateInput(
  date
) {
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

function formatHourLabel(
  hour
) {
  return (
    `${hour % 12 || 12} ` +
    `${hour >= 12
      ? "PM"
      : "AM"}`
  );
}

function formatTime(
  date
) {
  return date.toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}

function containsMarkup(
  value
) {
  return /[<>]/.test(
    value
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

function setStatus(
  message
) {
  statusMessage.textContent =
    message;
}