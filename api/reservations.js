import crypto from "node:crypto";
import {
  createClient,
} from "@supabase/supabase-js";

/* =========================================================
   Environment configuration
   ========================================================= */

const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

const sessionSecret =
  process.env.SESSION_SECRET;

const COOKIE_NAME =
  "pickel_lab_session";

/* =========================================================
   Supabase server client
   ========================================================= */

let database = null;

if (
  supabaseUrl &&
  supabaseSecretKey
) {
  database =
    createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
}

/* =========================================================
   Reservation configuration
   ========================================================= */

const VALID_RESOURCE_IDS =
  new Set([1, 2, 3]);

const MAX_NAME_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;

const OPENING_HOUR = 7;
const CLOSING_HOUR = 23;

const MINIMUM_DURATION_MINUTES =
  15;

const MAXIMUM_DURATION_MINUTES =
  (
    CLOSING_HOUR -
    OPENING_HOUR
  ) * 60;

/* =========================================================
   Main Vercel Function
   ========================================================= */

export default async function handler(
  request,
  response
) {
  setSecurityHeaders(response);

  if (request.method === "OPTIONS") {
    return response
      .status(204)
      .end();
  }

  if (
    !database ||
    !sessionSecret
  ) {
    console.error(
      "Required server environment variables are missing."
    );

    return sendError(
      response,
      500,
      "Reservation service is not configured."
    );
  }

  if (
    !verifyRequestSession(
      request
    )
  ) {
    return sendError(
      response,
      401,
      "Authentication required."
    );
  }

  try {
    switch (request.method) {
      case "GET":
        return await handleGet(
          request,
          response
        );

      case "POST":
        return await handlePost(
          request,
          response
        );

      case "PUT":
        return await handlePut(
          request,
          response
        );

      case "DELETE":
        return await handleDelete(
          request,
          response
        );

      default:
        response.setHeader(
          "Allow",
          "GET, POST, PUT, DELETE, OPTIONS"
        );

        return sendError(
          response,
          405,
          "Method not allowed."
        );
    }
  } catch (error) {
    console.error(
      "Reservation API error:",
      error
    );

    return sendError(
      response,
      500,
      "The server could not complete the request."
    );
  }
}

/* =========================================================
   GET reservations
   ========================================================= */

async function handleGet(
  request,
  response
) {
  const startValue =
    getQueryValue(
      request.query?.start
    );

  const endValue =
    getQueryValue(
      request.query?.end
    );

  const dayStart =
    new Date(startValue);

  const dayEnd =
    new Date(endValue);

  if (
    Number.isNaN(
      dayStart.getTime()
    ) ||
    Number.isNaN(
      dayEnd.getTime()
    ) ||
    dayStart >= dayEnd
  ) {
    return sendError(
      response,
      400,
      "Invalid date boundaries."
    );
  }

  /*
    Limit a single query to a small date range.
  */

  const rangeMilliseconds =
    dayEnd.getTime() -
    dayStart.getTime();

  if (
    rangeMilliseconds >
    48 * 60 * 60 * 1000
  ) {
    return sendError(
      response,
      400,
      "The requested date range is too large."
    );
  }

  const {
    data,
    error,
  } =
    await database
      .from("reservations")
      .select(
        [
          "id",
          "resource_id",
          "person_name",
          "title",
          "start_time",
          "end_time",
          "created_at",
        ].join(",")
      )
      .lt(
        "start_time",
        dayEnd.toISOString()
      )
      .gt(
        "end_time",
        dayStart.toISOString()
      )
      .order(
        "start_time",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(
      "Supabase read error:",
      error
    );

    return sendError(
      response,
      500,
      "Could not load reservations."
    );
  }

  return response
    .status(200)
    .json({
      reservations:
        data ?? [],
    });
}

/* =========================================================
   POST reservation
   ========================================================= */

