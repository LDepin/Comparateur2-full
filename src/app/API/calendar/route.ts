import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin") ?? "";
  const destination = searchParams.get("destination") ?? "";
  const month = searchParams.get("month") ?? "";

  const url =
    `${BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&month=${encodeURIComponent(month)}`;

  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    const data = await r.json().catch(() => ({} as unknown));
    return NextResponse.json(data as unknown, { status: r.ok ? r.status : 500 });
  } catch {
    return NextResponse.json({ calendar: {} }, { status: 502 });
  }
}