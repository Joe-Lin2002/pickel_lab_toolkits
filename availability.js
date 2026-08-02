"use strict";

/* =========================================================
   API
   ========================================================= */

const AVAILABILITY_API_URL =
  "/api/availability";

/* =========================================================
   Schedule configuration

   All stored slot indexes are based on Central Time:
   Monday–Friday
   9:00 AM–5:00 PM
   30-minute intervals
   ========================================================= */

const DAYS = [
  {
    id: 1,
    name: "Monday",
  },
  {
    id: 2,
    name: "Tuesday",
  },
  {
    id: 3,
    name: "Wednesday",
  },
  {
    id: 4,
    name: "Thursday",
  },
  {
    id: 5,
    name: "Friday",
  },
];

const START_HOUR = 9;

const SLOT_MINUTES = 30;

const SLOT_COUNT = 16;

const VALID_STATUSES =
  new Set([
    "green",
    "yellow",
    "red",
  ]);

/* =========================================================
   Time-zone configuration
   ========================================================= */

const BASE_TIME_ZONE =
  "America/Chicago";

const SUPPORTED_TIME_ZONES =
  new Set([
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
  ]);

const TIME_ZONE_STORAGE_KEY =
  "pickel_lab_availability_timezone";

/* =========================================================
   HTML elements
   ========================================================= */

const memberSelect =
  document.querySelector(
    "#member-select"
  );

const newMemberButton =
  document.querySelector(
    "#new-member-button"
  );

const timezoneSelect =
  document.querySelector(
    "#timezone-select"
  );

const editorControls =
  document.querySelector(
    "#editor-controls"
  );

const colorButtons =
  document.querySelectorAll(
    ".color-button"
  );

const clearButton =
  document.querySelector(
    "#clear-button"
  );

const saveButton =
  document.querySelector(
    "#save-button"
  );

const modeMessage =
  document.querySelector(
    "#mode-message"
  );

const lastUpdatedMessage =
  document.querySelector(
    "#last-updated-message"
  );

const tableElement =
  document.querySelector(
    "#availability-table"
  );

const statusMessage =
  document.querySelector(
    "#status-message"
  );

const availabilityDetails =
  document.querySelector(
    "#availability-details"
  );

const availabilityDetailsTitle =
  document.querySelector(
    "#availability-details-title"
  );

const availabilityDetailsContent =
  document.querySelector(
    "#availability-details-content"
  );

const availabilityDetailsClose =
  document.querySelector(
    "#availability-details-close"
  );

const nameDialog =
  document.querySelector(
    "#name-dialog"
  );

const nameForm =
  document.querySelector(
    "#name-form"
  );

const newMemberNameInput =
  document.querySelector(
    "#new-member-name"
  );

const nameError =
  document.querySelector(
    "#name-error"
  );

const nameCancelButton =
  document.querySelector(
    "#name-cancel-button"
  );

/* =========================================================
   Application state
   ========================================================= */

let allSlots = [];

let members = [];

let currentMember = "";

let selectedStatus =
  "green";

let selectedTimeZone =
  BASE_TIME_ZONE;

let draftSlots =
  new Map();

let overallLastUpdatedAt =
  null;

let memberUpdatedAt = {};

let activeDetailsCell =
  null;

/* =========================================================
   Rectangle-drag state
   ========================================================= */

let isDragging = false;

let dragPointerId = null;

let dragStartCell = null;

let dragCurrentCell = null;

let dragOriginalSlots = null;

/* =========================================================
   Initialization
   ========================================================= */

initialize();

async function initialize() {
  validateRequiredElements();

  initializeTimeZone();

  attachEventListeners();

  updateSelectedColorButton();

  renderTable();

  await loadAvailability();
}

/* =========================================================
   Validation
   ========================================================= */

