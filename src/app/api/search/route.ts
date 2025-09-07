import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = sp.get("origin");
  const destination = sp.get("destination");
  const date = sp.get("date");

  if (!origin || !destination || !date) {
    return NextResponse.json(
      { error: "missing query param(s)" },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams({ origin, destination, date });
  if (sp.has("direct")) qs.set("direct", sp.get("direct") || "0");

  const url = `${BASE.replace(/\/+$/, "")}/search?${qs.toString()}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!r.ok) {
      return NextResponse.json(
        { error: "upstream", status: r.status, details: data },
        { status: r.status }
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "fetch_failed", message: msg },
      { status: 502 }
    );
  }
}