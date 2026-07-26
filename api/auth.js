import crypto from "node:crypto";

/* =========================================================
   Configuration
   ========================================================= */

const COOKIE_NAME = "pickel_lab_session";

const SESSION_DURATION_SECONDS =
  90 * 24 * 60 * 60;

const labAccessCode =
  process.env.LAB_ACCESS_CODE;

const sessionSecret =
  process.env.SESSION_SECRET;

/* =========================================================
   Main Vercel Function
   ========================================================= */

export default async function handler(
  request,
  response
) {
  setSecurityHeaders(response);

  if (
    !labAccessCode ||
    !sessionSecret
  ) {
    console.error(
      "LAB_ACCESS_CODE or SESSION_SECRET is missing."
    );

    return sendJson(
      response,
      500,
      {
        error:
          "Authentication service is not configured.",
      }
    );
  }

  if (request.method === "OPTIONS") {
    return response
      .status(204)
      .end();
  }

  if (request.method === "GET") {
    return handleStatus(
      request,
      response
    );
  }

  if (request.method === "POST") {
    return handleLogin(
      request,
      response
    );
  }

  if (request.method === "DELETE") {
    return handleLogout(
      response
    );
  }

  response.setHeader(
    "Allow",
    "GET, POST, DELETE, OPTIONS"
  );

  return sendJson(
    response,
    405,
    {
      error: "Method not allowed.",
    }
  );
}

/* =========================================================
   GET /api/auth

   Check whether the device already has a valid session.
   ========================================================= */

function handleStatus(
  request,
  response
) {
  const authenticated =
    verifyRequestSession(
      request
    );

  return sendJson(
    response,
    200,
    {
      authenticated,
    }
  );
}

/* =========================================================
   POST /api/auth

   Body:
   {
     "accessCode": "..."
   }
   ========================================================= */

function handleLogin(
  request,
  response
) {
  const suppliedCode =
    typeof request.body?.accessCode ===
    "string"
      ? request.body.accessCode
      : "";

  if (
    !safeTextEqual(
      suppliedCode,
      labAccessCode
    )
  ) {
    /*
      A generic response avoids revealing
      additional authentication details.
    */

    return sendJson(
      response,
      401,
      {
        error:
          "Incorrect access code.",
      }
    );
  }

  const sessionToken =
    createSessionToken();

  response.setHeader(
    "Set-Cookie",
    buildSessionCookie(
      sessionToken
    )
  );

  return sendJson(
    response,
    200,
    {
      authenticated: true,
    }
  );
}

/* =========================================================
   DELETE /api/auth

   Clear the remembered-device cookie.
   ========================================================= */

function handleLogout(
  response
) {
  response.setHeader(
    "Set-Cookie",
    buildExpiredCookie()
  );

  return sendJson(
    response,
    200,
    {
      authenticated: false,
    }
  );
}

/* =========================================================
   Session token

   Format:
   base64url(payload).base64url(signature)

   Payload:
   {
     "exp": UNIX timestamp,
     "purpose": "pickel-lab-schedule"
   }
   ========================================================= */

function createSessionToken() {
  const payload = {
    exp:
      Math.floor(
        Date.now() / 1000
      ) +
      SESSION_DURATION_SECONDS,

    purpose:
      "pickel-lab-schedule",
  };

  const encodedPayload =
    base64UrlEncode(
      JSON.stringify(payload)
    );

  const signature =
    signValue(
      encodedPayload
    );

  return (
    `${encodedPayload}.` +
    `${signature}`
  );
}

function verifySessionToken(
  token
) {
  if (
    typeof token !== "string" ||
    token.length > 2048
  ) {
    return false;
  }

  const parts =
    token.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [
    encodedPayload,
    suppliedSignature,
  ] = parts;

  const expectedSignature =
    signValue(
      encodedPayload
    );

  if (
    !safeTextEqual(
      suppliedSignature,
      expectedSignature
    )
  ) {
    return false;
  }

  let payload;

  try {
    payload =
      JSON.parse(
        base64UrlDecode(
          encodedPayload
        )
      );
  } catch {
    return false;
  }

  if (
    payload?.purpose !==
      "pickel-lab-schedule" ||
    !Number.isInteger(
      payload?.exp
    )
  ) {
    return false;
  }

  const currentTime =
    Math.floor(
      Date.now() / 1000
    );

  return payload.exp >
    currentTime;
}

function signValue(value) {
  return crypto
    .createHmac(
      "sha256",
      sessionSecret
    )
    .update(value)
    .digest("base64url");
}

/* =========================================================
   Cookie handling
   ========================================================= */

function buildSessionCookie(
  token
) {
  return [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
  ].join("; ");
}

function buildExpiredCookie() {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=None",
  ].join("; ");
}

function verifyRequestSession(
  request
) {
  const cookies =
    parseCookies(
      request.headers.cookie ?? ""
    );

  return verifySessionToken(
    cookies[COOKIE_NAME]
  );
}

function parseCookies(
  cookieHeader
) {
  const cookies = {};

  if (
    typeof cookieHeader !==
      "string" ||
    !cookieHeader
  ) {
    return cookies;
  }

  for (
    const section
    of cookieHeader.split(";")
  ) {
    const separatorIndex =
      section.indexOf("=");

    if (
      separatorIndex < 0
    ) {
      continue;
    }

    const name =
      section
        .slice(
          0,
          separatorIndex
        )
        .trim();

    const value =
      section
        .slice(
          separatorIndex + 1
        )
        .trim();

    if (name) {
      cookies[name] =
        value;
    }
  }

  return cookies;
}

/* =========================================================
   Timing-safe comparison
   ========================================================= */

function safeTextEqual(
  firstValue,
  secondValue
) {
  const firstBuffer =
    Buffer.from(
      String(firstValue),
      "utf8"
    );

  const secondBuffer =
    Buffer.from(
      String(secondValue),
      "utf8"
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    /*
      Perform a dummy comparison so the failure
      path is less timing-dependent.
    */

    const dummy =
      Buffer.alloc(
        firstBuffer.length
      );

    crypto.timingSafeEqual(
      firstBuffer,
      dummy
    );

    return false;
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

/* =========================================================
   Encoding helpers
   ========================================================= */

function base64UrlEncode(
  value
) {
  return Buffer
    .from(
      value,
      "utf8"
    )
    .toString(
      "base64url"
    );
}

function base64UrlDecode(
  value
) {
  return Buffer
    .from(
      value,
      "base64url"
    )
    .toString(
      "utf8"
    );
}

/* =========================================================
   Response helpers
   ========================================================= */

function sendJson(
  response,
  status,
  payload
) {
  return response
    .status(status)
    .json(payload);
}

function setSecurityHeaders(
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store"
  );

  response.setHeader(
    "Pragma",
    "no-cache"
  );

  response.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );

  response.setHeader(
    "Referrer-Policy",
    "no-referrer"
  );
}