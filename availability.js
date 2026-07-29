"use strict";

const AUTH_API_URL =
  "/api/auth";

const AVAILABILITY_API_URL =
  "/api/availability";

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

const accessGate =
  document.querySelector(
    "#access-gate"
  );

const mainApp =
  document.querySelector(
    "#main-app"
  );

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

let allSlots = [];
let members = [];
let currentMember = "";
let selectedStatus = "green";

let draftSlots =
  new Map();

let isDragging = false;

initialize();

async function initialize() {
  attachEventListeners();

  const authenticated =
    await checkAuthentication();

  if (!authenticated) {
    showAccessGate();

    return;
  }

  accessGate.classList.add(
    "access-gate-hidden"
  );

  mainApp.classList.remove(
    "app-hidden"
  );

  await loadAvailability();
}

function attachEventListeners() {
  memberSelect.addEventListener(
    "change",
    () => {
      selectMember(
        memberSelect.value
      );
    }
  );

  newMemberButton.addEventListener(
    "click",
    () => {
      nameError.textContent =
        "";

      newMemberNameInput.value =
        "";

      nameDialog.showModal();

      newMemberNameInput.focus();
    }
  );

  nameCancelButton.addEventListener(
    "click",
    () => {
      nameDialog.close();
    }
  );

  nameForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      const name =
        normalizeName(
          newMemberNameInput.value
        );

      if (!name) {
        nameError.textContent =
          "Please enter your name.";

        return;
      }

      if (
        !members.includes(name)
      ) {
        members.push(name);

        members.sort(
          (first, second) =>
            first.localeCompare(
              second
            )
        );
      }

      updateMemberOptions();

      memberSelect.value =
        name;

      nameDialog.close();

      selectMember(name);
    }
  );

  colorButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          selectedStatus =
            button.dataset.status;

          updateSelectedColorButton();
        }
      );
    }
  );

  clearButton.addEventListener(
    "click",
    () => {
      draftSlots.clear();

      renderTable();
    }
  );

  saveButton.addEventListener(
    "click",
    saveAvailability
  );

  window.addEventListener(
    "mouseup",
    () => {
      isDragging = false;
    }
  );

  window.addEventListener(
    "touchend",
    () => {
      isDragging = false;
    }
  );
}

