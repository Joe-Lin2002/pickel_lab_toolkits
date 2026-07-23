"use strict";

const SUPABASE_URL = "https://klpsqhugljdujfuislzb.supabase.co";
const SUPABASE_KEY = "sb_publishable_vx6z9_wSGdRYsG-btENzmQ_jB0pKbdO";

const database = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

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

const DISPLAY_START_HOUR = 7;
const DISPLAY_END_HOUR = 19;
const DISPLAY_MINUTES =
  (DISPLAY_END_HOUR - DISPLAY_START_HOUR) * 60;

const scheduleElement =
  document.querySelector("#schedule");

const datePicker =
  document.querySelector("#date-picker");

const statusMessage =
  document.querySelector("#status-message");

const dialog =
  document.querySelector("#reservation-dialog");

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

initialize();

async function initialize() {
  datePicker.value = formatDateInput(new Date());

  attachEventListeners();
  await loadReservations();
}

function attachEventListeners() {
  document
    .querySelector("#previous-day")
    .addEventListener("click", async () => {
      changeDate(-1);
      await loadReservations();
    });

  document
    .querySelector("#next-day")
    .addEventListener("click", async () => {
      changeDate(1);
      await loadReservations();
    });

  document
    .querySelector("#today-button")
    .addEventListener("click", async () => {
      datePicker.value = formatDateInput(new Date());
      await loadReservations();
    });

  datePicker.addEventListener("change", loadReservations);

  form.addEventListener("submit", saveReservation);

  document
    .querySelector("#cancel-button")
    .addEventListener("click", () => {
      dialog.close();
    });

  deleteButton.addEventListener(
    "click",
    deleteReservation
  );
}

function changeDate(numberOfDays) {
  const date = selectedLocalDate();
  date.setDate(date.getDate() + numberOfDays);
  datePicker.value = formatDateInput(date);
}

async function loadReservations() {
  setStatus("Loading schedule...");

  const dayStart = selectedLocalDate();
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const { data, error } = await database
    .from("reservations")
    .select("*")
    .lt("start_time", dayEnd.toISOString())
    .gt("end_time", dayStart.toISOString())
    .order("start_time");

  if (error) {
    console.error(error);
    setStatus(`Could not load reservations: ${error.message}`);
    return;
  }

  currentReservations = data ?? [];
  renderSchedule();
  setStatus("");
}

function renderSchedule() {
  scheduleElement.innerHTML = "";

  const header = document.createElement("div");
  header.className = "schedule-header";

  const corner = document.createElement("div");
  corner.className = "corner-cell";

  const timelineHeader =
    document.createElement("div");

  timelineHeader.className = "timeline-header";

  for (
    let hour = DISPLAY_START_HOUR;
    hour <= DISPLAY_END_HOUR;
    hour += 1
  ) {
    const label = document.createElement("div");
    label.className = "hour-label";

    const minutesFromStart =
      (hour - DISPLAY_START_HOUR) * 60;

    label.style.left =
      `${minutesToPercent(minutesFromStart)}%`;

    label.textContent = formatHourLabel(hour);
    timelineHeader.appendChild(label);
  }

  header.append(corner, timelineHeader);
  scheduleElement.appendChild(header);

  for (const resource of resources) {
    const row = document.createElement("div");
    row.className = "resource-row";

    const name = document.createElement("div");
    name.className = "resource-name";
    name.textContent = resource.name;

    const timeline = document.createElement("div");
    timeline.className = "timeline-row";
    timeline.dataset.resourceId = String(resource.id);

    timeline.addEventListener("click", event => {
      openCreateDialog(resource, event);
    });

    const reservationsForResource =
      currentReservations.filter(
        reservation =>
          reservation.resource_id === resource.id
      );

    for (
      const reservation of reservationsForResource
    ) {
      timeline.appendChild(
        createReservationBlock(reservation)
      );
    }

    row.append(name, timeline);
    scheduleElement.appendChild(row);
  }
}

function createReservationBlock(reservation) {
  const block = document.createElement("button");
  block.type = "button";
  block.className = "reservation";

  const dayStart = selectedLocalDate();

  const start = new Date(reservation.start_time);
  const end = new Date(reservation.end_time);

  const displayStart = new Date(dayStart);
  displayStart.setHours(
    DISPLAY_START_HOUR,
    0,
    0,
    0
  );

  const startMinutes =
    (start - displayStart) / 60000;

  const endMinutes =
    (end - displayStart) / 60000;

  const clippedStart = Math.max(0, startMinutes);
  const clippedEnd = Math.min(
    DISPLAY_MINUTES,
    endMinutes
  );

  block.style.left =
    `${minutesToPercent(clippedStart)}%`;

  block.style.width =
    `${minutesToPercent(
      clippedEnd - clippedStart
    )}%`;

  const title = document.createElement("span");
  title.className = "reservation-title";
  title.textContent = reservation.title;

  const details = document.createElement("span");
  details.className = "reservation-details";

  details.textContent =
    `${reservation.person_name} · ` +
    `${formatTime(start)}–${formatTime(end)}`;

  block.append(title, details);

  block.addEventListener("click", event => {
    event.stopPropagation();
    openEditDialog(reservation);
  });

  return block;
}

