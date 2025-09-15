// File: src/app/api/search/route.ts
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
  const date = u.searchParams.get("date") || "";

  // filtres optionnels
  const direct = u.searchParams.get("direct") === "1";
  const um = u.searchParams.get("um") === "1";
  const pets = u.searchParams.get("pets") === "1";

  if (!origin || !destination || !date) {
    return NextResponse.json(
      { error: "missing_params", needed: ["origin", "destination", "date"] },
      { status: 400 }
    );
  }

  const qs = new URLSearchParams();
  qs.set("origin", origin);
  qs.set("destination", destination);
  qs.set("date", date);
  if (direct) qs.set("direct", "1");
  if (um) qs.set("um", "1");
  if (pets) qs.set("pets", "1");

  const url = `${API_BASE}/search?${qs.toString()}`;

  try {
    const upstream = await fetch(url, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "upstream_not_ok", status: upstream.status },
        { status: 502 }
      );
    }
    const data = await upstream.json();

    // Normalisation défensive : garantir un tableau results
    const results = Array.isArray(data?.results) ? data.results : [];

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", detail: String((e as Error)?.message || e) },
      { status: 502 }
    );
  }
}