function validateRequiredElements() {
  const requiredElements = {
    memberSelect,
    newMemberButton,
    timezoneSelect,
    editorControls,
    clearButton,
    saveButton,
    modeMessage,
    lastUpdatedMessage,
    tableElement,
    statusMessage,
    availabilityDetails,
    availabilityDetailsTitle,
    availabilityDetailsContent,
    availabilityDetailsClose,
    nameDialog,
    nameForm,
    newMemberNameInput,
    nameError,
    nameCancelButton,
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
    colorButtons.length === 0
  ) {
    missingElements.push(
      "colorButtons"
    );
  }

  if (
    missingElements.length > 0
  ) {
    throw new Error(
      "Missing HTML elements: " +
      missingElements.join(", ")
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
  memberSelect.addEventListener(
    "change",
    () => {
      finishRectangleDrag(false);

      hideAvailabilityDetails();

      selectMember(
        memberSelect.value
      );
    }
  );

  timezoneSelect.addEventListener(
    "change",
    handleTimeZoneChange
  );

  newMemberButton.addEventListener(
    "click",
    openNameDialog
  );

  nameCancelButton.addEventListener(
    "click",
    () => {
      nameDialog.close();
    }
  );

  nameForm.addEventListener(
    "submit",
    handleNewMember
  );

  colorButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const status =
            button.dataset.status;

          if (
            !VALID_STATUSES.has(
              status
            )
          ) {
            return;
          }

          selectedStatus =
            status;

          updateSelectedColorButton();
        }
      );
    }
  );

  clearButton.addEventListener(
    "click",
    clearCurrentAvailability
  );

  saveButton.addEventListener(
    "click",
    saveAvailability
  );

  tableElement.addEventListener(
    "pointerdown",
    handleTablePointerDown
  );

  window.addEventListener(
    "pointermove",
    handleTablePointerMove,
    {
      passive: false,
    }
  );

  window.addEventListener(
    "pointerup",
    handleTablePointerUp
  );

  window.addEventListener(
    "pointercancel",
    handleTablePointerCancel
  );

  tableElement.addEventListener(
    "dragstart",
    event => {
      event.preventDefault();
    }
  );

  availabilityDetailsClose.addEventListener(
    "click",
    hideAvailabilityDetails
  );

  document.addEventListener(
    "pointerdown",
    event => {
      if (
        availabilityDetails.classList.contains(
          "hidden"
        )
      ) {
        return;
      }

      if (
        availabilityDetails.contains(
          event.target
        ) ||
        activeDetailsCell?.contains(
          event.target
        )
      ) {
        return;
      }

      hideAvailabilityDetails();
    }
  );

  window.addEventListener(
    "resize",
    hideAvailabilityDetails
  );

  window.addEventListener(
    "scroll",
    hideAvailabilityDetails,
    true
  );

  nameDialog.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        nameDialog
      ) {
        nameDialog.close();
      }
    }
  );
}

/* =========================================================
   Time-zone handling
   ========================================================= */

function initializeTimeZone() {
  const savedTimeZone =
    localStorage.getItem(
      TIME_ZONE_STORAGE_KEY
    );

  if (
    savedTimeZone &&
    SUPPORTED_TIME_ZONES.has(
      savedTimeZone
    )
  ) {
    selectedTimeZone =
      savedTimeZone;
  } else {
    selectedTimeZone =
      detectSupportedTimeZone();
  }

  timezoneSelect.value =
    selectedTimeZone;

  updateTimeZoneOptionLabels();
}

function detectSupportedTimeZone() {
  let browserTimeZone = "";

  try {
    browserTimeZone =
      Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone;
  } catch {
    return BASE_TIME_ZONE;
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

  const normalizedTimeZone =
    aliases[browserTimeZone] ??
    browserTimeZone;

  return SUPPORTED_TIME_ZONES.has(
    normalizedTimeZone
  )
    ? normalizedTimeZone
    : BASE_TIME_ZONE;
}

function handleTimeZoneChange() {
  const requestedTimeZone =
    timezoneSelect.value;

  selectedTimeZone =
    SUPPORTED_TIME_ZONES.has(
      requestedTimeZone
    )
      ? requestedTimeZone
      : BASE_TIME_ZONE;

  timezoneSelect.value =
    selectedTimeZone;

  localStorage.setItem(
    TIME_ZONE_STORAGE_KEY,
    selectedTimeZone
  );

  hideAvailabilityDetails();

  renderTable();
}

function updateTimeZoneOptionLabels() {
  const zoneNames = {
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
      abbreviation
        ? `${zoneNames[option.value]} (${abbreviation})`
        : zoneNames[option.value];
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
      ).formatToParts(
        new Date()
      );

    return (
      parts.find(
        part =>
          part.type ===
          "timeZoneName"
      )?.value ??
      ""
    );
  } catch {
    return "";
  }
}

/* =========================================================
   API request
   ========================================================= */

