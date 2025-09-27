// src/app/search/SearchClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Checkbox from "../components/ui/Checkbox";
import Select from "../components/ui/Select";
import PassengerPicker from "@/app/components/PassengerPicker";

// --- Types ---
type CalendarDay = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarDay>;
type SortKey = "price" | "duration" | "depart";
type ViewMode = "week" | "month";

type Flight = {
  prix: number; // >0 après filtrage
  compagnie?: string;
  escales?: number;
  departISO?: string;
  arriveeISO?: string;
  departText?: string;
  arriveeText?: string;
  dureeMin?: number;
};

// --- Helpers ---
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDateLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYMDLocal = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const [_, Y, M, D] = m;
  return new Date(Number(Y), Number(M) - 1, Number(D));
};
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const toLocalHHMM = (iso?: string) => {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};
const parseISOorLocal = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;
  if (/^\d{2}:\d{2}$/.test(v)) {
    const [h, m] = v.split(":").map(Number);
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  }
  return undefined;
};
const parsePTdur = (pt?: string) => {
  if (!pt || !pt.startsWith("PT")) return undefined;
  const h = /(\d+)H/.exec(pt)?.[1];
  const m = /(\d+)M/.exec(pt)?.[1];
  return (h ? +h * 60 : 0) + (m ? +m : 0);
};
const minutesDiff = (a?: Date, b?: Date) => (a && b ? Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000)) : undefined);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const median = (arr: number[]) => {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
};
const classifyTone = (prix: number | null, min: number, max: number) => {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / Math.max(1, max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
};

function normalizeFlight(r: any): Flight {
  const rawPrice = typeof r?.prix === "number" ? r.prix : Number(r?.prix ?? NaN);
  const prix = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice) : NaN;

  const depISO = r?.depart_iso ?? r?.departISO ?? r?.heure_depart ?? r?.vols?.[0]?.depart_iso ?? r?.vols?.[0]?.departISO;
  const arrISO = r?.arrivee_iso ?? r?.arriveeISO ?? r?.heure_arrivee ?? r?.vols?.[r?.vols?.length - 1]?.arrivee_iso ?? r?.vols?.[r?.vols?.length - 1]?.arriveeISO;

  const dep = parseISOorLocal(depISO);
  const arr = parseISOorLocal(arrISO);

  const dureeMin = typeof r?.duree_minutes === "number" ? r.duree_minutes : parsePTdur(r?.duree) ?? minutesDiff(dep, arr);

  const compagnie = r?.compagnie ?? (Array.isArray(r?.compagnies) && r.compagnies.length ? r.compagnies.join("/") : undefined);

  return {
    prix,
    compagnie,
    escales: typeof r?.escales === "number" ? r.escales : Array.isArray(r?.vols) ? Math.max(0, r.vols.length - 1) : undefined,
    departISO: dep ? dep.toISOString() : undefined,
    arriveeISO: arr ? arr.toISOString() : undefined,
    departText: dep ? toLocalHHMM(dep.toISOString()) : "—",
    arriveeText: arr ? toLocalHHMM(arr.toISOString()) : "—",
    dureeMin: dureeMin ?? undefined,
  };
}

const frenchWeek = ["L", "M", "M", "J", "V", "S", "D"];

// ============================================================

