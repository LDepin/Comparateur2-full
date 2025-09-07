import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000";

type DayInfo = { prix: number | null; disponible: boolean };
type CalendarPayload = { calendar: Record<string, DayInfo> };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = sp.get("origin") ?? "";
  const destination = sp.get("destination") ?? "";
  const month = sp.get("month") ?? "";

  if (!origin || !destination || !month) {
    return NextResponse.json(
      { error: "missing parameters" },
      { status: 400 }
    );
  }

  const url =
    `${BASE}/calendar?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&month=${encodeURIComponent(month)}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { error: "upstream error", status: r.status },
        { status: r.status }
      );
    }

    const data = (await r.json()) as unknown as CalendarPayload;
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}