async function handlePost(
  request,
  response
) {
  const validation =
    validateReservationBody(
      request.body
    );

  if (!validation.ok) {
    return sendError(
      response,
      400,
      validation.error
    );
  }

  const reservation =
    validation.value;

  const conflict =
    await findConflict(
      reservation,
      null
    );

  if (conflict.error) {
    console.error(
      "Conflict check error:",
      conflict.error
    );

    return sendError(
      response,
      500,
      "Could not verify availability."
    );
  }

  if (conflict.exists) {
    return sendError(
      response,
      409,
      "This equipment is already reserved during that time."
    );
  }

  const {
    data,
    error,
  } =
    await database
      .from("reservations")
      .insert(reservation)
      .select(
        [
          "id",
          "resource_id",
          "person_name",
          "title",
          "start_time",
          "end_time",
          "created_at",
        ].join(",")
      )
      .single();

  if (error) {
    console.error(
      "Supabase insert error:",
      error
    );

    if (
      error.code === "23P01"
    ) {
      return sendError(
        response,
        409,
        "This equipment is already reserved during that time."
      );
    }

    return sendError(
      response,
      500,
      "Could not create the reservation."
    );
  }

  return response
    .status(201)
    .json({
      reservation: data,
    });
}

/* =========================================================
   PUT reservation
   ========================================================= */

async function handlePut(
  request,
  response
) {
  const reservationId =
    parsePositiveInteger(
      request.body?.id
    );

  if (!reservationId) {
    return sendError(
      response,
      400,
      "A valid reservation ID is required."
    );
  }

  const validation =
    validateReservationBody(
      request.body
    );

  if (!validation.ok) {
    return sendError(
      response,
      400,
      validation.error
    );
  }

  const reservation =
    validation.value;

  const conflict =
    await findConflict(
      reservation,
      reservationId
    );

  if (conflict.error) {
    console.error(
      "Conflict check error:",
      conflict.error
    );

    return sendError(
      response,
      500,
      "Could not verify availability."
    );
  }

  if (conflict.exists) {
    return sendError(
      response,
      409,
      "This equipment is already reserved during that time."
    );
  }

  const {
    data,
    error,
  } =
    await database
      .from("reservations")
      .update(reservation)
      .eq(
        "id",
        reservationId
      )
      .select(
        [
          "id",
          "resource_id",
          "person_name",
          "title",
          "start_time",
          "end_time",
          "created_at",
        ].join(",")
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Supabase update error:",
      error
    );

    if (
      error.code === "23P01"
    ) {
      return sendError(
        response,
        409,
        "This equipment is already reserved during that time."
      );
    }

    return sendError(
      response,
      500,
      "Could not update the reservation."
    );
  }

  if (!data) {
    return sendError(
      response,
      404,
      "Reservation not found."
    );
  }

  return response
    .status(200)
    .json({
      reservation: data,
    });
}

/* =========================================================
   DELETE reservation
   ========================================================= */

async function handleDelete(
  request,
  response
) {
  const reservationId =
    parsePositiveInteger(
      getQueryValue(
        request.query?.id
      )
    );

  if (!reservationId) {
    return sendError(
      response,
      400,
      "A valid reservation ID is required."
    );
  }

  const {
    data,
    error,
  } =
    await database
      .from("reservations")
      .delete()
      .eq(
        "id",
        reservationId
      )
      .select("id")
      .maybeSingle();

  if (error) {
    console.error(
      "Supabase delete error:",
      error
    );

    return sendError(
      response,
      500,
      "Could not delete the reservation."
    );
  }

  if (!data) {
    return sendError(
      response,
      404,
      "Reservation not found."
    );
  }

  return response
    .status(200)
    .json({
      success: true,
    });
}

/* =========================================================
   Conflict check
   ========================================================= */

async function findConflict(
  reservation,
  excludedId
) {
  let query =
    database
      .from("reservations")
      .select(
        "id",
        {
          count: "exact",
          head: true,
        }
      )
      .eq(
        "resource_id",
        reservation.resource_id
      )
      .lt(
        "start_time",
        reservation.end_time
      )
      .gt(
        "end_time",
        reservation.start_time
      );

  if (excludedId) {
    query =
      query.neq(
        "id",
        excludedId
      );
  }

  const {
    count,
    error,
  } =
    await query;

  return {
    exists:
      !error &&
      Number(count) > 0,

    error,
  };
}