async function availabilityRequest(
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
      "Availability API connection error:",
      error
    );

    throw new Error(
      "Could not connect to the availability server."
    );
  }

  const payload =
    await readJson(
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

/* =========================================================
   Load data
   ========================================================= */

async function loadAvailability() {
  setStatus(
    "Loading availability..."
  );

  try {
    const payload =
      await availabilityRequest(
        AVAILABILITY_API_URL,
        {
          method: "GET",
        }
      );

    allSlots =
      Array.isArray(
        payload.slots
      )
        ? payload.slots
        : [];

    members =
      Array.isArray(
        payload.members
      )
        ? payload.members
        : [];

    overallLastUpdatedAt =
      typeof payload.last_updated_at ===
        "string"
        ? payload.last_updated_at
        : null;

    memberUpdatedAt =
      payload.member_updated_at &&
      typeof payload.member_updated_at ===
        "object"
        ? payload.member_updated_at
        : {};

    members =
      [
        ...new Set(
          members
            .map(
              normalizeName
            )
            .filter(Boolean)
        ),
      ].sort(
        compareNames
      );

    const previousMember =
      currentMember;

    updateMemberOptions();

    if (
      previousMember &&
      members.includes(
        previousMember
      )
    ) {
      selectMember(
        previousMember
      );
    } else {
      selectMember("");
    }

    setStatus("");
  } catch (error) {
    console.error(
      "Could not load availability:",
      error
    );

    allSlots = [];

    members = [];

    overallLastUpdatedAt =
      null;

    memberUpdatedAt = {};

    updateMemberOptions();

    selectMember("");

    if (
      error?.message !==
      "Authentication required."
    ) {
      setStatus(
        error?.message ??
        "Could not load availability."
      );
    }
  }
}

/* =========================================================
   Member selection
   ========================================================= */

function updateMemberOptions() {
  const desiredValue =
    currentMember;

  memberSelect.innerHTML = "";

  const allOption =
    document.createElement(
      "option"
    );

  allOption.value = "";

  allOption.textContent =
    "All members";

  memberSelect.appendChild(
    allOption
  );

  for (
    const member
    of members
  ) {
    const option =
      document.createElement(
        "option"
      );

    option.value =
      member;

    option.textContent =
      member;

    memberSelect.appendChild(
      option
    );
  }

  memberSelect.value =
    members.includes(
      desiredValue
    )
      ? desiredValue
      : "";
}

function selectMember(
  memberName
) {
  finishRectangleDrag(false);

  hideAvailabilityDetails();

  currentMember =
    members.includes(
      memberName
    )
      ? memberName
      : "";

  memberSelect.value =
    currentMember;

  draftSlots.clear();

  if (currentMember) {
    for (
      const slot
      of allSlots
    ) {
      if (
        slot.person_name !==
        currentMember
      ) {
        continue;
      }

      const weekday =
        Number(
          slot.weekday
        );

      const slotIndex =
        Number(
          slot.slot_index
        );

      if (
        weekday < 1 ||
        weekday > 5 ||
        slotIndex < 0 ||
        slotIndex >=
          SLOT_COUNT ||
        !VALID_STATUSES.has(
          slot.status
        )
      ) {
        continue;
      }

      draftSlots.set(
        slotKey(
          weekday,
          slotIndex
        ),
        slot.status
      );
    }

    editorControls.classList.remove(
      "hidden"
    );

    modeMessage.textContent =
      `Editing availability for ${currentMember}. ` +
      "Drag across the table to select a rectangular area.";
  } else {
    editorControls.classList.add(
      "hidden"
    );

    modeMessage.textContent =
      members.length > 0
        ? `Showing combined availability for ${members.length} member${members.length === 1 ? "" : "s"}. Hover over or click a time slot to view details.`
        : "No availability responses have been submitted yet.";
  }

  updateLastUpdatedMessage();

  renderTable();
}

/* =========================================================
   Last updated
   ========================================================= */

function updateLastUpdatedMessage() {
  const timestamp =
    currentMember
      ? memberUpdatedAt[
          currentMember
        ]
      : overallLastUpdatedAt;

  if (!timestamp) {
    lastUpdatedMessage.textContent =
      currentMember
        ? `Last updated by ${currentMember}: Not saved yet`
        : "Last updated: No submissions yet";

    lastUpdatedMessage.removeAttribute(
      "title"
    );

    return;
  }

  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    lastUpdatedMessage.textContent =
      "Last updated: Unknown";

    return;
  }

  const formattedTime =
    formatUpdatedTime(date);

  lastUpdatedMessage.textContent =
    currentMember
      ? `Last updated by ${currentMember}: ${formattedTime}`
      : `Last updated: ${formattedTime}`;

  lastUpdatedMessage.title =
    date.toString();
}

function formatUpdatedTime(
  date
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        selectedTimeZone,

      month:
        "short",

      day:
        "numeric",

      year:
        "numeric",

      hour:
        "numeric",

      minute:
        "2-digit",

      timeZoneName:
        "short",
    }
  ).format(date);
}

/* =========================================================
   Add member
   ========================================================= */

function openNameDialog() {
  nameError.textContent = "";

  newMemberNameInput.value = "";

  nameDialog.showModal();

  newMemberNameInput.focus();
}

function handleNewMember(
  event
) {
  event.preventDefault();

  nameError.textContent = "";

  const name =
    normalizeName(
      newMemberNameInput.value
    );

  if (!name) {
    nameError.textContent =
      "Please enter your name.";

    newMemberNameInput.focus();

    return;
  }

  if (
    name.length > 50
  ) {
    nameError.textContent =
      "Name cannot exceed 50 characters.";

    return;
  }

  if (
    containsMarkup(name)
  ) {
    nameError.textContent =
      "The name cannot contain < or >.";

    return;
  }

  const existingMember =
    members.find(
      member =>
        member.localeCompare(
          name,
          undefined,
          {
            sensitivity:
              "base",
          }
        ) === 0
    );

  const selectedName =
    existingMember ?? name;

  if (!existingMember) {
    members.push(
      selectedName
    );

    members.sort(
      compareNames
    );
  }

  currentMember =
    selectedName;

  updateMemberOptions();

  nameDialog.close();

  selectMember(
    selectedName
  );
}

/* =========================================================
   Render table
   ========================================================= */

