import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const origin = u.searchParams.get("origin") || "";
  const destination = u.searchParams.get("destination") || "";
  const month = u.searchParams.get("month") || "";
  const direct = u.searchParams.get("direct") || "0";
  const um = u.searchParams.get("um") || "0";
  const pets = u.searchParams.get("pets") || "0";

  const url = `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&month=${encodeURIComponent(month)}&direct=${direct}&um=${um}&pets=${pets}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json({ error: "upstream error", status: r.status }, { status: 502 });
  }
  const data = await r.json();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}