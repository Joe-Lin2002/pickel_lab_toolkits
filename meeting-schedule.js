import crypto from "node:crypto";
import ical from "node-ical";

/* =========================================================
   Configuration
   ========================================================= */

const COOKIE_NAME =
  "pickel_lab_session";

const SESSION_PURPOSE =
  "pickel-lab-schedule";

const SESSION_SECRET =
  process.env.SESSION_SECRET;

const ICS_URL =
  process.env.MEETING_ICS_URL;

/* =========================================================
   Main
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

  /* -------------------------------------------------------
     Environment
     ------------------------------------------------------- */

  if (!SESSION_SECRET) {
    console.error(
      "SESSION_SECRET is missing."
    );

    return response
      .status(500)
      .json({
        error:
          "Authentication service is not configured.",
      });
  }

  if (!ICS_URL) {
    console.error(
      "MEETING_ICS_URL is missing."
    );

    return response
      .status(500)
      .json({
        error:
          "Meeting calendar URL is not configured.",
      });
  }

  /* -------------------------------------------------------
     Authentication
     ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     Date range
     ------------------------------------------------------- */

  const start =
    parseDate(
      request.query.start
    );

  const end =
    parseDate(
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

  const maximumRange =
    180 *
    24 *
    60 *
    60 *
    1000;

  if (
    end.getTime() -
      start.getTime() >
    maximumRange
  ) {
    return response
      .status(400)
      .json({
        error:
          "Requested date range is too large.",
      });
  }

  /* -------------------------------------------------------
     Fetch Outlook ICS
     ------------------------------------------------------- */

  let icsText;

  try {
    const icsResponse =
      await fetch(
        ICS_URL,
        {
          method:
            "GET",

          headers: {
            Accept:
              "text/calendar,text/plain;q=0.9,*/*;q=0.8",

            "User-Agent":
              "Mozilla/5.0 Pickel-Lab-Schedule/1.0",
          },

          redirect:
            "follow",

          cache:
            "no-store",
        }
      );

    console.log(
      "Outlook ICS response:",
      icsResponse.status,
      icsResponse.statusText,
      icsResponse.headers.get(
        "content-type"
      )
    );

    if (!icsResponse.ok) {
      const responseText =
        await safeReadText(
          icsResponse
        );

      console.error(
        "Outlook calendar request failed.",
        {
          status:
            icsResponse.status,

          statusText:
            icsResponse.statusText,

          body:
            responseText
              .slice(
                0,
                500
              ),
        }
      );

      return response
        .status(502)
        .json({
          error:
            `Outlook calendar returned HTTP ${icsResponse.status}.`,
        });
    }

    icsText =
      await icsResponse.text();

  } catch (error) {
    console.error(
      "Could not fetch Outlook ICS:",
      error
    );

    return response
      .status(502)
      .json({
        error:
          "Could not connect to the Outlook calendar.",
      });
  }

  /* -------------------------------------------------------
     Basic validation
     ------------------------------------------------------- */

  if (
    !icsText ||
    !icsText.includes(
      "BEGIN:VCALENDAR"
    )
  ) {
    console.error(
      "Invalid ICS response:",
      icsText
        ?.slice(
          0,
          500
        )
    );

    return response
      .status(502)
      .json({
        error:
          "Outlook did not return a valid calendar.",
      });
  }

  console.log(
    "ICS downloaded successfully.",
    "Characters:",
    icsText.length
  );

  /* -------------------------------------------------------
     Parse ICS
     ------------------------------------------------------- */

  let parsedCalendar;

  try {
    parsedCalendar =
      ical.sync.parseICS(
        icsText
      );
  } catch (error) {
    console.error(
      "ICS parsing failed:",
      error
    );

    return response
      .status(500)
      .json({
        error:
          "The Outlook calendar was downloaded, but could not be parsed.",
      });
  }

  /* -------------------------------------------------------
     Expand events
     ------------------------------------------------------- */

  let events;

  try {
    events =
      buildEvents(
        parsedCalendar,
        start,
        end
      );
  } catch (error) {
    console.error(
      "Event processing failed:",
      error
    );

    return response
      .status(500)
      .json({
        error:
          "The calendar was parsed, but its events could not be processed.",
      });
  }

  /* -------------------------------------------------------
     Response
     ------------------------------------------------------- */

  return response
    .status(200)
    .json({
      events,

      fetched_at:
        new Date()
          .toISOString(),

      source_updated:
        true,

      range: {
        start:
          start.toISOString(),

        end:
          end.toISOString(),
      },
    });
}