function renderTable() {
  hideAvailabilityDetails();

  tableElement.innerHTML = "";

  appendTextCell(
    "Time",
    "table-cell header-cell time-cell corner-cell"
  );

  for (
    const day
    of DAYS
  ) {
    appendTextCell(
      day.name,
      "table-cell header-cell"
    );
  }

  for (
    let slotIndex = 0;
    slotIndex <
      SLOT_COUNT;
    slotIndex += 1
  ) {
    appendTextCell(
      formatSlotTime(
        slotIndex
      ),
      "table-cell time-cell"
    );

    for (
      const day
      of DAYS
    ) {
      const cell =
        document.createElement(
          "button"
        );

      cell.type =
        "button";

      cell.className =
        "table-cell slot-cell";

      cell.dataset.weekday =
        String(
          day.id
        );

      cell.dataset.slotIndex =
        String(
          slotIndex
        );

      if (currentMember) {
        renderEditableCell(
          cell,
          day.id,
          slotIndex
        );
      } else {
        renderAggregateCell(
          cell,
          day.id,
          slotIndex
        );
      }

      tableElement.appendChild(
        cell
      );
    }
  }

  updateLastUpdatedMessage();
}

function appendTextCell(
  text,
  className
) {
  const cell =
    document.createElement(
      "div"
    );

  cell.className =
    className;

  cell.textContent =
    text;

  tableElement.appendChild(
    cell
  );
}

/* =========================================================
   Editable cells
   ========================================================= */

function renderEditableCell(
  cell,
  weekday,
  slotIndex
) {
  cell.classList.add(
    "editable"
  );

  const key =
    slotKey(
      weekday,
      slotIndex
    );

  const status =
    draftSlots.get(key);

  applyStatusClass(
    cell,
    status
  );

  updateCellAccessibility(
    cell,
    weekday,
    slotIndex,
    status
  );

  cell.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
          "Enter" &&
        event.key !==
          " "
      ) {
        return;
      }

      event.preventDefault();

      draftSlots.set(
        key,
        selectedStatus
      );

      updateEditableCells();
    }
  );
}

/* =========================================================
   Rectangle selection
   ========================================================= */

function handleTablePointerDown(
  event
) {
  if (!currentMember) {
    return;
  }

  if (
    event.pointerType ===
      "mouse" &&
    event.button !== 0
  ) {
    return;
  }

  const cell =
    getEditableSlotCell(
      event.target
    );

  if (!cell) {
    return;
  }

  const coordinates =
    getCellCoordinates(
      cell
    );

  if (!coordinates) {
    return;
  }

  event.preventDefault();

  isDragging = true;

  dragPointerId =
    event.pointerId;

  dragStartCell =
    coordinates;

  dragCurrentCell =
    coordinates;

  dragOriginalSlots =
    new Map(
      draftSlots
    );

  tableElement.classList.add(
    "dragging"
  );

  try {
    tableElement.setPointerCapture(
      event.pointerId
    );
  } catch {
    // Pointer capture is optional.
  }

  applyDragRectangle();
}

function handleTablePointerMove(
  event
) {
  if (
    !isDragging ||
    event.pointerId !==
      dragPointerId
  ) {
    return;
  }

  event.preventDefault();

  const element =
    document.elementFromPoint(
      event.clientX,
      event.clientY
    );

  const cell =
    getEditableSlotCell(
      element
    );

  if (!cell) {
    handleDragAutoScroll(
      event
    );

    return;
  }

  const coordinates =
    getCellCoordinates(
      cell
    );

  if (!coordinates) {
    return;
  }

  if (
    dragCurrentCell &&
    dragCurrentCell.weekday ===
      coordinates.weekday &&
    dragCurrentCell.slotIndex ===
      coordinates.slotIndex
  ) {
    handleDragAutoScroll(
      event
    );

    return;
  }

  dragCurrentCell =
    coordinates;

  applyDragRectangle();

  handleDragAutoScroll(
    event
  );
}

function handleTablePointerUp(
  event
) {
  if (
    !isDragging ||
    event.pointerId !==
      dragPointerId
  ) {
    return;
  }

  finishRectangleDrag(false);
}

function handleTablePointerCancel(
  event
) {
  if (
    !isDragging ||
    event.pointerId !==
      dragPointerId
  ) {
    return;
  }

  finishRectangleDrag(true);
}

function applyDragRectangle() {
  if (
    !dragStartCell ||
    !dragCurrentCell ||
    !dragOriginalSlots
  ) {
    return;
  }

  draftSlots =
    new Map(
      dragOriginalSlots
    );

  const minimumWeekday =
    Math.min(
      dragStartCell.weekday,
      dragCurrentCell.weekday
    );

  const maximumWeekday =
    Math.max(
      dragStartCell.weekday,
      dragCurrentCell.weekday
    );

  const minimumSlotIndex =
    Math.min(
      dragStartCell.slotIndex,
      dragCurrentCell.slotIndex
    );

  const maximumSlotIndex =
    Math.max(
      dragStartCell.slotIndex,
      dragCurrentCell.slotIndex
    );

  for (
    let weekday =
      minimumWeekday;
    weekday <=
      maximumWeekday;
    weekday += 1
  ) {
    for (
      let slotIndex =
        minimumSlotIndex;
      slotIndex <=
        maximumSlotIndex;
      slotIndex += 1
    ) {
      draftSlots.set(
        slotKey(
          weekday,
          slotIndex
        ),
        selectedStatus
      );
    }
  }

  updateEditableCells();

  updateRectanglePreview(
    minimumWeekday,
    maximumWeekday,
    minimumSlotIndex,
    maximumSlotIndex
  );
}

