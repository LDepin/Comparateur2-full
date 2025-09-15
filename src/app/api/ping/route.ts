// File: src/app/api/ping/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_BASE_URL || // fallback éventuel
  "http://127.0.0.1:8000";

export async function GET() {
  try {
    const upstream = await fetch(`${API_BASE}/ping`, { cache: "no-store" });
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: "upstream_not_ok", status: upstream.status },
        { status: 502 }
      );
    }
    const data = await upstream.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "fetch_failed", detail: String((e as Error)?.message || e) },
      { status: 502 }
    );
  }
}