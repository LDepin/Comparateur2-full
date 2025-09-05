// src/app/api/calendar/route.ts
import type { NextRequest } from "next/server";

export const runtime = "edge";

const API_BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const origin = searchParams.get("origin") ?? "";
  const destination = searchParams.get("destination") ?? "";
  const month = searchParams.get("month") ?? ""; // ex: 2025-09

  const url =
    `${API_BASE}/calendar` +
    `?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&month=${encodeURIComponent(month)}`;

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
