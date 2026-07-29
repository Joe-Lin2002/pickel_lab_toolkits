"use strict";

const PICKEL_AUTH_URL =
  "/api/auth";

let pickelAuthResolved =
  false;

let pickelAuthenticated =
  false;

async function checkPickelAuthentication() {
  try {
    const response =
      await fetch(
        PICKEL_AUTH_URL,
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
      await readAuthJson(
        response
      );

    return (
      payload.authenticated ===
      true
    );
  } catch (error) {
    console.error(
      "Authentication check failed:",
      error
    );

    return false;
  }
}

async function requirePickelAuthentication() {
  if (pickelAuthResolved) {
    if (!pickelAuthenticated) {
      redirectToHomepage();
    }

    return pickelAuthenticated;
  }

  pickelAuthenticated =
    await checkPickelAuthentication();

  pickelAuthResolved =
    true;

  if (!pickelAuthenticated) {
    redirectToHomepage();

    return false;
  }

  document.documentElement
    .classList
    .add(
      "authenticated"
    );

  return true;
}

async function pickelAuthenticatedFetch(
  url,
  options = {}
) {
  const response =
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

  if (
    response.status === 401
  ) {
    pickelAuthenticated =
      false;

    pickelAuthResolved =
      true;

    redirectToHomepage();

    throw new Error(
      "Authentication required."
    );
  }

  return response;
}

function redirectToHomepage() {
  const returnPath =
    window.location.pathname +
    window.location.search;

  const target =
    new URL(
      "/",
      window.location.origin
    );

  target.searchParams.set(
    "return",
    returnPath
  );

  window.location.replace(
    target.toString()
  );
}

async function readAuthJson(
  response
) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

window.pickelAuth = {
  requireAuth:
    requirePickelAuthentication,

  fetch:
    pickelAuthenticatedFetch,
};