function finishRectangleDrag(
  restoreOriginal
) {
  if (!isDragging) {
    return;
  }

  if (
    restoreOriginal &&
    dragOriginalSlots
  ) {
    draftSlots =
      new Map(
        dragOriginalSlots
      );

    updateEditableCells();
  }

  tableElement.classList.remove(
    "dragging"
  );

  tableElement
    .querySelectorAll(
      ".rectangle-preview"
    )
    .forEach(
      cell => {
        cell.classList.remove(
          "rectangle-preview"
        );
      }
    );

  if (
    dragPointerId !== null
  ) {
    try {
      tableElement.releasePointerCapture(
        dragPointerId
      );
    } catch {
      // Pointer capture may already be released.
    }
  }

  isDragging = false;

  dragPointerId = null;

  dragStartCell = null;

  dragCurrentCell = null;

  dragOriginalSlots = null;
}

function updateRectanglePreview(
  minimumWeekday,
  maximumWeekday,
  minimumSlotIndex,
  maximumSlotIndex
) {
  const cells =
    tableElement.querySelectorAll(
      ".slot-cell.editable"
    );

  cells.forEach(
    cell => {
      const coordinates =
        getCellCoordinates(
          cell
        );

      if (!coordinates) {
        return;
      }

      const insideRectangle =
        coordinates.weekday >=
          minimumWeekday &&
        coordinates.weekday <=
          maximumWeekday &&
        coordinates.slotIndex >=
          minimumSlotIndex &&
        coordinates.slotIndex <=
          maximumSlotIndex;

      cell.classList.toggle(
        "rectangle-preview",
        insideRectangle
      );
    }
  );
}

function handleDragAutoScroll(
  event
) {
  const scrollContainer =
    tableElement.closest(
      ".availability-card"
    );

  if (!scrollContainer) {
    return;
  }

  const rectangle =
    scrollContainer
      .getBoundingClientRect();

  const edgeThreshold = 45;

  const maximumSpeed = 18;

  if (
    event.clientX <
    rectangle.left +
      edgeThreshold
  ) {
    const distance =
      rectangle.left +
      edgeThreshold -
      event.clientX;

    scrollContainer.scrollLeft -=
      Math.min(
        maximumSpeed,
        Math.max(
          4,
          distance / 3
        )
      );
  } else if (
    event.clientX >
    rectangle.right -
      edgeThreshold
  ) {
    const distance =
      event.clientX -
      (
        rectangle.right -
        edgeThreshold
      );

    scrollContainer.scrollLeft +=
      Math.min(
        maximumSpeed,
        Math.max(
          4,
          distance / 3
        )
      );
  }
}

/* =========================================================
   Editable-cell updates
   ========================================================= */

function updateEditableCells() {
  const cells =
    tableElement.querySelectorAll(
      ".slot-cell.editable"
    );

  cells.forEach(
    cell => {
      const coordinates =
        getCellCoordinates(
          cell
        );

      if (!coordinates) {
        return;
      }

      const status =
        draftSlots.get(
          slotKey(
            coordinates.weekday,
            coordinates.slotIndex
          )
        );

      applyStatusClass(
        cell,
        status
      );

      updateCellAccessibility(
        cell,
        coordinates.weekday,
        coordinates.slotIndex,
        status
      );
    }
  );
}

function applyStatusClass(
  cell,
  status
) {
  cell.classList.remove(
    "status-green",
    "status-yellow",
    "status-red"
  );

  if (
    VALID_STATUSES.has(
      status
    )
  ) {
    cell.classList.add(
      `status-${status}`
    );
  }
}

function updateCellAccessibility(
  cell,
  weekday,
  slotIndex,
  status
) {
  const day =
    DAYS.find(
      item =>
        item.id ===
        weekday
    );

  const statusText =
    status
      ? statusLabel(status)
      : "No response";

  const timeDescription =
    `${formatSlotTime(slotIndex)} to ` +
    `${formatSlotTime(slotIndex + 1)}`;

  cell.title =
    `${timeDescription}\n${statusText}`;

  cell.setAttribute(
    "aria-label",
    `${day?.name ?? "Day"}, ` +
    `${timeDescription}, ` +
    statusText
  );

  cell.setAttribute(
    "aria-pressed",
    status
      ? "true"
      : "false"
  );
}

