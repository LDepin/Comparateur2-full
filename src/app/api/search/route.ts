// src/app/api/search/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_BASE ||
    process.env.API_BASE ||
    "http://127.0.0.1:8000"
  ).replace(/\/+$/, "");
}

async function fetchWithTimeout(url: string, timeoutMs = 25000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

async function warmUp(apiBase: string) {
  try {
    await fetchWithTimeout(`${apiBase}/ping`, 8000);
  } catch {
    // pas bloquant
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin") || "";
  const destination = searchParams.get("destination") || "";
  const date = searchParams.get("date") || "";

  const direct = searchParams.get("direct") === "1";
  const um = searchParams.get("um") === "1";
  const pets = searchParams.get("pets") === "1";

  if (!origin || !destination || !date) {
    return NextResponse.json(
      { error: "Paramètres manquants" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const API_BASE = getApiBase();

  try {
    await warmUp(API_BASE);

    const url =
      `${API_BASE}/search?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&date=${encodeURIComponent(date)}` +
      (direct ? "&direct=1" : "") +
      (um ? "&um=1" : "") +
      (pets ? "&pets=1" : "");

    // 1er essai
    let upstream = await fetchWithTimeout(url, 25000);
    // 2e essai si besoin (cold start)
    if (!upstream.ok) {
      await new Promise((r) => setTimeout(r, 1200));
      upstream = await fetchWithTimeout(url, 25000);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "Upstream search", detail: text || upstream.statusText },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await upstream.json().catch(() => ({}));
    const results = Array.isArray(data?.results) ? data.results : [];

    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Échec recherche", detail: e?.message || "fetch failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}