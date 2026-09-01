"use strict";

(() => {
  const RESERVATIONS_API_URL = "/api/reservations";

  const RESOURCES = [
    { id: 1, name: "ETC 1.204D" },
    { id: 2, name: "ETC 1.204E" },
    { id: 3, name: "ETC 1.204F" },
  ];

  const homeView = document.querySelector("#home-view");
  const grid = document.querySelector("#equipment-status-grid");
  const refreshButton = document.querySelector("#equipment-status-refresh");
  const updatedText = document.querySelector("#equipment-status-updated");
  const errorText = document.querySelector("#equipment-status-error");

  if (!homeView || !grid || !refreshButton || !updatedText || !errorText) return;

  let hasLoaded = false;
  let loading = false;

  renderLoadingCards();

  refreshButton.addEventListener("click", () => {
    loadEquipmentStatus();
  });

  const observer = new MutationObserver(() => {
    if (!homeView.classList.contains("hidden") && !hasLoaded) {
      loadEquipmentStatus();
    }
  });

  observer.observe(homeView, {
    attributes: true,
    attributeFilter: ["class"],
  });

  if (!homeView.classList.contains("hidden")) {
    loadEquipmentStatus();
  }

  async function loadEquipmentStatus() {
    if (loading) return;

    loading = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing...";
    errorText.textContent = "";

    const now = new Date();
    const requestStart = new Date(now.getTime() - 60 * 1000);
    const requestEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const query = new URLSearchParams({
      start: requestStart.toISOString(),
      end: requestEnd.toISOString(),
    });

    try {
      const response = await fetch(
        `${RESERVATIONS_API_URL}?${query.toString()}`,
        {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        }
      );

      let payload = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load equipment availability.");
      }

      const reservations = Array.isArray(payload.reservations)
        ? payload.reservations
        : [];

      renderStatuses(reservations, now);
      updatedText.textContent = `Updated ${formatTime(now)}`;
      hasLoaded = true;
    } catch (error) {
      console.error("Equipment status error:", error);
      renderUnavailableCards();
      updatedText.textContent = "";
      errorText.textContent =
        error?.message ?? "Could not load equipment availability.";
    } finally {
      loading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "↻ Refresh";
    }
  }

  function renderStatuses(reservations, now) {
    grid.innerHTML = "";

    for (const resource of RESOURCES) {
      const resourceReservations = reservations
        .filter(item => Number(item.resource_id) === resource.id)
        .map(normalizeReservation)
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

      const current = resourceReservations.find(
        reservation => reservation.start <= now && reservation.end > now
      );

      const next = resourceReservations.find(
        reservation => reservation.start > now
      );

      const card = document.createElement("a");
      card.className = `equipment-status-card ${current ? "in-use" : "available"}`;
      card.href = "/equipment-schedule.html";
      card.setAttribute(
        "aria-label",
        `${resource.name}: ${current ? "In use" : "Available now"}. Open equipment schedule.`
      );

      const room = document.createElement("div");
      room.className = "equipment-status-room";
      room.textContent = resource.name;

      const state = document.createElement("div");
      state.className = "equipment-status-state";

      const dot = document.createElement("span");
      dot.className = "equipment-status-dot";
      dot.setAttribute("aria-hidden", "true");

      const stateText = document.createElement("span");
      stateText.textContent = current ? "In use" : "Available now";

      state.append(dot, stateText);

      const detail = document.createElement("p");
      detail.className = "equipment-status-detail";

      if (current) {
        detail.textContent = `Reserved until ${formatTime(current.end)}`;
      } else if (next) {
        detail.textContent = `Next reservation at ${formatTime(next.start)}`;
      } else {
        detail.textContent = "No upcoming reservation in the next 24 hours";
      }

      card.append(room, state, detail);
      grid.appendChild(card);
    }
  }

  function renderLoadingCards() {
    grid.innerHTML = "";

    for (const resource of RESOURCES) {
      grid.appendChild(createPlaceholderCard(resource.name, "Loading..."));
    }
  }

  function renderUnavailableCards() {
    grid.innerHTML = "";

    for (const resource of RESOURCES) {
      grid.appendChild(createPlaceholderCard(resource.name, "Status unavailable"));
    }
  }

  function createPlaceholderCard(name, status) {
    const card = document.createElement("a");
    card.className = "equipment-status-card unavailable";
    card.href = "/equipment-schedule.html";

    const room = document.createElement("div");
    room.className = "equipment-status-room";
    room.textContent = name;

    const state = document.createElement("div");
    state.className = "equipment-status-state";

    const dot = document.createElement("span");
    dot.className = "equipment-status-dot";
    dot.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = status;

    state.append(dot, text);
    card.append(room, state);
    return card;
  }

  function normalizeReservation(item) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return { start, end };
  }

  function formatTime(date) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  }
})();
