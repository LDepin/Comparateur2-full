import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // pas de cache
const API_BASE = process.env.API_BASE!; // défini dans Vercel + .env.local

export async function GET(req: NextRequest) {
  try {
    if (!API_BASE) {
      return NextResponse.json({ error: "API_BASE manquant" }, { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const origin = searchParams.get("origin");
    const destination = searchParams.get("destination");
    const date = searchParams.get("date");

    if (!origin || !destination || !date) {
      return NextResponse.json({ error: "origin, destination, date requis" }, { status: 400 });
    }

    const url = `${API_BASE}/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&date=${encodeURIComponent(date)}`;
    const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "proxy error" }, { status: 500 });
  }
}
