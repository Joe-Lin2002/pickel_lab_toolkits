"use strict";

const AUTH_API_URL = "/api/auth";

const loginView = document.querySelector("#login-view");
const homeView = document.querySelector("#home-view");
const loginForm = document.querySelector("#login-form");
const accessCodeInput = document.querySelector("#access-code");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-button");
const togglePasswordButton = document.querySelector("#toggle-password");

initialize();

async function initialize() {
  attachEventListeners();
  setLoginBusy(true);

  const authenticated = await checkExistingSession();

  setLoginBusy(false);

  if (authenticated) {
    showHomepage();
  } else {
    showLogin();
  }
}

function attachEventListeners() {
  loginForm.addEventListener("submit", handleLogin);
  togglePasswordButton.addEventListener("click", togglePasswordVisibility);
}

async function checkExistingSession() {
  try {
    const response = await fetch(AUTH_API_URL, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) return false;

    const payload = await readJson(response);
    return payload.authenticated === true;
  } catch (error) {
    console.error("Session check failed:", error);
    loginError.textContent = "Could not connect to the authentication server.";
    return false;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.textContent = "";

  const accessCode = accessCodeInput.value.trim();

  if (!accessCode) {
    loginError.textContent = "Please enter the access code.";
    accessCodeInput.focus();
    return;
  }

  setLoginBusy(true);

  try {
    const response = await fetch(AUTH_API_URL, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accessCode }),
    });

    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(payload.error ?? "Authentication failed.");
    }

    accessCodeInput.value = "";

    const returnUrl = new URL(window.location.href).searchParams.get("return");
    if (returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//")) {
      window.location.replace(returnUrl);
      return;
    }

    showHomepage();
  } catch (error) {
    console.error("Login failed:", error);
    loginError.textContent = error?.message ?? "Could not sign in.";
    accessCodeInput.select();
  } finally {
    setLoginBusy(false);
  }
}

function showHomepage() {
  loginView.classList.add("hidden");
  homeView.classList.remove("hidden");
  loginError.textContent = "";
}

function showLogin() {
  homeView.classList.add("hidden");
  loginView.classList.remove("hidden");
  accessCodeInput.value = "";

  window.setTimeout(() => {
    accessCodeInput.focus();
  }, 0);
}

function togglePasswordVisibility() {
  const isVisible = accessCodeInput.type === "text";
  accessCodeInput.type = isVisible ? "password" : "text";
  togglePasswordButton.textContent = isVisible ? "Show" : "Hide";
  togglePasswordButton.setAttribute(
    "aria-label",
    isVisible ? "Show access code" : "Hide access code"
  );
  accessCodeInput.focus();
}

function setLoginBusy(isBusy) {
  accessCodeInput.disabled = isBusy;
  loginButton.disabled = isBusy;
  togglePasswordButton.disabled = isBusy;
  loginButton.textContent = isBusy ? "Checking..." : "Continue";
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
