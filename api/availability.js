import crypto from "node:crypto";
import {
  createClient,
} from "@supabase/supabase-js";

const COOKIE_NAME =
  "pickel_lab_session";

const SESSION_PURPOSE =
  "pickel-lab-schedule";

const supabaseUrl =
  process.env.SUPABASE_URL;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY;

const sessionSecret =
  process.env.SESSION_SECRET;

const database =
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

const VALID_STATUSES =
  new Set([
    "green",
    "yellow",
    "red",
  ]);

export default async function handler(
  request,
  response
) {
  setSecurityHeaders(response);

  if (
    !supabaseUrl ||
    !supabaseSecretKey ||
    !sessionSecret
  ) {
    return response
      .status(500)
      .json({
        error:
          "Availability service is not configured.",
      });
  }

  if (
    !verifyRequestSession(
      request
    )
  ) {
    return response
      .status(401)
      .json({
        error:
          "Authentication required.",
      });
  }

  if (
    request.method === "GET"
  ) {
    return handleGet(
      response
    );
  }

  if (
    request.method === "POST"
  ) {
    return handleSave(
      request,
      response
    );
  }

  response.setHeader(
    "Allow",
    "GET, POST"
  );

  return response
    .status(405)
    .json({
      error:
        "Method not allowed.",
    });
}

async function handleGet(
  response
) {
  const {
    data,
    error,
  } =
    await database
      .from(
        "availability_slots"
      )
      .select(
        [
          "person_name",
          "weekday",
          "slot_index",
          "status",
          "updated_at",
        ].join(",")
      )
      .order(
        "person_name",
        {
          ascending: true,
        }
      );

  if (error) {
    console.error(error);

    return response
      .status(500)
      .json({
        error:
          "Could not load availability.",
      });
  }

  const slots =
    Array.isArray(data)
      ? data
      : [];

  const members =
    [
      ...new Set(
        slots.map(
          item =>
            item.person_name
        )
      ),
    ].sort(
      (first, second) =>
        first.localeCompare(
          second
        )
    );

  const memberUpdatedAt = {};

  let lastUpdatedAt = null;

  for (
    const slot
    of slots
  ) {
    if (!slot.updated_at) {
      continue;
    }

    const timestamp =
      new Date(
        slot.updated_at
      );

    if (
      Number.isNaN(
        timestamp.getTime()
      )
    ) {
      continue;
    }

    const currentMemberTime =
      memberUpdatedAt[
        slot.person_name
      ];

    if (
      !currentMemberTime ||
      timestamp >
        new Date(
          currentMemberTime
        )
    ) {
      memberUpdatedAt[
        slot.person_name
      ] =
        timestamp.toISOString();
    }

    if (
      !lastUpdatedAt ||
      timestamp >
        new Date(
          lastUpdatedAt
        )
    ) {
      lastUpdatedAt =
        timestamp.toISOString();
    }
  }

  return response
    .status(200)
    .json({
      members,
      slots,
      last_updated_at:
        lastUpdatedAt,
      member_updated_at:
        memberUpdatedAt,
    });
}

async function handleSave(
  request,
  response
) {
  const personName =
    normalizeName(
      request.body?.person_name
    );

  const slots =
    Array.isArray(
      request.body?.slots
    )
      ? request.body.slots
      : null;

  if (
    !personName ||
    personName.length > 50
  ) {
    return response
      .status(400)
      .json({
        error:
          "A valid name is required.",
      });
  }

  if (!slots) {
    return response
      .status(400)
      .json({
        error:
          "Invalid availability data.",
      });
  }

  const normalizedSlots = [];

  for (
    const slot
    of slots
  ) {
    const weekday =
      Number(
        slot.weekday
      );

    const slotIndex =
      Number(
        slot.slot_index
      );

    const status =
      slot.status;

    if (
      !Number.isInteger(
        weekday
      ) ||
      weekday < 1 ||
      weekday > 5 ||
      !Number.isInteger(
        slotIndex
      ) ||
      slotIndex < 0 ||
      slotIndex > 15 ||
      !VALID_STATUSES.has(
        status
      )
    ) {
      return response
        .status(400)
        .json({
          error:
            "Invalid availability slot.",
        });
    }

    normalizedSlots.push({
      person_name:
        personName,

      weekday,

      slot_index:
        slotIndex,

      status,

      updated_at:
        new Date()
          .toISOString(),
    });
  }

  const {
    error: deleteError,
  } =
    await database
      .from(
        "availability_slots"
      )
      .delete()
      .eq(
        "person_name",
        personName
      );

  if (deleteError) {
    console.error(
      deleteError
    );

    return response
      .status(500)
      .json({
        error:
          "Could not update availability.",
      });
  }

  if (
    normalizedSlots.length > 0
  ) {
    const {
      error: insertError,
    } =
      await database
        .from(
          "availability_slots"
        )
        .insert(
          normalizedSlots
        );

    if (insertError) {
      console.error(
        insertError
      );

      return response
        .status(500)
        .json({
          error:
            "Could not save availability.",
        });
    }
  }

  return response
    .status(200)
    .json({
      success: true,
    });
}

function normalizeName(
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
    )
    .replace(
      /[<>]/g,
      ""
    );
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

function verifySessionToken(
  token
) {
  if (
    typeof token !== "string"
  ) {
    return false;
  }

  const parts =
    token.split(".");

  if (
    parts.length !== 2
  ) {
    return false;
  }

  const [
    payloadText,
    suppliedSignature,
  ] = parts;

  const expectedSignature =
    crypto
      .createHmac(
        "sha256",
        sessionSecret
      )
      .update(
        payloadText
      )
      .digest(
        "base64url"
      );

  if (
    !safeEqual(
      suppliedSignature,
      expectedSignature
    )
  ) {
    return false;
  }

  try {
    const payload =
      JSON.parse(
        Buffer
          .from(
            payloadText,
            "base64url"
          )
          .toString(
            "utf8"
          )
      );

    return (
      payload.purpose ===
        SESSION_PURPOSE &&
      Number.isInteger(
        payload.exp
      ) &&
      payload.exp >
        Math.floor(
          Date.now() / 1000
        )
    );
  } catch {
    return false;
  }
}

function parseCookies(
  header
) {
  const result = {};

  for (
    const item
    of String(
      header
    ).split(";")
  ) {
    const separator =
      item.indexOf("=");

    if (
      separator < 0
    ) {
      continue;
    }

    const name =
      item
        .slice(
          0,
          separator
        )
        .trim();

    const value =
      item
        .slice(
          separator + 1
        )
        .trim();

    if (name) {
      result[name] =
        value;
    }
  }

  return result;
}

function safeEqual(
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
}