function getEditableSlotCell(
  target
) {
  if (
    !(target instanceof Element)
  ) {
    return null;
  }

  const cell =
    target.closest(
      ".slot-cell.editable"
    );

  if (
    !cell ||
    !tableElement.contains(
      cell
    )
  ) {
    return null;
  }

  return cell;
}

function getCellCoordinates(
  cell
) {
  const weekday =
    Number(
      cell.dataset.weekday
    );

  const slotIndex =
    Number(
      cell.dataset.slotIndex
    );

  if (
    !Number.isInteger(
      weekday
    ) ||
    weekday < 1 ||
    weekday > 5 ||
    !Number.isInteger(
      slotIndex
    ) ||
    slotIndex < 0 ||
    slotIndex >=
      SLOT_COUNT
  ) {
    return null;
  }

  return {
    weekday,
    slotIndex,
  };
}

/* =========================================================
   All-members aggregate cells
   ========================================================= */

function renderAggregateCell(
  cell,
  weekday,
  slotIndex
) {
  cell.classList.add(
    "aggregate-cell"
  );

  const memberGroups =
    getSlotMemberGroups(
      weekday,
      slotIndex
    );

  const counts = {
    green:
      memberGroups.green.length,

    yellow:
      memberGroups.yellow.length,

    red:
      memberGroups.red.length,

    empty:
      memberGroups.empty.length,
  };

  const total =
    Math.max(
      members.length,
      1
    );

  const bars =
    document.createElement(
      "div"
    );

  bars.className =
    "aggregate-bars";

  for (
    const status
    of [
      "green",
      "yellow",
      "red",
      "empty",
    ]
  ) {
    const bar =
      document.createElement(
        "div"
      );

    bar.className =
      `aggregate-${status}`;

    bar.style.width =
      `${(
        counts[status] /
        total
      ) * 100}%`;

    bars.appendChild(
      bar
    );
  }

  const countLabel =
    document.createElement(
      "span"
    );

  countLabel.className =
    "aggregate-count";

  if (
    members.length > 0
  ) {
    countLabel.textContent =
      `${counts.green}/${members.length} available`;
  }

  cell.append(
    bars,
    countLabel
  );

  const details = {
    weekday,
    slotIndex,
    memberGroups,
  };

  const day =
    DAYS.find(
      item =>
        item.id ===
        weekday
    );

  const timeDescription =
    `${formatSlotTime(slotIndex)}–` +
    `${formatSlotTime(slotIndex + 1)}`;

  cell.title =
    `${day?.name ?? "Day"}, ${timeDescription}\n` +
    "Hover or click to view member details.";

  cell.setAttribute(
    "aria-label",
    `${day?.name ?? "Day"}, ` +
    `${timeDescription}. ` +
    `${counts.green} fully available, ` +
    `${counts.yellow} prefer not, ` +
    `${counts.red} conflicts, ` +
    `${counts.empty} no response.`
  );

  cell.addEventListener(
    "mouseenter",
    () => {
      showAvailabilityDetails(
        cell,
        details
      );
    }
  );

  cell.addEventListener(
    "focus",
    () => {
      showAvailabilityDetails(
        cell,
        details
      );
    }
  );

  cell.addEventListener(
    "click",
    event => {
      event.stopPropagation();

      showAvailabilityDetails(
        cell,
        details
      );
    }
  );

  cell.addEventListener(
    "keydown",
    event => {
      if (
        event.key !==
          "Enter" &&
        event.key !==
          " "
      ) {
        return;
      }

      event.preventDefault();

      showAvailabilityDetails(
        cell,
        details
      );
    }
  );
}

function getSlotMemberGroups(
  weekday,
  slotIndex
) {
  const groups = {
    green: [],
    yellow: [],
    red: [],
    empty: [],
  };

  const responseByMember =
    new Map();

  for (
    const slot
    of allSlots
  ) {
    if (
      Number(
        slot.weekday
      ) !== weekday ||
      Number(
        slot.slot_index
      ) !== slotIndex ||
      !VALID_STATUSES.has(
        slot.status
      )
    ) {
      continue;
    }

    responseByMember.set(
      slot.person_name,
      slot.status
    );
  }

  for (
    const member
    of members
  ) {
    const status =
      responseByMember.get(
        member
      );

    if (
      VALID_STATUSES.has(
        status
      )
    ) {
      groups[status].push(
        member
      );
    } else {
      groups.empty.push(
        member
      );
    }
  }

  return groups;
}

/* =========================================================
   Availability details popup
   ========================================================= */

