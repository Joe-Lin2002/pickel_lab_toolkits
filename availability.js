"use strict";

/* =========================================================
   API endpoint
   ========================================================= */

const AVAILABILITY_API_URL =
  "/api/availability";

/* =========================================================
   Weekly schedule configuration

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

let overallLastUpdatedAt = null;

let memberUpdatedAt = {};

let currentMember = "";

let selectedStatus = "green";

let draftSlots =
  new Map();

/* =========================================================
   Rectangle drag state
   ========================================================= */

let isDragging = false;

let dragPointerId = null;

let dragStartCell = null;

let dragCurrentCell = null;

let dragOriginalSlots = null;

/* =========================================================
   Initialize
   ========================================================= */

initialize();

async function initialize() {
  validateRequiredElements();

  attachEventListeners();

  updateSelectedColorButton();

  renderTable();

  await loadAvailability();
}

/* =========================================================
   Validate page structure
   ========================================================= */

function validateRequiredElements() {
  const requiredElements = {
    memberSelect,
    newMemberButton,
    editorControls,
    clearButton,
    saveButton,
    modeMessage,
    lastUpdatedMessage,
    tableElement,
    statusMessage,
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
      finishRectangleDrag(
        false
      );

      selectMember(
        memberSelect.value
      );
    }
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

  /*
    Pointer events support:
    - mouse
    - touch
    - stylus
  */

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

  /*
    Prevent the native drag operation from interfering
    with rectangular selection.
  */

  tableElement.addEventListener(
    "dragstart",
    event => {
      event.preventDefault();
    }
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
   Authenticated request helper
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
   Load availability
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

    overallLastUpdatedAt = null;

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
  finishRectangleDrag(
    false
  );

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
        ? `Showing combined availability for ${members.length} member${members.length === 1 ? "" : "s"}.`
        : "No availability responses have been submitted yet.";
  }

  updateLastUpdatedMessage();

  renderTable();
}

function updateLastUpdatedMessage() {
  if (!lastUpdatedMessage) {
    return;
  }

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
  return date.toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );
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

  memberSelect.value =
    selectedName;

  nameDialog.close();

  selectMember(
    selectedName
  );
}

/* =========================================================
   Render table
   ========================================================= */

function renderTable() {
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

      cell.setAttribute(
        "aria-label",
        `${day.name}, ` +
        `${formatSlotTime(slotIndex)} to ` +
        `${formatSlotTime(slotIndex + 1)}`
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

  /*
    Keyboard users can select one cell using Enter or Space.
  */

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

  /*
    Preserve all availability values that existed before
    this drag operation. Each preview is rebuilt from this
    state so dragging backward correctly shrinks the area.
  */

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
    /*
      Pointer capture may be unsupported in some embedded
      browsers. Rectangle selection can still continue.
    */
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

  /*
    Pointer capture can cause event.target to remain the
    original table element. elementFromPoint determines the
    slot currently underneath the pointer.
  */

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

  finishRectangleDrag(
    false
  );
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

  /*
    Restore the availability state if the browser cancels
    the pointer gesture unexpectedly.
  */

  finishRectangleDrag(
    true
  );
}

function applyDragRectangle() {
  if (
    !dragStartCell ||
    !dragCurrentCell ||
    !dragOriginalSlots
  ) {
    return;
  }

  /*
    Reset the current draft before applying the updated
    rectangular preview.
  */

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
      /*
        Pointer capture may already have been released.
      */
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

/* =========================================================
   Drag auto-scroll

   Useful on phones when the table is wider than the screen.
   ========================================================= */

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

    const speed =
      Math.min(
        maximumSpeed,
        Math.max(
          4,
          distance / 3
        )
      );

    scrollContainer.scrollLeft -=
      speed;
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

    const speed =
      Math.min(
        maximumSpeed,
        Math.max(
          4,
          distance / 3
        )
      );

    scrollContainer.scrollLeft +=
      speed;
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

  cell.title =
    [
      `${formatSlotTime(slotIndex)}–${formatSlotTime(slotIndex + 1)}`,
      statusText,
    ].join("\n");

  cell.setAttribute(
    "aria-label",
    `${day?.name ?? "Day"}, ` +
    `${formatSlotTime(slotIndex)} to ` +
    `${formatSlotTime(slotIndex + 1)}, ` +
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
   Aggregate cells
   ========================================================= */

function renderAggregateCell(
  cell,
  weekday,
  slotIndex
) {
  cell.disabled = true;

  const counts = {
    green: 0,
    yellow: 0,
    red: 0,
    empty: 0,
  };

  const responsesByMember =
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

    responsesByMember.set(
      slot.person_name,
      slot.status
    );
  }

  for (
    const member
    of members
  ) {
    const status =
      responsesByMember.get(
        member
      );

    if (
      VALID_STATUSES.has(
        status
      )
    ) {
      counts[status] += 1;
    } else {
      counts.empty += 1;
    }
  }

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

  cell.title =
    [
      `${formatSlotTime(slotIndex)}–${formatSlotTime(slotIndex + 1)}`,
      `Fully available: ${counts.green}`,
      `Prefer not: ${counts.yellow}`,
      `Conflict: ${counts.red}`,
      `No response: ${counts.empty}`,
    ].join("\n");
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

  finishRectangleDrag(
    false
  );

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

  finishRectangleDrag(
    false
  );

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
   Utility functions
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

function formatSlotTime(
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