/* =========================================================
   Reservation validation
   ========================================================= */

function validateReservationBody(
  body
) {
  if (
    !body ||
    typeof body !== "object"
  ) {
    return invalid(
      "Invalid request body."
    );
  }

  const resourceId =
    parsePositiveInteger(
      body.resource_id
    );

  if (
    !resourceId ||
    !VALID_RESOURCE_IDS.has(
      resourceId
    )
  ) {
    return invalid(
      "Invalid equipment."
    );
  }

  const personName =
    normalizeText(
      body.person_name
    );

  if (
    personName.length < 1 ||
    personName.length >
      MAX_NAME_LENGTH
  ) {
    return invalid(
      `Name must contain between 1 and ${MAX_NAME_LENGTH} characters.`
    );
  }

  const title =
    normalizeText(
      body.title
    );

  if (
    title.length < 1 ||
    title.length >
      MAX_TITLE_LENGTH
  ) {
    return invalid(
      `Description must contain between 1 and ${MAX_TITLE_LENGTH} characters.`
    );
  }

  if (
    containsMarkup(
      personName
    ) ||
    containsMarkup(title)
  ) {
    return invalid(
      "HTML markup is not allowed."
    );
  }

  const start =
    new Date(
      body.start_time
    );

  const end =
    new Date(
      body.end_time
    );

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return invalid(
      "Invalid reservation time."
    );
  }

  if (start >= end) {
    return invalid(
      "End time must be after start time."
    );
  }

  const durationMinutes =
    (
      end.getTime() -
      start.getTime()
    ) /
    60000;

  if (
    durationMinutes <
      MINIMUM_DURATION_MINUTES ||
    durationMinutes >
      MAXIMUM_DURATION_MINUTES
  ) {
    return invalid(
      "Invalid reservation duration."
    );
  }

  return {
    ok: true,

    value: {
      resource_id:
        resourceId,

      person_name:
        personName,

      title,

      start_time:
        start.toISOString(),

      end_time:
        end.toISOString(),
    },
  };
}

/* =========================================================
   Cookie verification
   ========================================================= */

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
    crypto
      .createHmac(
        "sha256",
        sessionSecret
      )
      .update(
        encodedPayload
      )
      .digest(
        "base64url"
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
        Buffer
          .from(
            encodedPayload,
            "base64url"
          )
          .toString("utf8")
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

  return payload.exp >
    Math.floor(
      Date.now() / 1000
    );
}

function parseCookies(
  cookieHeader
) {
  const result = {};

  for (
    const item
    of String(
      cookieHeader
    ).split(";")
  ) {
    const separatorIndex =
      item.indexOf("=");

    if (
      separatorIndex < 0
    ) {
      continue;
    }

    const name =
      item
        .slice(
          0,
          separatorIndex
        )
        .trim();

    const value =
      item
        .slice(
          separatorIndex + 1
        )
        .trim();

    if (name) {
      result[name] =
        value;
    }
  }

  return result;
}

function safeTextEqual(
  first,
  second
) {
  const firstBuffer =
    Buffer.from(
      String(first)
    );

  const secondBuffer =
    Buffer.from(
      String(second)
    );

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  );
}

/* =========================================================
   Utility functions
   ========================================================= */

function normalizeText(
  value
) {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function containsMarkup(
  value
) {
  return /[<>]/.test(
    value
  );
}

function parsePositiveInteger(
  value
) {
  const numberValue =
    Number(value);

  if (
    !Number.isInteger(
      numberValue
    ) ||
    numberValue < 1
  ) {
    return null;
  }

  return numberValue;
}

function getQueryValue(
  value
) {
  if (
    Array.isArray(value)
  ) {
    return value[0];
  }

  return value;
}

function invalid(error) {
  return {
    ok: false,
    error,
  };
}

function sendError(
  response,
  status,
  message
) {
  return response
    .status(status)
    .json({
      error: message,
    });
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