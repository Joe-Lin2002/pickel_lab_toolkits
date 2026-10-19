import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const cronSecret = process.env.CRON_SECRET;

const KEEPALIVE_QUERY_COUNT = 3;

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  if (!supabaseUrl || !supabaseSecretKey) {
    return response.status(500).json({
      error: "Supabase keep-alive is not configured.",
    });
  }

  if (!cronSecret) {
    return response.status(500).json({
      error: "CRON_SECRET is not configured.",
    });
  }

  const authorization = request.headers.authorization ?? "";

  if (authorization !== `Bearer ${cronSecret}`) {
    return response.status(401).json({ error: "Unauthorized." });
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

  try {
    // Supabase documents that regular user database activity can keep a Free
    // project from being classified as inactive. Perform a few tiny reads once
    // per day so the database receives real application traffic without
    // modifying lab data.
    for (let index = 0; index < KEEPALIVE_QUERY_COUNT; index += 1) {
      const { error } = await database
        .from("reservations")
        .select("id")
        .limit(1);

      if (error) {
        console.error("Supabase keep-alive query failed:", error);
        return response.status(502).json({
          error: "Supabase keep-alive query failed.",
        });
      }
    }

    const completedAt = new Date().toISOString();

    console.log(
      `Supabase keep-alive completed at ${completedAt} (${KEEPALIVE_QUERY_COUNT} database reads).`
    );

    return response.status(200).json({
      ok: true,
      database_reads: KEEPALIVE_QUERY_COUNT,
      completed_at: completedAt,
    });
  } catch (error) {
    console.error("Supabase keep-alive error:", error);

    return response.status(500).json({
      error: "Supabase keep-alive failed.",
    });
  }
}