function openCreateDialog(resource, clickEvent) {
  clearDialog();

  const timelineRect =
    clickEvent.currentTarget.getBoundingClientRect();

  const clickPosition =
    clickEvent.clientX - timelineRect.left;

  const fraction =
    clickPosition / timelineRect.width;

  let selectedMinutes =
    DISPLAY_START_HOUR * 60 +
    fraction * DISPLAY_MINUTES;

  selectedMinutes =
    Math.round(selectedMinutes / 15) * 15;

  const endMinutes = Math.min(
    selectedMinutes + 60,
    DISPLAY_END_HOUR * 60
  );

  resourceIdInput.value = String(resource.id);
  resourceNameInput.value = resource.name;

  startTimeInput.value =
    minutesToTimeInput(selectedMinutes);

  endTimeInput.value =
    minutesToTimeInput(endMinutes);

  deleteButton.classList.add("hidden");
  dialog.showModal();
  personNameInput.focus();
}

function openEditDialog(reservation) {
  clearDialog();

  const resource = resources.find(
    item => item.id === reservation.resource_id
  );

  reservationIdInput.value =
    String(reservation.id);

  resourceIdInput.value =
    String(reservation.resource_id);

  resourceNameInput.value =
    resource?.name ?? "Unknown equipment";

  personNameInput.value =
    reservation.person_name;

  titleInput.value =
    reservation.title;

  startTimeInput.value =
    dateToTimeInput(
      new Date(reservation.start_time)
    );

  endTimeInput.value =
    dateToTimeInput(
      new Date(reservation.end_time)
    );

  deleteButton.classList.remove("hidden");
  dialog.showModal();
}

function clearDialog() {
  form.reset();
  reservationIdInput.value = "";
  resourceIdInput.value = "";
  formError.textContent = "";
}

async function saveReservation(event) {
  event.preventDefault();
  formError.textContent = "";

  const reservationId =
    reservationIdInput.value;

  const resourceId =
    Number(resourceIdInput.value);

  const start = combineSelectedDateAndTime(
    startTimeInput.value
  );

  const end = combineSelectedDateAndTime(
    endTimeInput.value
  );

  if (!(start < end)) {
    formError.textContent =
      "End time must be after start time.";
    return;
  }

  if (
    start.getHours() < DISPLAY_START_HOUR ||
    end.getHours() > DISPLAY_END_HOUR ||
    (
      end.getHours() === DISPLAY_END_HOUR &&
      end.getMinutes() > 0
    )
  ) {
    formError.textContent =
      `Reservations must be between ` +
      `${formatHourLabel(DISPLAY_START_HOUR)} and ` +
      `${formatHourLabel(DISPLAY_END_HOUR)}.`;

    return;
  }

  const hasConflict = currentReservations.some(
    reservation => {
      const isSameResource =
        reservation.resource_id === resourceId;

      const isDifferentReservation =
        String(reservation.id) !==
        String(reservationId);

      const existingStart =
        new Date(reservation.start_time);

      const existingEnd =
        new Date(reservation.end_time);

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
    person_name: personNameInput.value.trim(),
    title: titleInput.value.trim(),
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  };

  let result;

  if (reservationId) {
    result = await database
      .from("reservations")
      .update(record)
      .eq("id", reservationId);
  } else {
    result = await database
      .from("reservations")
      .insert(record);
  }

  if (result.error) {
    console.error(result.error);
    formError.textContent =
      result.error.message;

    return;
  }

  dialog.close();
  await loadReservations();
}

async function deleteReservation() {
  const reservationId =
    reservationIdInput.value;

  if (!reservationId) {
    return;
  }

  const confirmed = window.confirm(
    "Delete this reservation?"
  );

  if (!confirmed) {
    return;
  }

  const { error } = await database
    .from("reservations")
    .delete()
    .eq("id", reservationId);

  if (error) {
    console.error(error);
    formError.textContent = error.message;
    return;
  }

  dialog.close();
  await loadReservations();
}

function selectedLocalDate() {
  const [year, month, day] =
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

function combineSelectedDateAndTime(timeValue) {
  const date = selectedLocalDate();

  const [hours, minutes] =
    timeValue.split(":").map(Number);

  date.setHours(hours, minutes, 0, 0);
  return date;
}

function minutesToPercent(minutes) {
  return (minutes / DISPLAY_MINUTES) * 100;
}

function minutesToTimeInput(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(minutes).padStart(2, "0")
  );
}

function dateToTimeInput(date) {
  return (
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

function formatDateInput(date) {
  const year = date.getFullYear();

  const month =
    String(date.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(date.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatHourLabel(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayedHour = hour % 12 || 12;

  return `${displayedHour} ${suffix}`;
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

function setStatus(message) {
  statusMessage.textContent = message;
}