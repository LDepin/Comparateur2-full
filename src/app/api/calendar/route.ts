// File: src/app/api/calendar/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const origin = u.searchParams.get("origin") || "";
  const destination = u.searchParams.get("destination") || "";
  const month = u.searchParams.get("month") || "";

  if (!origin || !destination || !month) {
    return NextResponse.json(
      { error: "missing_params", needed: ["origin", "destination", "month"] },
      { status: 400 }
    );
  }

  const url =
    `${API_BASE}/calendar?` +
    `origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&month=${encodeURIComponent(month)}`;

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "upstream_not_ok", status: upstream.status },
        { status: 502 }
      );
    }
    const data = await upstream.json();

    // Normalisation défensive : assurer un objet { calendar: Record<string, { prix, disponible }> }
    const calendar =
      (data?.calendar as Record<string, { prix: number | null; disponible: boolean }>) || {};

    return NextResponse.json(
      { calendar },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: String((e as Error)?.message || e) },
      { status: 502 }
    );
  }
}