export default function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();

  // --- Query-bound state ---
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(params.get("destination") || "BCN");
  const initialDate = parseYMDLocal(params.get("date") || undefined) ?? new Date();
  const [dateStr, setDateStr] = useState(fmtDateLocal(initialDate));

  const [sort, setSort] = useState<SortKey>((params.get("sort") as SortKey) || "price");
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUm] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");
  const [view, setView] = useState<ViewMode>((params.get("view") as ViewMode) || "month");

  // Passagers / options
  const [adults, setAdults] = useState<number>(clamp(Number(params.get("adults") ?? 1) || 1, 1, 9));
  const [infants, setInfants] = useState<number>(clamp(Number(params.get("infants") ?? 0) || 0, 0, 3));
  const [childrenAges, setChildrenAges] = useState<number[]>(
    (params.get("childrenAges") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n >= 2 && n <= 11)
      .slice(0, 9)
  );
  const [cabin, setCabin] = useState<"eco" | "premium" | "business" | "first">(
    (params.get("cabin") as any) || "eco"
  );
  const [bagsCabin, setBagsCabin] = useState<number>(clamp(Number(params.get("bagsCabin") ?? 0) || 0, 0, 2));
  const [bagsSoute, setBagsSoute] = useState<number>(clamp(Number(params.get("bagsSoute") ?? 0) || 0, 0, 2));
  const [fareType, setFareType] = useState<"" | "basic" | "flex">((params.get("fareType") as any) || "");
  const [resident, setResident] = useState<boolean>(params.get("resident") === "1");
  const [currency, setCurrency] = useState<string>(params.get("currency") || "EUR");

  // --- Data state ---
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [results, setResults] = useState<Flight[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);
  const [errorCal, setErrorCal] = useState<string | null>(null);
  const [errorRes, setErrorRes] = useState<string | null>(null);

  // UI helpers
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const [showMini, setShowMini] = useState(false);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const [monthCursor, setMonthCursor] = useState<Date>(() => initialDate);

  // Fermer mini-calendrier clic extérieur
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (
        showMini &&
        miniRef.current &&
        !miniRef.current.contains(e.target as Node) &&
        dateInputRef.current &&
        !dateInputRef.current.contains(e.target as Node)
      ) {
        setShowMini(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showMini]);

  // --- URL sync ---
  const currentShareURL = useMemo(() => {
    const p = new URLSearchParams();
    p.set("origin", origin);
    p.set("destination", destination);
    p.set("date", dateStr);
    p.set("sort", sort);
    p.set("direct", direct ? "1" : "0");
    p.set("um", um ? "1" : "0");
    p.set("pets", pets ? "1" : "0");
    p.set("view", view);

    p.set("adults", String(adults));
    if (childrenAges.length) p.set("childrenAges", childrenAges.join(","));
    p.set("infants", String(infants));
    p.set("cabin", cabin);
    p.set("bagsCabin", String(bagsCabin));
    p.set("bagsSoute", String(bagsSoute));
    p.set("fareType", fareType);
    p.set("resident", resident ? "1" : "0");
    p.set("currency", currency);

    return `/search?${p.toString()}`;
  }, [
    origin,
    destination,
    dateStr,
    sort,
    direct,
    um,
    pets,
    view,
    adults,
    childrenAges,
    infants,
    cabin,
    bagsCabin,
    bagsSoute,
    fareType,
    resident,
    currency,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    router.replace(currentShareURL as any);
  }, [router, currentShareURL]);

  // --- FETCH CALENDAR (Vérité = backend, pas de “pin”) ---
  const loadCalendar = useCallback(
    async (cursor: Date) => {
      setLoadingCal(true);
      setErrorCal(null);
      try {
        const m = monthKey(cursor);
        const q =
          `/api/calendar?origin=${encodeURIComponent(origin)}` +
          `&destination=${encodeURIComponent(destination)}` +
          `&month=${m}` +
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

        const r = await fetch(q, { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const data = await r.json();

        const raw = (data?.calendar ?? {}) as Record<string, { prix?: unknown; disponible?: unknown }>;
        const sanitized: CalendarMap = {};
        for (const [k, v] of Object.entries(raw)) {
          const rawPrice = typeof v?.prix === "number" ? v.prix : Number(v?.prix);
          const prix = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice) : null;
          const disponible = Boolean(v?.disponible);
          sanitized[k] = { prix, disponible };
        }
        setCalendar(sanitized);
      } catch (e: any) {
        setCalendar({});
        setErrorCal(e?.message || "Erreur calendrier");
      } finally {
        setLoadingCal(false);
      }
    },
    [
      origin,
      destination,
      direct,
      um,
      pets,
      adults,
      childrenAges,
      infants,
      cabin,
      bagsCabin,
      bagsSoute,
      fareType,
      resident,
      currency,
    ]
  );

  // --- FETCH RESULTS (jour) ---
  const loadResults = useCallback(
    async (dStr: string) => {
      setLoadingRes(true);
      setErrorRes(null);
      try {
        const q =
          `/api/search?origin=${encodeURIComponent(origin)}` +
          `&destination=${encodeURIComponent(destination)}` +
          `&date=${dStr}` +
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

        const r = await fetch(q, { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        const raw = await r.json();

        let list: Flight[] = Array.isArray(raw?.results) ? raw.results.map(normalizeFlight) : [];
        list = list.filter((x) => Number.isFinite(x.prix) && x.prix > 0);
        if (direct) list = list.filter((x) => (x.escales ?? 0) === 0);

        list.sort((a, b) => {
          if (sort === "price") return a.prix - b.prix;
          if (sort === "duration") return (a.dureeMin ?? 9e9) - (b.dureeMin ?? 9e9);
          const ad = parseISOorLocal(a.departISO)?.getTime() ?? 9e13;
          const bd = parseISOorLocal(b.departISO)?.getTime() ?? 9e13;
          return ad - bd;
        });

        setResults(list);
      } catch (e: any) {
        setResults([]);
        setErrorRes(e?.message || "Erreur recherche");
      } finally {
        setLoadingRes(false);
      }
    },
    [
      origin,
      destination,
      direct,
      um,
      pets,
      adults,
      childrenAges,
      infants,
      cabin,
      bagsCabin,
      bagsSoute,
      fareType,
      resident,
      currency,
      sort,
    ]
  );

  // Init / refresh
  useEffect(() => {
    loadCalendar(parseYMDLocal(dateStr) ?? new Date());
  }, [loadCalendar, dateStr]);
  useEffect(() => {
    loadResults(dateStr);
  }, [loadResults, dateStr]);

  // Sélection auto premier résultat
  useEffect(() => {
    if (results.length === 0) setSelectedIndex(-1);
    else if (selectedIndex < 0 || selectedIndex >= results.length) setSelectedIndex(0);
  }, [results, selectedIndex]);

  // --- Calendrier affiché (direct = vérité du backend) ---
  const displayCalendar = calendar;

  const calStats = useMemo(() => {
    const values = Object.values(displayCalendar)
      .map((d) => d.prix)
      .filter((x): x is number => typeof x === "number");
    const min = values.length ? Math.min(...values) : null;
    const max = values.length ? Math.max(...values) : null;
    const med = values.length ? median(values)! : null;
    return { min, max, med };
  }, [displayCalendar]);

  // Navigation / sélection
  const selectDay = (d: Date) => {
    setDateStr(fmtDateLocal(d));
    setMonthCursor(d);
  };
  const goPrevMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() - 1, 1);
    setMonthCursor(d);
    loadCalendar(d);
  };
  const goNextMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() + 1, 1);
    setMonthCursor(d);
    loadCalendar(d);
  };

  // Semaine et grille mois
  const weekDays = useMemo(() => {
    const base = parseYMDLocal(dateStr) ?? new Date();
    const js = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - js);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [dateStr]);

  const monthDays = useMemo(() => {
    const first = firstDayOfMonth(monthCursor);
    const last = lastDayOfMonth(monthCursor);
    const startCol = (first.getDay() + 6) % 7;
    const days: (Date | null)[] = [];
    for (let i = 0; i < startCol; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    return days;
  }, [monthCursor]);

  // Timeline items
  const timelineItems = results.map((r) => {
    const dep = parseISOorLocal(r.departISO || "");
    const arr = parseISOorLocal(r.arriveeISO || "");
    const start = parseYMDLocal(dateStr)?.getTime() ?? Date.now();
    const s = dep ? dep.getTime() : start + 8 * 3600 * 1000;
    const e = arr ? arr.getTime() : s + (r.dureeMin ?? 120) * 60000;
    return { start: s, end: e };
  });

  // --- Flex dates ±3 ---
  const flexButtons = useMemo(() => {
    const base = parseYMDLocal(dateStr) ?? new Date();
    const out: { label: string; date: Date; key: string; price: number | null; current: boolean }[] = [];
    for (let delta = -3; delta <= 3; delta++) {
      const d = new Date(base);
      d.setDate(base.getDate() + delta);
      const key = fmtDateLocal(d);
      const price = displayCalendar[key]?.prix ?? null;
      const label = delta === 0 ? "Jour J" : (delta > 0 ? `J+${delta}` : `J${delta}`);
      out.push({ label, date: d, key, price, current: delta === 0 });
    }
    return out;
  }, [dateStr, displayCalendar]);

  // --- Meilleur prix du mois (sur monthCursor) ---
  const bestOfMonth = useMemo(() => {
    let bestKey: string | null = null;
    let bestVal = Infinity;
    for (const [k, v] of Object.entries(displayCalendar)) {
      if (!v || v.prix == null) continue;
      const d = parseYMDLocal(k);
      if (!d) continue;
      if (d.getFullYear() === monthCursor.getFullYear() && d.getMonth() === monthCursor.getMonth()) {
        if (v.prix < bestVal) {
          bestVal = v.prix;
          bestKey = k;
        }
      }
    }
    return bestKey ? { key: bestKey, value: bestVal } : null;
  }, [displayCalendar, monthCursor]);

  // Partage
  const doShare = async () => {
    const base = typeof window !== "undefined" && window.location ? window.location.origin : "";
    const url = `${base}${currentShareURL}`;
    try {
      const nav: any = (typeof navigator !== "undefined" ? navigator : {}) as any;
      if (nav?.share && typeof nav.share === "function") {
        await nav.share({ title: "Comparateur — vols", text: "Résultats de recherche", url });
      } else if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(url);
        alert("Lien copié dans le presse-papiers !");
      } else {
        window.history.replaceState(null, "", currentShareURL);
        alert("Lien prêt dans la barre d’adresse (copie manuelle).");
      }
    } catch {
      window.history.replaceState(null, "", currentShareURL);
      alert("Lien prêt dans la barre d’adresse (copie manuelle).");
    }
  };

  // --- UI ---
  const PriceBadge = ({ value }: { value: number | null }) => {
    const tone = classifyTone(value, calStats.min ?? 0, calStats.max ?? 0);
    const cls =
      tone === "low"
        ? "bg-green-100 border-green-300"
        : tone === "mid"
        ? "bg-yellow-100 border-yellow-300"
        : value == null
        ? "bg-gray-100 border-gray-300 text-gray-400"
        : "bg-rose-100 border-rose-300";
    return <div className={`rounded border ${cls} px-6 py-6 text-center text-xl font-medium`}>{value == null ? "—" : `${value} €`}</div>;
  };

  const MonthStatsBar = () => (
    <div className="mt-3 rounded border px-3 py-2 text-sm">
      <strong>Mois :</strong>{" "}
      {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
      {"  "}
      <span className="ml-4">Min : {calStats.min != null ? `${calStats.min} €` : "—"}</span>
      <span className="ml-4">Médiane : {calStats.med != null ? `${calStats.med} €` : "—"}</span>
      <span className="ml-4">Max : {calStats.max != null ? `${calStats.max} €` : "—"}</span>
    </div>
  );

  const DayTile: React.FC<{ d: Date; compact?: boolean }> = ({ d, compact }) => {
    const key = fmtDateLocal(d);
    const info = displayCalendar[key];
    const selected = key === dateStr;
    return (
      <button
        onClick={() => selectDay(d)}
        title={key}
        aria-label={`Choisir le ${key}`}
        className={[
          "rounded border transition hover:shadow",
          "h-[72px] sm:h-[84px] md:h-[96px]",
          "flex flex-col justify-between",
          "px-2 py-2",
          selected ? "ring-2 ring-blue-400" : "",
        ].join(" ")}
      >
        <div className={`text-sm ${selected ? "font-semibold" : ""}`}>{d.getDate()}</div>
        <div className={compact ? "text-base" : ""}>
          <PriceBadge value={info?.prix ?? null} />
        </div>
      </button>
    );
  };

  // Résumés et badges “Bon prix / Meilleur prix”
  const dayMin = useMemo(() => (results.length ? Math.min(...results.map((r) => r.prix)) : null), [results]);
  const isBestPrice = (p: number) => dayMin != null && p === dayMin;
  const isGoodPrice = (p: number) => dayMin != null && p <= Math.round(dayMin * 1.1);

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Comparateur — vols</h1>

      {/* Formulaire principal */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          loadCalendar(parseYMDLocal(dateStr) ?? new Date());
          loadResults(dateStr);
        }}
        className="grid grid-cols-1 gap-3 md:grid-cols-6"
      >
        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Origine</label>
          <Input value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="PAR" />
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Destination</label>
          <Input value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="BCN" />
        </div>

        <div className="relative md:col-span-2">
          <label className="mb-1 block text-sm text-gray-600">Date</label>
          <Input
            ref={dateInputRef}
            type="date"
            value={dateStr}
            onChange={(e) => {
              const v = e.target.value;
              setDateStr(v);
              const d = parseYMDLocal(v);
              if (d) setMonthCursor(d);
            }}
            onFocus={() => setShowMini(true)}
          />
          {/* Mini calendrier flottant */}
          {showMini && (
            <div ref={miniRef} style={{ position: "absolute", zIndex: 50, marginTop: 6, width: 320 }} className="rounded-lg border bg-white p-3 shadow">
              <div className="mb-2 flex items-center justify-between">
                <Button variant="outline" onClick={goPrevMonth} type="button">◀</Button>
                <div className="text-sm font-medium">
                  {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </div>
                <Button variant="outline" onClick={goNextMonth} type="button">▶</Button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
                {frenchWeek.map((w, i) => <div key={`ml-${i}`}>{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((d, i) =>
                  d ? (
                    <button
                      key={`mini-${fmtDateLocal(d)}`}
                      onClick={() => { selectDay(d); setShowMini(false); }}
                      className={[
                        "rounded border px-1 py-1 text-left h-[32px]",
                        fmtDateLocal(d) === dateStr ? "ring-2 ring-blue-400" : "",
                      ].join(" ")}
                      title={fmtDateLocal(d)}
                      aria-label={`Choisir le ${fmtDateLocal(d)}`}
                    >
                      <div className="text-[11px]">{d.getDate()}</div>
                      {(() => {
                        const val = displayCalendar[fmtDateLocal(d)]?.prix ?? null;
                        const tone = classifyTone(val, calStats.min ?? 0, calStats.max ?? 0);
                        const bg =
                          tone === "low" ? "bg-green-200" : tone === "mid" ? "bg-yellow-200" : val == null ? "bg-gray-200" : "bg-rose-200";
                        return <div className={`mt-0.5 h-1.5 w-4 rounded ${bg}`} />;
                      })()}
                    </button>
                  ) : <div key={`mini-empty-${i}`} />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Tri</label>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="price">Prix croissant</option>
            <option value="duration">Durée croissante</option>
            <option value="depart">Heure de départ (croiss.)</option>
          </Select>
        </div>

        <div className="flex items-end justify-between gap-2 md:col-span-1">
          <div className="flex flex-col gap-1 text-sm">
            <Checkbox checked={direct} onChange={(e) => setDirect(e.target.checked)} label="Direct" />
            <Checkbox checked={um} onChange={(e) => setUm(e.target.checked)} label="UM" />
            <Checkbox checked={pets} onChange={(e) => setPets(e.target.checked)} label="Animaux" />
          </div>
          <Button type="submit">Rechercher</Button>
        </div>

        {/* Passagers */}
        <div className="md:col-span-6 rounded border p-3">
          <PassengerPicker
            adults={adults}
            infants={infants}
            childrenAges={childrenAges}
            onChange={(next) => {
              const ad = clamp(next.adults ?? adults, 1, 9);
              const inf = clamp(next.infants ?? infants, 0, 3);
              const ch = (next.childrenAges ?? childrenAges)
                .filter((n) => Number.isFinite(n) && n >= 2 && n <= 11)
                .map((n) => Math.floor(n))
                .slice(0, 9);
              setAdults(ad);
              setInfants(inf);
              setChildrenAges(ch);
            }}
          />
        </div>

        {/* Options complémentaires */}
        <div className="md:col-span-6 rounded border p-3 grid grid-cols-1 gap-3 md:grid-cols-6">
          <div>
            <div className="mb-1 text-sm text-gray-600">Cabine</div>
            <Select value={cabin} onChange={(e) => setCabin(e.target.value as any)}>
              <option value="eco">Éco</option>
              <option value="premium">Premium</option>
              <option value="business">Business</option>
              <option value="first">First</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Bagage cabine</div>
            <Select value={String(bagsCabin)} onChange={(e) => setBagsCabin(clamp(Number(e.target.value), 0, 2))}>
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Bagage soute</div>
            <Select value={String(bagsSoute)} onChange={(e) => setBagsSoute(clamp(Number(e.target.value), 0, 2))}>
              <option value="0">0</option><option value="1">1</option><option value="2">2</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Type de tarif</div>
            <Select value={fareType} onChange={(e) => setFareType(e.target.value as any)}>
              <option value="">(Indifférent)</option>
              <option value="basic">Basic</option>
              <option value="flex">Flex</option>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-sm text-gray-600">Devise</div>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="EUR">EUR</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Checkbox checked={resident} onChange={(e) => setResident(e.target.checked)} label="Résident" />
          </div>
        </div>
      </form>

      {/* Légende + actions */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-200 ring-1 ring-green-400" /> pas cher
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-yellow-200 ring-1 ring-yellow-400" /> moyen
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-rose-200 ring-1 ring-rose-400" /> cher
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="rounded border">
            <button className={`px-3 py-1 ${view === "week" ? "bg-black text-white" : ""}`} onClick={() => setView("week")} type="button">Semaine</button>
            <button className={`px-3 py-1 ${view === "month" ? "bg-black text-white" : ""}`} onClick={() => setView("month")} type="button">Mois</button>
          </div>
          <Button
            variant="outline"
            type="button"
            disabled={!bestOfMonth}
            onClick={() => {
              if (!bestOfMonth) return;
              const d = parseYMDLocal(bestOfMonth.key)!;
              selectDay(d);
              // petite mise en avant : déjà gérée par la ring sur la case sélectionnée
            }}
            aria-label="Aller au meilleur prix du mois"
          >
            🔍 Meilleur prix du mois
          </Button>
          <button onClick={doShare} type="button" className="rounded border px-3 py-1" title="Partager">🔗 Partager</button>
        </div>
      </div>

      {/* Stats mois */}
      <MonthStatsBar />

      {/* Navigation mois */}
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={goPrevMonth} type="button" aria-label="Mois précédent">◀</Button>
        <div className="min-w-[180px] text-center font-medium">
          {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </div>
        <Button variant="outline" onClick={goNextMonth} type="button" aria-label="Mois suivant">▶</Button>
      </div>

      {/* Calendrier */}
      {loadingCal ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Chargement du calendrier…
          <div className="mt-3 grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-[72px] sm:h-[84px] md:h-[96px] animate-pulse rounded border bg-gray-100" />
            ))}
          </div>
        </div>
      ) : errorCal ? (
        <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          Erreur calendrier — {errorCal} <button className="ml-2 underline" onClick={() => loadCalendar(monthCursor)}>Réessayer</button>
        </div>
      ) : view === "week" ? (
        <>
          <div className="mt-4">
            <div className="mb-2 grid grid-cols-7 gap-3 text-center text-xs text-gray-500">
              {frenchWeek.map((w, i) => <div key={`wlab-${i}`}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map((d) => (
                <DayTile key={fmtDateLocal(d)} d={d} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="mt-4">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
            {frenchWeek.map((w, i) => <div key={`m-${i}`}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {monthDays.map((d, i) =>
              d ? (
                <DayTile key={fmtDateLocal(d)} d={d} compact />
              ) : (
                <div key={`empty-${i}`} className="h-[72px] sm:h-[84px] md:h-[96px] rounded border px-2 py-2 opacity-30" />
              )
            )}
          </div>
        </div>
      )}

      {/* Flex dates ±3 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {flexButtons.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => selectDay(b.date)}
            className={`rounded border px-3 py-1 text-sm ${b.current ? "bg-black text-white" : ""}`}
            aria-label={`Aller au ${b.label}`}
            title={b.key}
          >
            {b.label} {b.price != null ? ` ${b.price} €` : ""}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="mt-6">
        <div className="mb-1 text-xs text-gray-500">Timeline (barre surlignée = résultat sélectionné)</div>
        <div className="relative h-5 w-full rounded border bg-gray-50">
          {timelineItems.map((it, i) => {
            const start = parseYMDLocal(dateStr) ?? new Date();
            const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime();
            const dayEnd = dayStart + 24 * 3600 * 1000;
            const clS = Math.max(dayStart, Math.min(it.start, dayEnd));
            const clE = Math.max(dayStart + 10 * 60 * 1000, Math.min(it.end, dayEnd));
            const left = ((clS - dayStart) / (dayEnd - dayStart)) * 100;
            const width = ((clE - clS) / (dayEnd - dayStart)) * 100;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setSelectedIndex(i);
                  const el = itemRefs.current[i];
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className={`absolute top-0 h-full rounded ${i === selectedIndex ? "bg-blue-600" : "bg-blue-300/80"}`}
                style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                title={`Résultat ${i + 1}`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      </div>

      {/* Liste résultats + badges */}
      <div className="mt-4 space-y-3">
        {loadingRes ? (
          <>
            <div className="animate-pulse rounded border p-3"><div className="mb-2 h-4 w-24 rounded bg-gray-200" /></div>
            <div className="animate-pulse rounded border p-3"><div className="mb-2 h-4 w-24 rounded bg-gray-200" /></div>
            <div className="animate-pulse rounded border p-3"><div className="mb-2 h-4 w-24 rounded bg-gray-200" /></div>
          </>
        ) : errorRes ? (
          <div className="rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
            Erreur recherche — {errorRes} <button className="ml-2 underline" onClick={() => loadResults(dateStr)}>Réessayer</button>
          </div>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Aucun résultat pour cette date.</div>
        ) : (
          results.map((r, i) => {
            const selected = i === selectedIndex;
            return (
              <div
                key={i}
                ref={(el) => { itemRefs.current[i] = el; }}
                className={`rounded border p-3 transition ${selected ? "ring-2 ring-blue-400" : ""}`}
                onClick={() => setSelectedIndex(i)}
                role="button"
                aria-label={`Sélectionner le résultat ${i + 1}`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{Math.round(r.prix)} €</div>
                  <div className="flex items-center gap-2 text-xs">
                    {isBestPrice(r.prix) && <span className="rounded-full bg-green-600 px-2 py-0.5 text-white">Meilleur prix</span>}
                    {!isBestPrice(r.prix) && isGoodPrice(r.prix) && (
                      <span className="rounded-full bg-green-200 px-2 py-0.5 text-green-900">Bon prix</span>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {r.departText} → {r.arriveeText} · {r.dureeMin ? `${Math.floor(r.dureeMin / 60)} h ${r.dureeMin % 60} min` : "—"} ·{" "}
                  {typeof r.escales === "number" ? `${r.escales} escale(s)` : "—"}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Debug */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">API ping</a>
      </div>
    </main>
  );
}