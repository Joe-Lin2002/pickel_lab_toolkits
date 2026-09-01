import crypto from "node:crypto";

const COOKIE_NAME = "pickel_lab_session";
const SESSION_PURPOSE = "pickel-lab-schedule";

const sessionSecret = process.env.SESSION_SECRET;
const calendarUrl = process.env.MEETING_ICS_URL;

export default async function handler(request, response) {
  setSecurityHeaders(response);

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!sessionSecret) {
    return response.status(500).json({
      error: "Authentication service is not configured.",
    });
  }

  if (!calendarUrl) {
    return response.status(500).json({
      error: "Meeting calendar is not configured.",
    });
  }

  if (!verifyRequestSession(request)) {
    return response.status(401).json({
      error: "Authentication required.",
    });
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(calendarUrl);
  } catch {
    return response.status(500).json({
      error: "Meeting calendar subscription URL is invalid.",
    });
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return response.status(500).json({
      error: "Meeting calendar subscription URL is invalid.",
    });
  }

  const webcalUrl = new URL(parsedUrl.toString());
  webcalUrl.protocol = "webcal:";

  return response.status(200).json({
    subscription_url: webcalUrl.toString(),
  });
}

function verifyRequestSession(request) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  return verifySessionToken(cookies[COOKIE_NAME]);
}

function verifySessionToken(token) {
  if (typeof token !== "string" || token.length > 2048) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [payloadText, suppliedSignature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", sessionSecret)
    .update(payloadText)
    .digest("base64url");

  if (!safeEqual(suppliedSignature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(payloadText, "base64url").toString("utf8")
    );

    return (
      payload?.purpose === SESSION_PURPOSE &&
      Number.isInteger(payload?.exp) &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const result = {};

  for (const item of String(header).split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;

    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (name) result[name] = value;
  }

  return result;
}

function safeEqual(firstValue, secondValue) {
  const first = Buffer.from(String(firstValue), "utf8");
  const second = Buffer.from(String(secondValue), "utf8");

  if (first.length !== second.length) {
    const dummy = Buffer.alloc(first.length);
    crypto.timingSafeEqual(first, dummy);
    return false;
  }

  return crypto.timingSafeEqual(first, second);
}

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
}
