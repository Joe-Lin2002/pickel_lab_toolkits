"use strict";

/* =========================================================
   API endpoints
   ========================================================= */

const AUTH_API_URL =
  "/api/auth";

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
   Schedule settings
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
   Authentication elements
   ========================================================= */

const accessGate =
  document.querySelector(
    "#access-gate"
  );

const accessForm =
  document.querySelector(
    "#access-form"
  );

const accessCodeInput =
  document.querySelector(
    "#access-code"
  );

const accessError =
  document.querySelector(
    "#access-error"
  );

const accessSubmitButton =
  document.querySelector(
    "#access-submit"
  );

const togglePasswordButton =
  document.querySelector(
    "#toggle-password"
  );

const logoutButton =
  document.querySelector(
    "#logout-button"
  );

const mainApp =
  document.querySelector(
    "#main-app"
  );

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

  const authenticated =
    await checkExistingSession();

  if (authenticated) {
    unlockApplication();

    await loadReservations();
  } else {
    showAccessGate();
  }
}

/* =========================================================
   Required-element validation
   ========================================================= */

function validateRequiredElements() {
  const required = {
    accessGate,
    accessForm,
    accessCodeInput,
    accessError,
    accessSubmitButton,
    togglePasswordButton,
    logoutButton,
    mainApp,
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

  if (missing.length) {
    throw new Error(
      "Missing HTML elements: " +
      missing.join(", ")
    );
  }
}

/* =========================================================
   Event listeners
   ========================================================= */

function attachEventListeners() {
  accessForm.addEventListener(
    "submit",
    handleAccessSubmit
  );

  togglePasswordButton
    .addEventListener(
      "click",
      togglePasswordVisibility
    );

  logoutButton.addEventListener(
    "click",
    forgetThisDevice
  );

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
    Clicking the dialog backdrop closes
    the reservation dialog.
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
   Authentication
   ========================================================= */

async function checkExistingSession() {
  try {
    const response =
      await fetch(
        AUTH_API_URL,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

    if (!response.ok) {
      return false;
    }

    const payload =
      await response.json();

    return (
      payload.authenticated ===
      true
    );
  } catch (error) {
    console.error(
      "Session check failed:",
      error
    );

    return false;
  }
}

async function handleAccessSubmit(
  event
) {
  event.preventDefault();

  accessError.textContent =
    "";

  const accessCode =
    accessCodeInput
      .value
      .trim();

  if (!accessCode) {
    accessError.textContent =
      "Please enter the access code.";

    accessCodeInput.focus();

    return;
  }

  setAccessFormBusy(true);

  try {
    const response =
      await fetch(
        AUTH_API_URL,
        {
          method: "POST",

          credentials:
            "include",

          cache: "no-store",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              accessCode,
            }),
        }
      );

    const payload =
      await readJsonResponse(
        response
      );

    if (!response.ok) {
      throw new Error(
        payload.error ??
        "Authentication failed."
      );
    }

    accessCodeInput.value =
      "";

    unlockApplication();

    await loadReservations();
  } catch (error) {
    console.error(
      "Login failed:",
      error
    );

    accessError.textContent =
      error?.message ??
      "Could not sign in.";

    accessCodeInput.select();
  } finally {
    setAccessFormBusy(false);
  }
}

async function forgetThisDevice() {
  logoutButton.disabled =
    true;

  try {
    await fetch(
      AUTH_API_URL,
      {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      }
    );
  } catch (error) {
    console.error(
      "Logout request failed:",
      error
    );
  } finally {
    currentReservations = [];

    renderSchedule();

    showAccessGate();

    logoutButton.disabled =
      false;
  }
}

function unlockApplication() {
  accessGate.classList.add(
    "access-gate-hidden"
  );

  mainApp.classList.remove(
    "app-locked"
  );

  accessError.textContent =
    "";

  requestAnimationFrame(
    () => {
      updateScheduleDimensions();
    }
  );
}

function showAccessGate() {
  if (
    dialog.open
  ) {
    dialog.close();
  }

  mainApp.classList.add(
    "app-locked"
  );

  accessGate.classList.remove(
    "access-gate-hidden"
  );

  accessCodeInput.value =
    "";

  window.setTimeout(
    () => {
      accessCodeInput.focus();
    },
    0
  );
}

function setAccessFormBusy(
  isBusy
) {
  accessCodeInput.disabled =
    isBusy;

  accessSubmitButton.disabled =
    isBusy;

  togglePasswordButton.disabled =
    isBusy;

  accessSubmitButton.textContent =
    isBusy
      ? "Checking..."
      : "Unlock Schedule";
}

function togglePasswordVisibility() {
  const showingPassword =
    accessCodeInput.type ===
    "text";

  accessCodeInput.type =
    showingPassword
      ? "password"
      : "text";

  togglePasswordButton.textContent =
    showingPassword
      ? "Show"
      : "Hide";

  togglePasswordButton.setAttribute(
    "aria-label",
    showingPassword
      ? "Show access code"
      : "Hide access code"
  );

  accessCodeInput.focus();
}

/* =========================================================
   Unified authenticated API request
   ========================================================= */

async function apiRequest(
  url,
  options = {}
) {
  let response;

  try {
    response =
      await fetch(
        url,
        {
          ...options,

          credentials:
            "include",

          cache:
            "no-store",

          headers: {
            ...(options.body
              ? {
                  "Content-Type":
                    "application/json",
                }
              : {}),

            ...(options.headers ?? {}),
          },
        }
      );
  } catch {
    throw new Error(
      "Could not connect to the reservation server."
    );
  }

  const payload =
    await readJsonResponse(
      response
    );

  if (
    response.status === 401
  ) {
    showAccessGate();

    accessError.textContent =
      "Please enter the lab access code.";

    throw new Error(
      "Authentication required."
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

      let resourceColumnWidth =
        145;

      if (cardWidth < 800) {
        resourceColumnWidth =
          125;
      }

      if (cardWidth < 600) {
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
        updateScheduleDimensions
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
    }
  );
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
    currentReservations = [];

    renderSchedule();

    if (
      error.message !==
      "Authentication required."
    ) {
      setStatus(
        error.message
      );
    }
  }
}

/* =========================================================
   Schedule rendering
   ========================================================= */

function renderSchedule() {
  scheduleElement.innerHTML =
    "";

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
    updateScheduleDimensions
  );
}

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

    label.style.left =
      `${minutesToPercent(
        (
          hour -
          DISPLAY_START_HOUR
        ) * 60
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

  const timeline =
    document.createElement(
      "div"
    );

  timeline.className =
    "timeline-row";

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
        ) === resource.id
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
      duration
    )}%`;

  const title =
    document.createElement(
      "span"
    );

  title.className =
    "reservation-title";

  title.textContent =
    reservation.title;

  const details =
    document.createElement(
      "span"
    );

  details.className =
    "reservation-details";

  details.textContent =
    `${reservation.person_name} · ` +
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
   Reservation dialog
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

  dialog.showModal();

  personNameInput.focus();
}

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
}

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

  const endMinutes =
    timeInputToMinutes(
      endTimeInput.value
    );

  if (
    endMinutes === null ||
    endMinutes <= startMinutes
  ) {
    endTimeInput.value =
      minutesToTimeInput(
        Math.min(
          startMinutes +
          DEFAULT_RESERVATION_MINUTES,
          DISPLAY_END_HOUR *
          60
        )
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

  const title =
    titleInput
      .value
      .trim();

  const start =
    combineSelectedDateAndTime(
      startTimeInput.value
    );

  const end =
    combineSelectedDateAndTime(
      endTimeInput.value
    );

  if (!personName) {
    formError.textContent =
      "Please enter your name.";

    return;
  }

  if (!title) {
    formError.textContent =
      "Please enter a description.";

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
      "Reservations must be between 7 AM and 11 PM.";

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
    formError.textContent =
      error.message;
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

  /*
    Teams may block window.confirm, so deletion uses
    a second click on the Delete button instead.
  */

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
        deleteButton.dataset.confirming =
          "false";

        deleteButton.textContent =
          "Delete";
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
    formError.textContent =
      error.message;
  } finally {
    deleteButton.dataset.confirming =
      "false";

    deleteButton.textContent =
      "Delete";

    setDialogBusy(false);
  }
}

function setDialogBusy(
  isBusy
) {
  form
    .querySelectorAll(
      "button, input:not([type='hidden']):not(:disabled)"
    )
    .forEach(element => {
      element.disabled =
        isBusy;
    });
}

/* =========================================================
   Utilities
   ========================================================= */

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
  return (
    `${date.getFullYear()}-` +
    `${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-` +
    `${String(
      date.getDate()
    ).padStart(2, "0")}`
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
  return date
    .toLocaleTimeString(
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

function setStatus(
  message
) {
  statusMessage.textContent =
    message;
}