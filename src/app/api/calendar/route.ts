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
  const month = sp.get("month");

  if (!origin || !destination || !month) {
    return NextResponse.json(
      { error: "missing query param(s)" },
      { status: 400 }
    );
  }

  // On ne transmet que les paramètres utiles, on tolère 'direct'
  const qs = new URLSearchParams({
    origin,
    destination,
    month,
  });
  if (sp.has("direct")) qs.set("direct", sp.get("direct") || "0");

  const url = `${BASE.replace(/\/+$/, "")}/calendar?${qs.toString()}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();
    let data: any;
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
  } catch (e: any) {
    return NextResponse.json(
      { error: "fetch_failed", message: String(e?.message ?? e) },
      { status: 502 }
    );
  }
}