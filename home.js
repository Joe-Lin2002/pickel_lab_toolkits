"use strict";

const AUTH_API_URL = "/api/auth";
const RECAPTCHA_SCRIPT_URL = "https://www.google.com/recaptcha/api.js?render=explicit";

const loginView = document.querySelector("#login-view");
const homeView = document.querySelector("#home-view");
const loginForm = document.querySelector("#login-form");
const accessCodeInput = document.querySelector("#access-code");
const loginError = document.querySelector("#login-error");
const loginButton = document.querySelector("#login-button");
const togglePasswordButton = document.querySelector("#toggle-password");
const recaptchaSection = document.querySelector("#recaptcha-section");
const recaptchaWidget = document.querySelector("#recaptcha-widget");
const recaptchaStatus = document.querySelector("#recaptcha-status");

let recaptchaSiteKey = "";
let recaptchaWidgetId = null;
let recaptchaToken = "";
let recaptchaConfigured = false;

initialize();

async function initialize() {
  attachEventListeners();
  setLoginBusy(true);

  const session = await checkExistingSession();

  if (session.authenticated) {
    setLoginBusy(false);
    showHomepage();
    return;
  }

  recaptchaSiteKey = session.recaptchaSiteKey;
  recaptchaConfigured = session.recaptchaConfigured;

  if (recaptchaConfigured && recaptchaSiteKey) {
    try {
      await initializeRecaptcha();
    } catch (error) {
      console.error("reCAPTCHA initialization failed:", error);
      loginError.textContent = "Could not load human verification. Please refresh the page.";
    }
  } else {
    loginError.textContent = "Human verification is not configured.";
  }

  setLoginBusy(false);
  showLogin();
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

    if (!response.ok) {
      return {
        authenticated: false,
        recaptchaSiteKey: "",
        recaptchaConfigured: false,
      };
    }

    const payload = await readJson(response);

    return {
      authenticated: payload.authenticated === true,
      recaptchaSiteKey:
        typeof payload.recaptchaSiteKey === "string"
          ? payload.recaptchaSiteKey
          : "",
      recaptchaConfigured:
        payload.recaptchaConfigured === true,
    };
  } catch (error) {
    console.error("Session check failed:", error);
    loginError.textContent = "Could not connect to the authentication server.";

    return {
      authenticated: false,
      recaptchaSiteKey: "",
      recaptchaConfigured: false,
    };
  }
}

async function initializeRecaptcha() {
  await loadRecaptchaScript();

  if (!window.grecaptcha || typeof window.grecaptcha.render !== "function") {
    throw new Error("Google reCAPTCHA did not initialize.");
  }

  recaptchaSection.classList.remove("hidden");

  recaptchaWidgetId = window.grecaptcha.render(recaptchaWidget, {
    sitekey: recaptchaSiteKey,
    callback: token => {
      recaptchaToken = token;
      recaptchaStatus.textContent = "Verification complete.";
      loginError.textContent = "";
      updateLoginButtonState();
    },
    "expired-callback": () => {
      recaptchaToken = "";
      recaptchaStatus.textContent = "Verification expired. Please verify again.";
      updateLoginButtonState();
    },
    "error-callback": () => {
      recaptchaToken = "";
      recaptchaStatus.textContent = "Verification could not be completed. Please try again.";
      updateLoginButtonState();
    },
  });

  updateLoginButtonState();
}

function loadRecaptchaScript() {
  if (window.grecaptcha) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RECAPTCHA_SCRIPT_URL}"]`);

    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = RECAPTCHA_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load Google reCAPTCHA."));
    document.head.appendChild(script);
  });
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

  if (!recaptchaConfigured || !recaptchaToken) {
    loginError.textContent = "Please complete the human verification.";
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
      body: JSON.stringify({
        accessCode,
        recaptchaToken,
      }),
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
    resetRecaptcha();
  } finally {
    setLoginBusy(false);
  }
}

function resetRecaptcha() {
  recaptchaToken = "";

  if (
    window.grecaptcha &&
    typeof window.grecaptcha.reset === "function" &&
    recaptchaWidgetId !== null
  ) {
    window.grecaptcha.reset(recaptchaWidgetId);
  }

  if (recaptchaConfigured) {
    recaptchaStatus.textContent = "Complete the verification before continuing.";
  }

  updateLoginButtonState();
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
  togglePasswordButton.disabled = isBusy;
  loginButton.dataset.busy = isBusy ? "true" : "false";
  loginButton.textContent = isBusy ? "Checking..." : "Continue";
  updateLoginButtonState();
}

function updateLoginButtonState() {
  const isBusy = loginButton.dataset.busy === "true";
  loginButton.disabled =
    isBusy ||
    !recaptchaConfigured ||
    !recaptchaToken;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
