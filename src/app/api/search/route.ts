// src/app/api/search/route.ts
import { NextResponse } from "next/server";
import { applyRules, type Criteria, type Itinerary } from "../../../rules/applyRules";

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

  // critères étendus
  const adults = Number(searchParams.get("adults") ?? "1") || 1;
  const infants = Number(searchParams.get("infants") ?? "0") || 0;
  const childrenAges = (searchParams.get("childrenAges") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n >= 2 && n <= 11);

  const cabin = (searchParams.get("cabin") as "eco" | "premium" | "business" | "first") || "eco";
  const bagsCabin = Number(searchParams.get("bagsCabin") ?? "0") || 0;
  const bagsSoute = Number(searchParams.get("bagsSoute") ?? "0") || 0;
  const fareType = (searchParams.get("fareType") as "" | "basic" | "flex") || "";
  const resident = searchParams.get("resident") === "1";
  const currency = searchParams.get("currency") || "EUR";

  if (!origin || !destination || !date) {
    return NextResponse.json(
      { error: "Paramètres manquants" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  const API_BASE = getApiBase();

  try {
    await warmUp(API_BASE);

    const upstreamUrl =
      `${API_BASE}/search?origin=${encodeURIComponent(origin)}` +
      `&destination=${encodeURIComponent(destination)}` +
      `&date=${encodeURIComponent(date)}` +
      (direct ? "&direct=1" : "") +
      (um ? "&um=1" : "") +
      (pets ? "&pets=1" : "") +
      `&adults=${adults}` +
      (childrenAges.length ? `&childrenAges=${childrenAges.join(",")}` : "") +
      `&infants=${infants}` +
      `&cabin=${cabin}` +
      `&bagsCabin=${bagsCabin}` +
      `&bagsSoute=${bagsSoute}` +
      `&fareType=${fareType}` +
      `&resident=${resident ? "1" : "0"}` +
      `&currency=${currency}`;

    // 1er essai
    let upstream = await fetchWithTimeout(upstreamUrl, 25000);
    // 2e essai si besoin (cold start)
    if (!upstream.ok) {
      await new Promise((r) => setTimeout(r, 1200));
      upstream = await fetchWithTimeout(upstreamUrl, 25000);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "Upstream search", detail: text || upstream.statusText },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const data = await upstream.json().catch(() => ({}));
    const rawResults = Array.isArray(data?.results) ? data.results : [];

    // Mapper chaque résultat vers un Itinerary simplifié pour le rules engine
    const criteria: Criteria = {
      adults,
      infants,
      childrenAges,
      cabin,
      bagsCabin,
      bagsSoute,
      fareType,
      resident,
      currency,
      um
    };

    const results = rawResults.map((r: any) => {
      // Essayer de deviner marketing carrier et segments
      const segments = Array.isArray(r?.vols) ? r.vols.length : (typeof r?.escales === "number" ? Math.max(1, r.escales + 1) : 1);
      const carrierCode =
        r?.compagnieCode ||
        r?.carrierCode ||
        (Array.isArray(r?.vols) && r.vols[0]?.marketingCarrier) ||
        (r?.compagnie && typeof r.compagnie === "string" ? r.compagnie.slice(0, 2).toUpperCase() : "AF");

      const itin: Itinerary = {
        baseFare: Number.isFinite(r?.prix) ? Number(r.prix) : (Number(r?.baseFare) || 0),
        currency: r?.currency || r?.devise || "EUR",
        segments,
        carrierCode,
        brand: (r?.brand || r?.fareType || "") as "" | "basic" | "flex",
        cabin: (r?.cabin || r?.classe || cabin) as any
      };

      const ar = applyRules(itin, carrierCode, criteria);

      // Conserver le schéma attendu côté front : écraser prix avec total
      return {
        ...r,
        prix: ar.total,
        currency: ar.currency,
        rules: {
          surcharges: ar.surcharges,
          warnings: ar.warnings,
          eligible: ar.eligible,
          reasons: ar.reasons
        }
      };
    });

    // Option: filtrer non éligibles
    const filtered = results.filter((x: any) => x?.rules?.eligible !== false);

    return NextResponse.json(
      { results: filtered },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: "Échec recherche", detail: e?.message || "fetch failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}