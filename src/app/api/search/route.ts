import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE =
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://127.0.0.1:8000";

type Flight = {
  compagnie: string;
  prix: number;
  depart: string;
  arrivee: string;
  heure_depart: string;
  heure_arrivee: string;
  duree: string;
  escales: number;
  um_ok: boolean;
  animal_ok: boolean;
};
type SearchPayload = { results: Flight[] };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = sp.get("origin") ?? "";
  const destination = sp.get("destination") ?? "";
  const date = sp.get("date") ?? "";
  const direct = sp.get("direct"); // <-- nouveau

  const params = new URLSearchParams({ origin, destination, date });
  if (direct !== null && direct !== undefined && direct !== "") {
    params.set("direct", direct);
  }

  const url = `${BASE}/search?${params.toString()}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    return NextResponse.json({ error: "upstream error", status: r.status }, { status: r.status });
  }
  const data = (await r.json()) as SearchPayload;
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}