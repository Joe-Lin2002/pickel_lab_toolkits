"use strict";

(() => {
  const SUBSCRIPTION_API_URL = "/api/calendar-subscription";

  const subscribeButton = document.querySelector("#subscribe-calendar");
  const statusMessage = document.querySelector("#meeting-status-message");

  if (!subscribeButton) return;

  subscribeButton.addEventListener("click", subscribeToCalendar);

  async function subscribeToCalendar() {
    const originalText = subscribeButton.textContent;
    subscribeButton.disabled = true;
    subscribeButton.textContent = "Opening...";

    try {
      const response = await window.pickelAuth.fetch(SUBSCRIPTION_API_URL, {
        method: "GET",
        cache: "no-store",
      });

      let payload = {};

      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not open the calendar subscription.");
      }

      const subscriptionUrl =
        typeof payload.subscription_url === "string"
          ? payload.subscription_url.trim()
          : "";

      if (!subscriptionUrl.startsWith("webcal://")) {
        throw new Error("The calendar subscription URL is invalid.");
      }

      if (statusMessage) {
        statusMessage.textContent =
          "Opening your calendar application. Confirm the subscription when prompted.";
      }

      window.location.href = subscriptionUrl;
    } catch (error) {
      console.error("Calendar subscription error:", error);

      if (statusMessage && error?.message !== "Authentication required.") {
        statusMessage.textContent =
          error?.message ?? "Could not open the calendar subscription.";
      }
    } finally {
      window.setTimeout(() => {
        subscribeButton.disabled = false;
        subscribeButton.textContent = originalText;
      }, 1200);
    }
  }
})();