function showAvailabilityDetails(
  cell,
  details
) {
  if (currentMember) {
    return;
  }

  activeDetailsCell =
    cell;

  const day =
    DAYS.find(
      item =>
        item.id ===
        details.weekday
    );

  const startTime =
    formatSlotTime(
      details.slotIndex
    );

  const endTime =
    formatSlotTime(
      details.slotIndex + 1
    );

  const abbreviation =
    getTimeZoneAbbreviation(
      selectedTimeZone
    );

  availabilityDetailsTitle.textContent =
    `${day?.name ?? "Day"}, ` +
    `${startTime}–${endTime}` +
    (
      abbreviation
        ? ` ${abbreviation}`
        : ""
    );

  availabilityDetailsContent.innerHTML =
    "";

  appendMemberGroup(
    "Conflict",
    "red",
    details.memberGroups.red
  );

  appendMemberGroup(
    "Prefer not",
    "yellow",
    details.memberGroups.yellow
  );

  appendMemberGroup(
    "No response",
    "empty",
    details.memberGroups.empty
  );

  appendMemberGroup(
    "Fully available",
    "green",
    details.memberGroups.green
  );

  availabilityDetails.classList.remove(
    "hidden"
  );

  requestAnimationFrame(
    () => {
      positionAvailabilityDetails(
        cell
      );
    }
  );
}

function appendMemberGroup(
  label,
  status,
  memberNames
) {
  const group =
    document.createElement(
      "section"
    );

  group.className =
    "availability-member-group";

  const heading =
    document.createElement(
      "h3"
    );

  const indicator =
    document.createElement(
      "span"
    );

  indicator.className =
    `availability-status-dot ${status}`;

  heading.appendChild(
    indicator
  );

  heading.append(
    `${label} (${memberNames.length})`
  );

  const names =
    document.createElement(
      "p"
    );

  names.textContent =
    memberNames.length > 0
      ? memberNames.join(", ")
      : "None";

  group.append(
    heading,
    names
  );

  availabilityDetailsContent.appendChild(
    group
  );
}

function positionAvailabilityDetails(
  cell
) {
  const cellRectangle =
    cell.getBoundingClientRect();

  const popupRectangle =
    availabilityDetails
      .getBoundingClientRect();

  const margin = 10;

  let left =
    cellRectangle.left +
    cellRectangle.width / 2 -
    popupRectangle.width / 2;

  left =
    Math.max(
      margin,
      Math.min(
        left,
        window.innerWidth -
        popupRectangle.width -
        margin
      )
    );

  let top =
    cellRectangle.bottom +
    8;

  if (
    top +
    popupRectangle.height >
    window.innerHeight -
    margin
  ) {
    top =
      cellRectangle.top -
      popupRectangle.height -
      8;
  }

  top =
    Math.max(
      margin,
      top
    );

  availabilityDetails.style.left =
    `${left}px`;

  availabilityDetails.style.top =
    `${top}px`;
}

function hideAvailabilityDetails() {
  availabilityDetails.classList.add(
    "hidden"
  );

  availabilityDetails.style.left =
    "";

  availabilityDetails.style.top =
    "";

  activeDetailsCell = null;
}

/* =========================================================
   Color controls
   ========================================================= */

function updateSelectedColorButton() {
  colorButtons.forEach(
    button => {
      const isSelected =
        button.dataset.status ===
        selectedStatus;

      button.classList.toggle(
        "selected",
        isSelected
      );

      button.setAttribute(
        "aria-pressed",
        isSelected
          ? "true"
          : "false"
      );
    }
  );
}

function clearCurrentAvailability() {
  if (!currentMember) {
    return;
  }

  finishRectangleDrag(false);

  draftSlots.clear();

  renderTable();

  setStatus(
    "Availability cleared locally. Click Save Availability to apply the change."
  );
}

/* =========================================================
   Save availability
   ========================================================= */

async function saveAvailability() {
  if (!currentMember) {
    return;
  }

  finishRectangleDrag(false);

  const slots = [];

  for (
    const [
      key,
      status,
    ]
    of draftSlots.entries()
  ) {
    const [
      weekday,
      slotIndex,
    ] =
      key
        .split("-")
        .map(Number);

    if (
      weekday < 1 ||
      weekday > 5 ||
      slotIndex < 0 ||
      slotIndex >=
        SLOT_COUNT ||
      !VALID_STATUSES.has(
        status
      )
    ) {
      continue;
    }

    slots.push({
      weekday,
      slot_index:
        slotIndex,
      status,
    });
  }

  slots.sort(
    (first, second) =>
      first.weekday -
        second.weekday ||
      first.slot_index -
        second.slot_index
  );

  setSaveBusy(true);

  setStatus(
    "Saving availability..."
  );

  try {
    await availabilityRequest(
      AVAILABILITY_API_URL,
      {
        method: "POST",

        body:
          JSON.stringify({
            person_name:
              currentMember,

            slots,
          }),
      }
    );

    const savedMember =
      currentMember;

    await loadAvailability();

    if (
      members.includes(
        savedMember
      )
    ) {
      selectMember(
        savedMember
      );
    }

    setStatus(
      "Availability saved."
    );
  } catch (error) {
    console.error(
      "Could not save availability:",
      error
    );

    if (
      error?.message !==
      "Authentication required."
    ) {
      setStatus(
        error?.message ??
        "Could not save availability."
      );
    }
  } finally {
    setSaveBusy(false);
  }
}

