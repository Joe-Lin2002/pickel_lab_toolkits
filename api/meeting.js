import crypto from "node:crypto";
import IcalExpander from "ical-expander";

/* =========================================================
   Configuration
   ========================================================= */

const COOKIE_NAME =
  "pickel_lab_session";

const SESSION_PURPOSE =
  "pickel-lab-schedule";

const sessionSecret =
  process.env.SESSION_SECRET;

const ICS_URL =
  process.env.MEETING_ICS_URL;

/* =========================================================
   Main handler
   ========================================================= */

export default async function handler(
  request,
  response
) {
  setSecurityHeaders(response);

  if (request.method !== "GET") {
    response.setHeader(
      "Allow",
      "GET"
    );

    return response
      .status(405)
      .json({
        error:
          "Method not allowed.",
      });
  }

  if (
    !SESSION_PURPOSE ||
    !sessionSecret
  ) {
    return response
      .status(500)
      .json({
        error:
          "Authentication service is not configured.",
      });
  }

  if (!ICS_URL) {
    return response
      .status(500)
      .json({
        error:
          "Meeting calendar is not configured.",
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

  try {
    const start =
      parseDateParameter(
        request.query.start
      );

    const end =
      parseDateParameter(
        request.query.end
      );

    if (
      !start ||
      !end ||
      start >= end
    ) {
      return response
        .status(400)
        .json({
          error:
            "Invalid date range.",
        });
    }

    /*
      Prevent clients from requesting unreasonably huge
      recurrence-expansion ranges.
    */

    const maximumRangeMs =
      180 *
      24 *
      60 *
      60 *
      1000;

    if (
      end.getTime() -
        start.getTime() >
      maximumRangeMs
    ) {
      return response
        .status(400)
        .json({
          error:
            "Requested date range is too large.",
        });
    }

    const icsResponse =
      await fetch(
        ICS_URL,
        {
          method: "GET",

          headers: {
            "Accept":
              "text/calendar, text/plain;q=0.9, */*;q=0.8",

            "User-Agent":
              "Pickel-Lab-Meeting-Schedule/1.0",
          },

          cache:
            "no-store",
        }
      );

    if (!icsResponse.ok) {
      console.error(
        "ICS request failed:",
        icsResponse.status,
        icsResponse.statusText
      );

      return response
        .status(502)
        .json({
          error:
            "Could not retrieve the meeting calendar.",
        });
    }

    const icsText =
      await icsResponse.text();

    if (!icsText.includes(
      "BEGIN:VCALENDAR"
    )) {
      console.error(
        "Outlook did not return a valid ICS calendar."
      );

      return response
        .status(502)
        .json({
          error:
            "The meeting calendar returned an invalid response.",
        });
    }

    const events =
      expandCalendarEvents(
        icsText,
        start,
        end
      );

    return response
      .status(200)
      .json({
        events,

        fetched_at:
          new Date()
            .toISOString(),

        range: {
          start:
            start.toISOString(),

          end:
            end.toISOString(),
        },
      });
  } catch (error) {
    console.error(
      "Meeting calendar error:",
      error
    );

    return response
      .status(500)
      .json({
        error:
          "Could not load the meeting schedule.",
      });
  }
}

/* =========================================================
   ICS expansion
   ========================================================= */

function expandCalendarEvents(
  icsText,
  start,
  end
) {
  const expander =
    new IcalExpander({
      ics:
        icsText,

      maxIterations:
        2000,
    });

  const expanded =
    expander.between(
      start,
      end
    );

  const result = [];

  /*
    Non-recurring events
  */

  for (
    const event
    of expanded.events ?? []
  ) {
    const normalized =
      normalizeEvent(
        event,
        null
      );

    if (normalized) {
      result.push(
        normalized
      );
    }
  }

  /*
    Recurring-event occurrences
  */

  for (
    const occurrence
    of expanded.occurrences ?? []
  ) {
    const normalized =
      normalizeEvent(
        occurrence.item,
        occurrence
      );

    if (normalized) {
      result.push(
        normalized
      );
    }
  }

  result.sort(
    (first, second) =>
      new Date(
        first.start
      ) -
      new Date(
        second.start
      )
  );

  return result;
}

function normalizeEvent(
  item,
  occurrence
) {
  if (!item) {
    return null;
  }

  const startDate =
    occurrence?.startDate
      ? occurrence
          .startDate
          .toJSDate()
      : item.startDate
        ? item
            .startDate
            .toJSDate()
        : null;

  const endDate =
    occurrence?.endDate
      ? occurrence
          .endDate
          .toJSDate()
      : item.endDate
        ? item
            .endDate
            .toJSDate()
        : null;

  if (
    !(startDate instanceof Date) ||
    !(endDate instanceof Date) ||
    Number.isNaN(
      startDate.getTime()
    ) ||
    Number.isNaN(
      endDate.getTime()
    )
  ) {
    return null;
  }

  const allDay =
    Boolean(
      (
        occurrence?.startDate ??
        item.startDate
      )?.isDate
    );

  const uid =
    String(
      item.uid ??
      ""
    );

  const recurrenceId =
    occurrence
      ? startDate
          .toISOString()
      : "";

  return {
    id:
      `${uid}|${recurrenceId}`,

    uid,

    title:
      cleanText(
        item.summary ??
        "Untitled meeting"
      ),

    location:
      cleanText(
        item.location ??
        ""
      ),

    description:
      cleanText(
        item.description ??
        ""
      ),

    start:
      startDate
        .toISOString(),

    end:
      endDate
        .toISOString(),

    all_day:
      allDay,

    recurring:
      Boolean(
        item.isRecurring?.()
      ),
  };
}

function cleanText(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /\r\n/g,
      "\n"
    )
    .trim();
}

/* =========================================================
   Date parsing
   ========================================================= */

function parseDateParameter(
  value
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

/* =========================================================
   Authentication
   ========================================================= */

function verifyRequestSession(
  request
) {
  const cookies =
    parseCookies(
      request.headers.cookie ??
      ""
    );

  return verifySessionToken(
    cookies[
      COOKIE_NAME
    ]
  );
}

function verifySessionToken(
  token
) {
  if (
    typeof token !==
    "string"
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
          Date.now() /
          1000
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

  return crypto
    .timingSafeEqual(
      firstBuffer,
      secondBuffer
    );
}

/* =========================================================
   Headers
   ========================================================= */

function setSecurityHeaders(
  response
) {
  response.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate"
  );

  response.setHeader(
    "Pragma",
    "no-cache"
  );

  response.setHeader(
    "Expires",
    "0"
  );

  response.setHeader(
    "X-Content-Type-Options",
    "nosniff"
  );
}