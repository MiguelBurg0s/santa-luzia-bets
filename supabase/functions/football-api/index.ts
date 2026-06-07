import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const FD_API_KEY = Deno.env.get("FD_API_KEY") || "";
const FD_BASE    = "https://api.football-data.org/v4";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  const url    = new URL(req.url);
  const path   = url.searchParams.get("path") || "";

  if (!path) {
    return new Response(JSON.stringify({ error: "Missing path param" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }

  try {
    const apiUrl  = `${FD_BASE}${path}`;
    const apiRes  = await fetch(apiUrl, {
      headers: { "X-Auth-Token": FD_API_KEY }
    });
    const data    = await apiRes.json();
    return new Response(JSON.stringify(data), {
      status: apiRes.status,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
