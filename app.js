"use strict";

/* =========================================================
   API configuration

   The browser no longer connects directly to Supabase.
   All database operations go through the Vercel API.
   ========================================================= */

const API_URL = "/api/reservations";

const ACCESS_CODE_STORAGE_KEY =
  "pickel_lab_access_code";

/*
  The access code is stored only for the current browser or
  Teams-tab session. Closing the session usually clears it.
*/

let labAccessCode =
  sessionStorage.getItem(
    ACCESS_CODE_STORAGE_KEY
  ) ?? "";

/* =========================================================
   Equipment configuration

   Change only the displayed names if needed.
   Keep IDs as 1, 2, and 3 unless the API is also updated.
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

   The right boundary represents 11:00 PM.
   A reservation may end exactly at 11:00 PM.
   ========================================================= */

const DISPLAY_START_HOUR = 7;
const DISPLAY_END_HOUR = 23;

const HOURS_VISIBLE =
  DISPLAY_END_HOUR -
  DISPLAY_START_HOUR;

const DISPLAY_MINUTES =
  HOURS_VISIBLE * 60;

const MINIMUM_HOUR_WIDTH = 82;

const DEFAULT_RESERVATION_MINUTES = 60;

const TIME_INCREMENT_MINUTES = 15;

const SCROLL_AMOUNT = 410;

/* =========================================================
   HTML elements
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
   Application state
   ========================================================= */

let currentReservations = [];

let scheduleResizeObserver = null;

let updateScheduleDimensions =
  () => {};

/* =========================================================
   Start application
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

  /*
    Draw the empty schedule immediately.
  */

  renderSchedule();

  /*
    Loading reservations will request the lab access code
    when no code is stored for the current session.
  */

  await loadReservations();
}

/* =========================================================
   Validate required HTML
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
    scrollLeftButton,
    scrollRightButton,
  };

  const missingElements =
    Object.entries(
      requiredElements
    )
      .filter(
        ([, element]) =>
          !element
      )
      .map(
        ([name]) =>
          name
      );

  if (
    missingElements.length > 0
  ) {
    throw new Error(
      "Missing required HTML elements: " +
      missingElements.join(", ")
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

  /*
    Close the dialog when the user clicks directly
    on the dialog backdrop.
  */

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
}

/* =========================================================
   Access-code handling
   ========================================================= */

function requestLabAccessCode() {
  const enteredCode =
    window.prompt(
      "Enter the Pickel Lab access code:"
    );

  if (
    enteredCode === null
  ) {
    return false;
  }

  const trimmedCode =
    enteredCode.trim();

  if (!trimmedCode) {
    window.alert(
      "An access code is required."
    );

    return false;
  }

  labAccessCode =
    trimmedCode;

  sessionStorage.setItem(
    ACCESS_CODE_STORAGE_KEY,
    labAccessCode
  );

  return true;
}

function clearStoredAccessCode() {
  labAccessCode = "";

  sessionStorage.removeItem(
    ACCESS_CODE_STORAGE_KEY
  );
}

/* =========================================================
   Unified API request

   Every request sends:
   X-Lab-Access-Code: <shared code>

   If the server responds with 401:
   - clear the stored code
   - ask the user for the code again
   - retry once
   ========================================================= */

async function apiRequest(
  url,
  options = {},
  allowCodeRetry = true
) {
  if (
    !labAccessCode &&
    !requestLabAccessCode()
  ) {
    throw new Error(
      "Access code is required."
    );
  }

  const requestOptions = {
    ...options,

    headers: {
      "X-Lab-Access-Code":
        labAccessCode,

      ...(options.body
        ? {
            "Content-Type":
              "application/json",
          }
        : {}),

      ...(options.headers ?? {}),
    },
  };

  let response;

  try {
    response =
      await fetch(
        url,
        requestOptions
      );
  } catch (error) {
    throw new Error(
      "Could not connect to the reservation server."
    );
  }

  let payload = {};

  try {
    payload =
      await response.json();
  } catch {
    payload = {};
  }

  if (
    response.status === 401 &&
    allowCodeRetry
  ) {
    clearStoredAccessCode();

    const codeEntered =
      requestLabAccessCode();

    if (!codeEntered) {
      throw new Error(
        "Access code is required."
      );
    }

    return apiRequest(
      url,
      options,
      false
    );
  }

  if (!response.ok) {
    throw new Error(
      payload.error ??
      `Request failed with status ${response.status}.`
    );
  }

  return payload;
}

/* =========================================================
   Teams iframe responsive width

   The timeline remains at least:
   16 hours × 82 px = 1312 px

   When Teams is narrow:
   - the inner schedule remains wide
   - schedule-card scrolls horizontally

   When Teams is wide:
   - the schedule expands to fill the available space
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

      let resourceColumnWidth =
        145;

      if (
        cardWidth < 800
      ) {
        resourceColumnWidth =
          125;
      }

      if (
        cardWidth < 600
      ) {
        resourceColumnWidth =
          110;
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
        Explicit inline widths improve reliability in the
        embedded Teams browser.
      */

      scheduleElement.style.width =
        `${scheduleWidth}px`;

      scheduleElement.style.minWidth =
        `${scheduleWidth}px`;

      scheduleElement
        .querySelectorAll(
          ".schedule-header, " +
          ".resource-row"
        )
        .forEach(element => {
          element.style.width =
            `${scheduleWidth}px`;

          element.style.minWidth =
            `${scheduleWidth}px`;
        });

      scheduleElement
        .querySelectorAll(
          ".timeline-header, " +
          ".timeline-row"
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

  /*
    Teams may update the tab's iframe size after loading.
  */

  window.setTimeout(
    updateScheduleDimensions,
    100
  );

  window.setTimeout(
    updateScheduleDimensions,
    350
  );

  window.setTimeout(
    updateScheduleDimensions,
    800
  );

  window.setTimeout(
    updateScheduleDimensions,
    1500
  );
}

