import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = sp.get("origin") ?? "";
  const destination = sp.get("destination") ?? "";
  const month = sp.get("month") ?? "";

  const url =
    `${BASE}/calendar?origin=${encodeURIComponent(origin)}` +
    `&destination=${encodeURIComponent(destination)}` +
    `&month=${encodeURIComponent(month)}`;

  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json(
      { error: "upstream error", status: r.status },
      { status: 502 }
    );
  }
  const data = await r.json();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