/* =========================================================
   Build event list
   ========================================================= */

function buildEvents(
  calendar,
  rangeStart,
  rangeEnd
) {
  const result = [];

  for (
    const item
    of Object.values(
      calendar
    )
  ) {
    if (
      !item ||
      item.type !==
        "VEVENT"
    ) {
      continue;
    }

    /*
      Recurring event
    */

    if (
      item.rrule &&
      typeof item.rrule.between ===
        "function"
    ) {
      addRecurringEvent(
        result,
        item,
        rangeStart,
        rangeEnd
      );

      continue;
    }

    /*
      Normal event
    */

    const normalized =
      normalizeNormalEvent(
        item
      );

    if (
      normalized &&
      eventIntersectsRange(
        normalized,
        rangeStart,
        rangeEnd
      )
    ) {
      result.push(
        normalized
      );
    }
  }

  result.sort(
    (first, second) =>
      new Date(
        first.start
      ).getTime() -
      new Date(
        second.start
      ).getTime()
  );

  return result;
}

/* =========================================================
   Normal event
   ========================================================= */

function normalizeNormalEvent(
  event
) {
  const start =
    toValidDate(
      event.start
    );

  if (!start) {
    return null;
  }

  let end =
    toValidDate(
      event.end
    );

  if (!end) {
    end =
      new Date(
        start.getTime() +
        60 *
        60 *
        1000
      );
  }

  return {
    id:
      String(
        event.uid ??
        `${start.toISOString()}-${event.summary ?? ""}`
      ),

    uid:
      String(
        event.uid ??
        ""
      ),

    title:
      cleanText(
        event.summary ??
        "Untitled meeting"
      ),

    location:
      cleanText(
        getTextValue(
          event.location
        )
      ),

    description:
      cleanText(
        getTextValue(
          event.description
        )
      ),

    start:
      start.toISOString(),

    end:
      end.toISOString(),

    all_day:
      isAllDayEvent(
        event,
        start,
        end
      ),

    recurring:
      false,
  };
}

/* =========================================================
   Recurring events
   ========================================================= */

function addRecurringEvent(
  result,
  event,
  rangeStart,
  rangeEnd
) {
  const originalStart =
    toValidDate(
      event.start
    );

  if (!originalStart) {
    return;
  }

  const originalEnd =
    toValidDate(
      event.end
    );

  const duration =
    originalEnd
      ? Math.max(
          0,
          originalEnd.getTime() -
          originalStart.getTime()
        )
      : 60 *
        60 *
        1000;

  /*
    Add one day of margin because a meeting near midnight
    can move between dates when the user changes time zone.
  */

  const expansionStart =
    new Date(
      rangeStart.getTime() -
      24 *
      60 *
      60 *
      1000
    );

  const expansionEnd =
    new Date(
      rangeEnd.getTime() +
      24 *
      60 *
      60 *
      1000
    );

  let occurrenceDates = [];

  try {
    occurrenceDates =
      event.rrule.between(
        expansionStart,
        expansionEnd,
        true
      );
  } catch (error) {
    console.error(
      "RRULE expansion failed:",
      event.uid,
      error
    );

    /*
      Don't allow one malformed recurring event to break
      the entire calendar.
    */

    return;
  }

  for (
    const occurrenceStartRaw
    of occurrenceDates
  ) {
    let occurrenceStart =
      toValidDate(
        occurrenceStartRaw
      );

    if (!occurrenceStart) {
      continue;
    }

    /*
      node-ical stores recurrence exceptions using date keys.
    */

    if (
      isExcludedOccurrence(
        event,
        occurrenceStart
      )
    ) {
      continue;
    }

    const recurrenceOverride =
      findRecurrenceOverride(
        event,
        occurrenceStart
      );

    let title =
      event.summary ??
      "Untitled meeting";

    let location =
      event.location;

    let description =
      event.description;

    let occurrenceEnd =
      new Date(
        occurrenceStart.getTime() +
        duration
      );

    if (recurrenceOverride) {
      const overrideStart =
        toValidDate(
          recurrenceOverride.start
        );

      const overrideEnd =
        toValidDate(
          recurrenceOverride.end
        );

      if (overrideStart) {
        occurrenceStart =
          overrideStart;
      }

      if (overrideEnd) {
        occurrenceEnd =
          overrideEnd;
      }

      if (
        recurrenceOverride.summary
      ) {
        title =
          recurrenceOverride.summary;
      }

      if (
        recurrenceOverride.location
      ) {
        location =
          recurrenceOverride.location;
      }

      if (
        recurrenceOverride.description
      ) {
        description =
          recurrenceOverride.description;
      }
    }

    const normalized = {
      id:
        `${event.uid ?? "meeting"}|${occurrenceStart.toISOString()}`,

      uid:
        String(
          event.uid ??
          ""
        ),

      title:
        cleanText(
          title
        ),

      location:
        cleanText(
          getTextValue(
            location
          )
        ),

      description:
        cleanText(
          getTextValue(
            description
          )
        ),

      start:
        occurrenceStart
          .toISOString(),

      end:
        occurrenceEnd
          .toISOString(),

      all_day:
        isAllDayEvent(
          event,
          occurrenceStart,
          occurrenceEnd
        ),

      recurring:
        true,
    };

    if (
      eventIntersectsRange(
        normalized,
        rangeStart,
        rangeEnd
      )
    ) {
      result.push(
        normalized
      );
    }
  }
}