function setSaveBusy(
  isBusy
) {
  saveButton.disabled =
    isBusy;

  clearButton.disabled =
    isBusy;

  memberSelect.disabled =
    isBusy;

  newMemberButton.disabled =
    isBusy;

  timezoneSelect.disabled =
    isBusy;

  colorButtons.forEach(
    button => {
      button.disabled =
        isBusy;
    }
  );

  saveButton.textContent =
    isBusy
      ? "Saving..."
      : "Save Availability";
}

/* =========================================================
   Time conversion

   The stored schedule is based on America/Chicago.
   A reference Monday in the current week is used so browser
   Intl APIs handle daylight-saving offsets.
   ========================================================= */

function formatSlotTime(
  slotIndex
) {
  const baseDate =
    createBaseTimeDate(
      slotIndex
    );

  try {
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
      }
    ).format(
      baseDate
    );
  } catch {
    return formatCentralSlotTime(
      slotIndex
    );
  }
}

function createBaseTimeDate(
  slotIndex
) {
  const referenceMonday =
    getCurrentReferenceMonday();

  const totalMinutes =
    START_HOUR *
    60 +
    slotIndex *
    SLOT_MINUTES;

  const hour =
    Math.floor(
      totalMinutes / 60
    );

  const minute =
    totalMinutes % 60;

  return zonedLocalTimeToDate(
    referenceMonday.year,
    referenceMonday.month,
    referenceMonday.day,
    hour,
    minute,
    BASE_TIME_ZONE
  );
}

function getCurrentReferenceMonday() {
  const now =
    new Date();

  const centralParts =
    getDatePartsInTimeZone(
      now,
      BASE_TIME_ZONE
    );

  const centralNoon =
    new Date(
      Date.UTC(
        centralParts.year,
        centralParts.month - 1,
        centralParts.day,
        12,
        0,
        0
      )
    );

  const weekday =
    centralNoon.getUTCDay();

  const daysSinceMonday =
    weekday === 0
      ? 6
      : weekday - 1;

  centralNoon.setUTCDate(
    centralNoon.getUTCDate() -
    daysSinceMonday
  );

  return {
    year:
      centralNoon.getUTCFullYear(),

    month:
      centralNoon.getUTCMonth() + 1,

    day:
      centralNoon.getUTCDate(),
  };
}

function getDatePartsInTimeZone(
  date,
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
      }
    ).formatToParts(date);

  const values = {};

  for (
    const part
    of parts
  ) {
    if (
      part.type !==
      "literal"
    ) {
      values[part.type] =
        Number(
          part.value
        );
    }
  }

  return {
    year:
      values.year,

    month:
      values.month,

    day:
      values.day,
  };
}

function zonedLocalTimeToDate(
  year,
  month,
  day,
  hour,
  minute,
  timeZone
) {
  const initial =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        hour,
        minute,
        0,
        0
      )
    );

  const firstOffset =
    getTimeZoneOffsetMilliseconds(
      initial,
      timeZone
    );

  let result =
    new Date(
      initial.getTime() -
      firstOffset
    );

  const correctedOffset =
    getTimeZoneOffsetMilliseconds(
      result,
      timeZone
    );

  if (
    correctedOffset !==
    firstOffset
  ) {
    result =
      new Date(
        initial.getTime() -
        correctedOffset
      );
  }

  return result;
}

function getTimeZoneOffsetMilliseconds(
  date,
  timeZone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year:
          "numeric",
        month:
          "2-digit",
        day:
          "2-digit",
        hour:
          "2-digit",
        minute:
          "2-digit",
        second:
          "2-digit",
        hourCycle:
          "h23",
      }
    ).formatToParts(date);

  const values = {};

  for (
    const part
    of parts
  ) {
    if (
      part.type !==
      "literal"
    ) {
      values[part.type] =
        Number(
          part.value
        );
    }
  }

  const zonedTimestamp =
    Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

  return (
    zonedTimestamp -
    date.getTime()
  );
}

function formatCentralSlotTime(
  slotIndex
) {
  const totalMinutes =
    START_HOUR *
    60 +
    slotIndex *
    SLOT_MINUTES;

  const hour =
    Math.floor(
      totalMinutes / 60
    );

  const minute =
    totalMinutes % 60;

  const displayHour =
    hour % 12 || 12;

  const suffix =
    hour >= 12
      ? "PM"
      : "AM";

  return (
    `${displayHour}:` +
    `${String(
      minute
    ).padStart(2, "0")} ` +
    suffix
  );
}

/* =========================================================
   Utilities
   ========================================================= */

function slotKey(
  weekday,
  slotIndex
) {
  return (
    `${weekday}-` +
    `${slotIndex}`
  );
}

function statusLabel(
  status
) {
  switch (status) {
    case "green":
      return "Fully available";

    case "yellow":
      return "Prefer not";

    case "red":
      return "Conflict";

    default:
      return "No response";
  }
}

function normalizeName(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function compareNames(
  first,
  second
) {
  return first.localeCompare(
    second,
    undefined,
    {
      sensitivity:
        "base",
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

async function readJson(
  response
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function setStatus(
  message
) {
  statusMessage.textContent =
    message;
}