async function checkAuthentication() {
  try {
    const response =
      await fetch(
        AUTH_API_URL,
        {
          method: "GET",
          credentials:
            "include",
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
  } catch {
    return false;
  }
}

function showAccessGate() {
  mainApp.classList.add(
    "app-hidden"
  );

  accessGate.classList.remove(
    "access-gate-hidden"
  );
}

async function loadAvailability() {
  setStatus(
    "Loading availability..."
  );

  try {
    const response =
      await fetch(
        AVAILABILITY_API_URL,
        {
          method: "GET",
          credentials:
            "include",
          cache: "no-store",
        }
      );

    const payload =
      await readJson(
        response
      );

    if (
      response.status === 401
    ) {
      showAccessGate();

      return;
    }

    if (!response.ok) {
      throw new Error(
        payload.error ??
        "Could not load availability."
      );
    }

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

    updateMemberOptions();

    selectMember(
      currentMember
    );

    setStatus("");
  } catch (error) {
    setStatus(
      error.message
    );
  }
}

function updateMemberOptions() {
  const previousValue =
    memberSelect.value;

  memberSelect.innerHTML =
    "";

  const allOption =
    document.createElement(
      "option"
    );

  allOption.value =
    "";

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

  if (
    members.includes(
      previousValue
    )
  ) {
    memberSelect.value =
      previousValue;
  }
}

function selectMember(
  memberName
) {
  currentMember =
    memberName;

  memberSelect.value =
    memberName;

  draftSlots.clear();

  if (memberName) {
    for (
      const slot
      of allSlots
    ) {
      if (
        slot.person_name ===
        memberName
      ) {
        draftSlots.set(
          slotKey(
            slot.weekday,
            slot.slot_index
          ),
          slot.status
        );
      }
    }

    editorControls.classList.remove(
      "hidden"
    );

    modeMessage.textContent =
      `Editing availability for ${memberName}.`;

  } else {
    editorControls.classList.add(
      "hidden"
    );

    modeMessage.textContent =
      members.length
        ? `Showing combined availability for ${members.length} members.`
        : "No availability responses have been submitted yet.";
  }

  renderTable();
}

function renderTable() {
  tableElement.innerHTML =
    "";

  appendCell(
    "Time",
    "table-cell header-cell time-cell corner-cell"
  );

  for (
    const day
    of DAYS
  ) {
    appendCell(
      day.name,
      "table-cell header-cell"
    );
  }

  for (
    let slotIndex = 0;
    slotIndex < SLOT_COUNT;
    slotIndex += 1
  ) {
    appendCell(
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
        String(day.id);

      cell.dataset.slotIndex =
        String(slotIndex);

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

  if (status) {
    cell.classList.add(
      `status-${status}`
    );
  }

  cell.addEventListener(
    "mousedown",
    event => {
      event.preventDefault();

      isDragging = true;

      paintCell(
        weekday,
        slotIndex
      );
    }
  );

  cell.addEventListener(
    "mouseenter",
    () => {
      if (isDragging) {
        paintCell(
          weekday,
          slotIndex
        );
      }
    }
  );

  cell.addEventListener(
    "touchstart",
    event => {
      event.preventDefault();

      paintCell(
        weekday,
        slotIndex
      );
    },
    {
      passive: false,
    }
  );

  cell.title =
    `${formatSlotTime(slotIndex)}–` +
    `${formatSlotTime(slotIndex + 1)}`;
}

function renderAggregateCell(
  cell,
  weekday,
  slotIndex
) {
  cell.disabled =
    true;

  const counts = {
    green: 0,
    yellow: 0,
    red: 0,
    empty: 0,
  };

  for (
    const member
    of members
  ) {
    const response =
      allSlots.find(
        item =>
          item.person_name ===
            member &&
          Number(
            item.weekday
          ) ===
            weekday &&
          Number(
            item.slot_index
          ) ===
            slotIndex
      );

    if (response) {
      counts[
        response.status
      ] += 1;
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

    bars.appendChild(bar);
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
      `${counts.green} available`;
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

function appendCell(
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

function paintCell(
  weekday,
  slotIndex
) {
  if (!currentMember) {
    return;
  }

  draftSlots.set(
    slotKey(
      weekday,
      slotIndex
    ),
    selectedStatus
  );

  renderTable();
}

function updateSelectedColorButton() {
  colorButtons.forEach(
    button => {
      button.classList.toggle(
        "selected",
        button.dataset.status ===
          selectedStatus
      );
    }
  );
}

async function saveAvailability() {
  if (!currentMember) {
    return;
  }

  saveButton.disabled =
    true;

  setStatus(
    "Saving availability..."
  );

  const slots =
    [];

  for (
    const [
      key,
      status,
    ]
    of draftSlots
  ) {
    const [
      weekday,
      slotIndex,
    ] =
      key
        .split("-")
        .map(Number);

    slots.push({
      weekday,
      slot_index:
        slotIndex,
      status,
    });
  }

  try {
    const response =
      await fetch(
        AVAILABILITY_API_URL,
        {
          method: "POST",

          credentials:
            "include",

          cache:
            "no-store",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              person_name:
                currentMember,

              slots,
            }),
        }
      );

    const payload =
      await readJson(
        response
      );

    if (
      response.status === 401
    ) {
      showAccessGate();

      return;
    }

    if (!response.ok) {
      throw new Error(
        payload.error ??
        "Could not save availability."
      );
    }

    await loadAvailability();

    memberSelect.value =
      currentMember;

    selectMember(
      currentMember
    );

    setStatus(
      "Availability saved."
    );
  } catch (error) {
    setStatus(
      error.message
    );
  } finally {
    saveButton.disabled =
      false;
  }
}

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
    )
    .replace(
      /[<>]/g,
      ""
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