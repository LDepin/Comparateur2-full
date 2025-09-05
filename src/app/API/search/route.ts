// src/app/api/search/route.ts
import type { NextRequest } from "next/server";

export const runtime = "edge"; // rapide sur Vercel

const API_BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get("origin") ?? "";
  const destination = searchParams.get("destination") ?? "";
  const date = searchParams.get("date") ?? "";
  const direct = searchParams.get("direct"); // "1" ou "0" (optionnel)

  const url =
    `${API_BASE}/search` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&date=${encodeURIComponent(date)}` +
    (direct ? `&direct=${encodeURIComponent(direct)}` : "");

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return Response.json(
        { error: "Backend error", status: r.status, details: text.slice(0, 500) },
        { status: 502 }
      );
    }
    const data = await r.json();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    return Response.json(
      { error: "Proxy fetch failed", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