/* =========================================================
   Recurrence exclusions
   ========================================================= */

function isExcludedOccurrence(
  event,
  date
) {
  if (!event.exdate) {
    return false;
  }

  const target =
    date.getTime();

  for (
    const excluded
    of Object.values(
      event.exdate
    )
  ) {
    const excludedDate =
      toValidDate(
        excluded
      );

    if (
      excludedDate &&
      Math.abs(
        excludedDate.getTime() -
        target
      ) <
      1000
    ) {
      return true;
    }
  }

  return false;
}

function findRecurrenceOverride(
  event,
  date
) {
  if (!event.recurrences) {
    return null;
  }

  const target =
    date.getTime();

  for (
    const recurrence
    of Object.values(
      event.recurrences
    )
  ) {
    const recurrenceDate =
      toValidDate(
        recurrence.recurrenceid ??
        recurrence.start
      );

    if (
      recurrenceDate &&
      Math.abs(
        recurrenceDate.getTime() -
        target
      ) <
      1000
    ) {
      return recurrence;
    }
  }

  return null;
}

/* =========================================================
   Utilities
   ========================================================= */

function eventIntersectsRange(
  event,
  rangeStart,
  rangeEnd
) {
  const start =
    new Date(
      event.start
    );

  const end =
    new Date(
      event.end
    );

  return (
    start < rangeEnd &&
    end > rangeStart
  );
}

function isAllDayEvent(
  event,
  start,
  end
) {
  if (
    event.datetype ===
    "date"
  ) {
    return true;
  }

  if (
    event.start?.dateOnly ===
    true
  ) {
    return true;
  }

  /*
    Fall back conservatively.
  */

  return (
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    (
      end.getTime() -
      start.getTime()
    ) >=
      24 *
      60 *
      60 *
      1000
  );
}

function getTextValue(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value ===
      "string"
  ) {
    return value;
  }

  if (
    typeof value ===
      "object" &&
    typeof value.val ===
      "string"
  ) {
    return value.val;
  }

  return String(
    value
  );
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
    .replace(
      /\\n/g,
      "\n"
    )
    .replace(
      /\\,/g,
      ","
    )
    .replace(
      /\\;/g,
      ";"
    )
    .trim();
}

function toValidDate(
  value
) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? new Date(
          value.getTime()
        )
      : new Date(value);

  return Number.isNaN(
    date.getTime()
  )
    ? null
    : date;
}

function parseDate(
  value
) {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }

  return toValidDate(
    value
  );
}

async function safeReadText(
  response
) {
  try {
    return await response.text();
  } catch {
    return "";
  }
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
        SESSION_SECRET
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