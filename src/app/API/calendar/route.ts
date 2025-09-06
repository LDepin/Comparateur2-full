import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const API_BASE = process.env.API_BASE!;

export async function GET(req: NextRequest) {
  try {
    if (!API_BASE) {
      return NextResponse.json({ error: "API_BASE manquant" }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const origin = searchParams.get("origin");
    const destination = searchParams.get("destination");
    const month = searchParams.get("month");

    if (!origin || !destination || !month) {
      return NextResponse.json({ error: "origin, destination, month requis" }, { status: 400 });
    }

    const url = `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&month=${encodeURIComponent(month)}`;
    const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "proxy error" }, { status: 500 });
  }
}
