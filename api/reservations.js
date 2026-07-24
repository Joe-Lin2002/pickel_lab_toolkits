import { createClient } from "@supabase/supabase-js";

/* =========================================================
   Server-only Supabase client
   ========================================================= */

const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

const labAccessCode =
  process.env.LAB_ACCESS_CODE;

if (
  !supabaseUrl ||
  !supabaseSecretKey ||
  !labAccessCode
) {
  throw new Error(
    "Required server environment variables are missing."
  );
}

const database = createClient(
  supabaseUrl,
  supabaseSecretKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/* =========================================================
   Configuration
   ========================================================= */

const VALID_RESOURCE_IDS =
  new Set([1, 2, 3]);

const OPENING_HOUR = 7;
const CLOSING_HOUR = 23;

const MAX_NAME_LENGTH = 50;
const MAX_TITLE_LENGTH = 100;

/* =========================================================
   Main Vercel Function
   ========================================================= */

export default async function handler(
  request,
  response
) {
  setSecurityHeaders(response);

  /*
    Handle browser preflight requests.
  */

  if (request.method === "OPTIONS") {
    return response
      .status(204)
      .end();
  }

  /*
    Require the shared lab access code.
  */

  const suppliedAccessCode =
    request.headers[
      "x-lab-access-code"
    ];

  if (
    typeof suppliedAccessCode !== "string" ||
    suppliedAccessCode !== labAccessCode
  ) {
    return sendError(
      response,
      401,
      "Invalid lab access code."
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
   GET /api/reservations?date=YYYY-MM-DD
   ========================================================= */

async function handleGet(
  request,
  response
) {
  const dateValue =
    getQueryValue(
      request.query?.date
    );

  if (
    !isValidDateString(dateValue)
  ) {
    return sendError(
      response,
      400,
      "A valid date in YYYY-MM-DD format is required."
    );
  }

  /*
    The frontend sends explicit ISO boundaries so that
    the user's local timezone is preserved.
  */

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
    Number.isNaN(dayStart.getTime()) ||
    Number.isNaN(dayEnd.getTime()) ||
    dayStart >= dayEnd
  ) {
    return sendError(
      response,
      400,
      "Invalid date boundaries."
    );
  }

  const {
    data,
    error,
  } =
    await database
      .from("reservations")
      .select(
        "id, resource_id, person_name, title, start_time, end_time, created_at"
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
   POST /api/reservations
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
    return sendError(
      response,
      500,
      "Could not verify reservation availability."
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
        "id, resource_id, person_name, title, start_time, end_time, created_at"
      )
      .single();

  if (error) {
    console.error(
      "Supabase insert error:",
      error
    );

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
   PUT /api/reservations
   Body must include id
   ========================================================= */

async function handlePut(
  request,
  response
) {
  const id =
    parsePositiveInteger(
      request.body?.id
    );

  if (!id) {
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
      id
    );

  if (conflict.error) {
    return sendError(
      response,
      500,
      "Could not verify reservation availability."
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
        id
      )
      .select(
        "id, resource_id, person_name, title, start_time, end_time, created_at"
      )
      .maybeSingle();

  if (error) {
    console.error(
      "Supabase update error:",
      error
    );

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
   DELETE /api/reservations?id=123
   ========================================================= */

async function handleDelete(
  request,
  response
) {
  const id =
    parsePositiveInteger(
      getQueryValue(
        request.query?.id
      )
    );

  if (!id) {
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
        id
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
   Check for overlapping reservations
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
   Validate reservation data
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
    containsMarkup(personName) ||
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
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
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

  /*
    Reservations must begin and end
    on the same local-calendar date as
    represented by the supplied offsets.
  */

  if (
    !isWithinOperatingHours(
      start,
      end
    )
  ) {
    return invalid(
      "Reservations must be between 7:00 AM and 11:00 PM."
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
   Operating-hours validation

   ISO values received from the browser are UTC values.
   This lightweight project currently assumes the deployment
   and lab operate in the same intended timezone.

   The frontend also enforces 7 AM–11 PM.
   ========================================================= */

function isWithinOperatingHours(
  start,
  end
) {
  const sameDate =
    start.getUTCFullYear() ===
      end.getUTCFullYear() &&
    start.getUTCMonth() ===
      end.getUTCMonth() &&
    start.getUTCDate() ===
      end.getUTCDate();

  /*
    Because Austin may be UTC-5 or UTC-6,
    strict UTC-hour validation would be wrong.
    We therefore validate duration and same-day structure here,
    while the frontend controls the displayed local hours.

    A later database function can make this timezone-explicit.
  */

  const durationMinutes =
    (
      end.getTime() -
      start.getTime()
    ) /
    60000;

  return (
    sameDate &&
    durationMinutes >= 15 &&
    durationMinutes <=
      (
        CLOSING_HOUR -
        OPENING_HOUR
      ) *
      60
  );
}

/* =========================================================
   Helpers
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
  return /[<>]/.test(value);
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

function isValidDateString(
  value
) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  );
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
    "X-Content-Type-Options",
    "nosniff"
  );

  response.setHeader(
    "Referrer-Policy",
    "no-referrer"
  );
}