/* =========================================================
   Horizontal schedule scrolling
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

  /*
    Convert mouse-wheel movement to horizontal scrolling
    while the pointer is over the schedule.
  */

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

      if (
        movement === 0
      ) {
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
        event.key ===
        "ArrowLeft"
      ) {
        event.preventDefault();

        scheduleCard.scrollBy({
          left: -SCROLL_AMOUNT,
          behavior: "smooth",
        });
      }

      if (
        event.key ===
        "ArrowRight"
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
   Load reservations from Vercel API
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
      date:
        datePicker.value,

      start:
        dayStart.toISOString(),

      end:
        dayEnd.toISOString(),
    });

  try {
    const payload =
      await apiRequest(
        `${API_URL}?${query.toString()}`,
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

    setStatus(
      error?.message ??
      "Could not load reservations."
    );
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

  /*
    Reapply explicit widths after rebuilding the DOM.
  */

  requestAnimationFrame(
    () => {
      updateScheduleDimensions();
    }
  );
}

/* =========================================================
   Create schedule header

   The condition uses:
   hour < DISPLAY_END_HOUR

   Therefore the header displays:
   7 AM through 10 PM

   It does not display 11 PM.
   The right boundary still represents 11 PM.
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
   Create one equipment row
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
   Create reservation block
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
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    console.warn(
      "Invalid reservation:",
      reservation
    );

    return null;
  }

  if (
    end <= displayStart ||
    start >= displayEnd
  ) {
    return null;
  }

  const startMinutes =
    (
      start -
      displayStart
    ) / 60000;

  const endMinutes =
    (
      end -
      displayStart
    ) / 60000;

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

  if (
    visibleDuration <= 0
  ) {
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
      visibleDuration
    )}%`;

  block.title =
    `${reservation.title}\n` +
    `${reservation.person_name}\n` +
    `${formatTime(start)}–` +
    `${formatTime(end)}`;

  const title =
    document.createElement(
      "span"
    );

  title.className =
    "reservation-title";

  title.textContent =
    reservation.title ??
    "";

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
  clickEvent
) {
  clearDialog();

  dialogTitle.textContent =
    "Add Reservation";

  const timeline =
    clickEvent.currentTarget;

  const timelineRect =
    timeline.getBoundingClientRect();

  if (
    timelineRect.width <= 0
  ) {
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
    Latest valid start is 10:45 PM.
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

  reservationIdInput.value =
    "";

  resourceIdInput.value =
    "";

  resourceNameInput.value =
    "";

  formError.textContent =
    "";
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

  const maximumMinutes =
    DISPLAY_END_HOUR *
    60;

  const suggestedEnd =
    Math.min(
      startMinutes +
      DEFAULT_RESERVATION_MINUTES,
      maximumMinutes
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
   Save reservation through Vercel API
   ========================================================= */

async function saveReservation(
  event
) {
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
    personNameInput
      .value
      .trim();

  const reservationTitle =
    titleInput
      .value
      .trim();

  if (
    !Number.isInteger(
      resourceId
    ) ||
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

  if (
    !reservationTitle
  ) {
    formError.textContent =
      "Please enter a description.";

    titleInput.focus();

    return;
  }

  if (
    reservationTitle.length > 100
  ) {
    formError.textContent =
      "Description cannot exceed 100 characters.";

    return;
  }

  if (
    containsMarkup(personName) ||
    containsMarkup(
      reservationTitle
    )
  ) {
    formError.textContent =
      "The name and description cannot contain < or > characters.";

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

  if (
    !(start < end)
  ) {
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
    Ending exactly at 11 PM is valid.
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
    Frontend conflict check for immediate feedback.
    The Vercel API must also repeat this check.
  */

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

    title:
      reservationTitle,

    start_time:
      start.toISOString(),

    end_time:
      end.toISOString(),
  };

  setDialogBusy(true);

  try {
    if (reservationId) {
      await apiRequest(
        API_URL,
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
        API_URL,
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
   Delete reservation through Vercel API
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
    await apiRequest(
      `${API_URL}?id=${encodeURIComponent(
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
    setDialogBusy(false);
  }
}

/* =========================================================
   Disable dialog controls during API operations
   ========================================================= */

function setDialogBusy(
  isBusy
) {
  const buttons =
    form.querySelectorAll(
      "button"
    );

  const inputs =
    form.querySelectorAll(
      "input:not([type='hidden']):not(:disabled)"
    );

  buttons.forEach(
    button => {
      button.disabled =
        isBusy;
    }
  );

  inputs.forEach(
    input => {
      input.disabled =
        isBusy;
    }
  );
}

/* =========================================================
   Date and time helpers
   ========================================================= */

function selectedLocalDate() {
  if (
    !datePicker.value
  ) {
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
  timeValue
) {
  if (!timeValue) {
    return null;
  }

  const [
    hours,
    minutes,
  ] =
    timeValue
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
  return /[<>]/.test(value);
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

function setStatus(
  message
) {
  statusMessage.textContent =
    message;
}