// functions/api/airtable.js
// Cloudflare Pages Function — proxies Airtable requests server-side
// so your AIRTABLE_TOKEN never reaches the browser.

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const token = env.AIRTABLE_TOKEN;
  const baseId = env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    return new Response(
      JSON.stringify({ error: "Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID environment variables." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const table = url.searchParams.get("table"); // e.g. "Solicitudes", "Préstamos", "Empresas"

  if (!table) {
    return new Response(JSON.stringify({ error: "Missing ?table= param" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Table IDs map (update if your tables change)
  const tableIds = {
    Solicitudes: "tblfv9QxoIwJfihQ8",
    Prestamos: "tblc3tptDhAUheyNr",
    Empresas: "tblfZT55hGROayCCk",
  };

  const tableId = tableIds[table];
  if (!tableId) {
    return new Response(JSON.stringify({ error: `Unknown table: ${table}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch all records (handle pagination)
  let allRecords = [];
  let offset = null;

  do {
    const airtableUrl = new URL(
      `https://api.airtable.com/v0/${baseId}/${tableId}`
    );
    airtableUrl.searchParams.set("pageSize", "100");
    if (offset) airtableUrl.searchParams.set("offset", offset);

    const res = await fetch(airtableUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await res.json();
    allRecords = allRecords.concat(data.records || []);
    offset = data.offset || null;
  } while (offset);

  return new Response(JSON.stringify({ records: allRecords }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      // Cache for 60 seconds so repeated visits don't hammer Airtable
      "Cache-Control": "s-maxage=60",
    },
  });
}
