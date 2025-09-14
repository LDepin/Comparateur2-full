import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || "http://127.0.0.1:8000";

export async function GET() {
  const r = await fetch(`${API_BASE}/ping`, { cache: "no-store" });
  const data = await r.json();
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}