// src/app/api/calendar/route.ts
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
  const month = searchParams.get("month") || ""; // YYYY-MM

  if (!origin || !destination || !month) {
    return NextResponse.json(
      { error: "Paramètres manquants" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  // critères additionnels
  const direct = searchParams.get("direct") === "1";
  const um = searchParams.get("um") === "1";
  const pets = searchParams.get("pets") === "1";

  const adults = searchParams.get("adults") ?? "1";
  const childrenAges = searchParams.get("childrenAges") ?? "";
  const infants = searchParams.get("infants") ?? "0";
  const cabin = searchParams.get("cabin") ?? "eco";
  const bagsCabin = searchParams.get("bagsCabin") ?? "0";
  const bagsSoute = searchParams.get("bagsSoute") ?? "0";
  const fareType = searchParams.get("fareType") ?? "";
  const resident = searchParams.get("resident") ?? "0";
  const currency = searchParams.get("currency") ?? "EUR";

  const API_BASE = getApiBase();

  try {
    await warmUp(API_BASE);

    const url =
      `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&month=${encodeURIComponent(month)}` +
      (direct ? "&direct=1" : "") +
      (um ? "&um=1" : "") +
      (pets ? "&pets=1" : "") +
      `&adults=${encodeURIComponent(adults)}` +
      (childrenAges ? `&childrenAges=${encodeURIComponent(childrenAges)}` : "") +
      `&infants=${encodeURIComponent(infants)}` +
      `&cabin=${encodeURIComponent(cabin)}` +
      `&bagsCabin=${encodeURIComponent(bagsCabin)}` +
      `&bagsSoute=${encodeURIComponent(bagsSoute)}` +
      `&fareType=${encodeURIComponent(fareType)}` +
      `&resident=${encodeURIComponent(resident)}` +
      `&currency=${encodeURIComponent(currency)}`;

    let upstream = await fetchWithTimeout(url, 25000);
    if (!upstream.ok) {
      await new Promise((r) => setTimeout(r, 1200));
      upstream = await fetchWithTimeout(url, 25000);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "Upstream calendar", detail: text || upstream.statusText },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await upstream.json().catch(() => ({}));
    const calendar =
      typeof data === "object" && data?.calendar && typeof data.calendar === "object"
        ? data.calendar
        : {};

    return NextResponse.json(
      { calendar },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Échec calendrier", detail: e?.message || "fetch failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}