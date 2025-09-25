// src/app/search/SearchClient.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Checkbox from "../components/ui/Checkbox";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import Alert from "../components/ui/Alert";
import CalendarGrid, { CalendarMap as CalMap, CalendarDay } from "../components/ui/CalendarGrid";
import TimelineBar from "../components/ui/TimelineBar";

/* ---------------------------
   Types & helpers
--------------------------- */

type CalendarMap = CalMap;

type SortKey = "price" | "duration" | "depart";
type ViewMode = "week" | "month";

type Flight = {
  prix: number; // > 0 (après filtrage)
  compagnie?: string;
  escales?: number;
  um_ok?: boolean;
  animal_ok?: boolean;
  departISO?: string;
  arriveeISO?: string;
  departText?: string;
  arriveeText?: string;
  dureeMin?: number;
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
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
    const now = new Date();
    const [h, m] = v.split(":").map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  }
  return undefined;
};
const parsePTdur = (pt?: string) => {
  if (!pt || typeof pt !== "string" || !pt.startsWith("PT")) return undefined;
  let h = 0, m = 0;
  const hm = pt.slice(2);
  const hMatch = hm.match(/(\d+)H/);
  const mMatch = hm.match(/(\d+)M/);
  if (hMatch) h = parseInt(hMatch[1], 10);
  if (mMatch) m = parseInt(mMatch[1], 10);
  return h * 60 + m;
};
const minutesDiff = (a?: Date, b?: Date) => {
  if (!a || !b) return undefined;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 60000));
};
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const fmtDateLocal = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYMDLocal = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
  return new Date(y, mm - 1, dd, 0, 0, 0, 0);
};

const frenchWeekLabels = ["L", "M", "M", "J", "V", "S", "D"];

function classifyPrice(prix: number | null, min: number, max: number) {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / (max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
}

/** Normalise un vol brut -> Flight (prix peut être NaN si invalide, filtré ensuite) */
function normalizeFlight(r: any): Flight {
  const rawPrice = typeof r?.prix === "number" ? r.prix : Number(r?.prix ?? NaN);
  const prix = Number.isFinite(rawPrice) && rawPrice > 0 ? Math.round(rawPrice) : NaN;

  const depISO =
    r?.depart_iso ??
    r?.departISO ??
    r?.heure_depart ??
    r?.vols?.[0]?.depart_iso ??
    r?.vols?.[0]?.departISO;
  const arrISO =
    r?.arrivee_iso ??
    r?.arriveeISO ??
    r?.heure_arrivee ??
    r?.vols?.[r?.vols?.length - 1]?.arrivee_iso ??
    r?.vols?.[r?.vols?.length - 1]?.arriveeISO;

  const dep = parseISOorLocal(depISO);
  const arr = parseISOorLocal(arrISO);

  const dureeMin =
    typeof r?.duree_minutes === "number"
      ? r.duree_minutes
      : parsePTdur(r?.duree) ?? minutesDiff(dep, arr);

  const compagnie =
    r?.compagnie ??
    (Array.isArray(r?.compagnies) && r.compagnies.length ? r.compagnies.join("/") : undefined);

  return {
    prix,
    compagnie,
    escales:
      typeof r?.escales === "number"
        ? r.escales
        : Array.isArray(r?.vols)
        ? Math.max(0, r.vols.length - 1)
        : undefined,
    um_ok: !!r?.um_ok,
    animal_ok: !!r?.animal_ok,
    departISO: dep ? dep.toISOString() : undefined,
    arriveeISO: arr ? arr.toISOString() : undefined,
    departText: dep ? toLocalHHMM(dep.toISOString()) : "—",
    arriveeText: arr ? toLocalHHMM(arr.toISOString()) : "—",
    dureeMin: dureeMin ?? undefined,
  };
}

/* ============================================================
   Composant principal
============================================================ */

export default function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();

  // états champs
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(params.get("destination") || "BCN");
  const initialDate = parseYMDLocal(params.get("date") || undefined) ?? new Date();
  const [dateStr, setDateStr] = useState<string>(fmtDateLocal(initialDate));
  const [sort, setSort] = useState<SortKey>((params.get("sort") as SortKey) || "price");
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUm] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");
  const [view, setView] = useState<ViewMode>((params.get("view") as ViewMode) || "month");

  // data
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [results, setResults] = useState<Flight[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);
  const [errorCal, setErrorCal] = useState<string | null>(null);
  const [errorRes, setErrorRes] = useState<string | null>(null);

  // sélection d’un résultat
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // mini-calendrier
  const [showMini, setShowMini] = useState(false);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // mois affiché
  const [monthCursor, setMonthCursor] = useState<Date>(() => initialDate);

  // min “pinné” par date
  const pinnedMinByDateRef = useRef<Record<string, number>>({});
  const [pinnedVersion, setPinnedVersion] = useState(0);

  // fermer le mini-calendrier au clic extérieur
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

  // URL partageable (client)
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
    return `/search?${p.toString()}`;
  }, [origin, destination, dateStr, sort, direct, um, pets, view]);

  // pousser l’URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    router.replace(currentShareURL as any);
  }, [router, currentShareURL]);

  /* ---------------------------
     FETCH calendrier
  --------------------------- */
  const loadCalendar = useCallback(async (cursor: Date) => {
    setLoadingCal(true);
    setErrorCal(null);
    try {
      const m = monthKey(cursor);
      const url =
        `/api/calendar?origin=${encodeURIComponent(origin)}` +
        `&destination=${encodeURIComponent(destination)}` +
        `&month=${m}` +
        (direct ? "&direct=1" : "") +
        (um ? "&um=1" : "") +
        (pets ? "&pets=1" : "");
      const r = await fetch(url, { cache: "no-store" });
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
  }, [origin, destination, direct, um, pets]);

  /* ---------------------------
     FETCH résultats
  --------------------------- */
  const loadResults = useCallback(async (dStr: string) => {
    setLoadingRes(true);
    setErrorRes(null);
    try {
      const url =
        `/api/search?origin=${encodeURIComponent(origin)}` +
        `&destination=${encodeURIComponent(destination)}` +
        `&date=${dStr}` +
        (direct ? "&direct=1" : "") +
        (um ? "&um=1" : "") +
        (pets ? "&pets=1" : "");
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const raw = await r.json();

      let list: Flight[] = Array.isArray(raw?.results) ? raw.results.map(normalizeFlight) : [];
      list = list.filter(x => Number.isFinite(x.prix) && x.prix > 0);
      if (direct) list = list.filter(x => (x.escales ?? 0) === 0);

      list.sort((a, b) => {
        if (sort === "price") return a.prix - b.prix;
        if (sort === "duration") return (a.dureeMin ?? 9e9) - (b.dureeMin ?? 9e9);
        const ad = parseISOorLocal(a.departISO)?.getTime() ?? 9e13;
        const bd = parseISOorLocal(b.departISO)?.getTime() ?? 9e13;
        return ad - bd;
      });

      if (list.length) {
        const dayMin = Math.min(...list.map(x => x.prix));
        if (!Number.isNaN(dayMin) && dayMin > 0) {
          pinnedMinByDateRef.current[dStr] = dayMin;
          setPinnedVersion(v => v + 1);
          setCalendar(prev => ({ ...prev }));
        }
      }

      setResults(list);
    } catch (e: any) {
      setResults([]);
      setErrorRes(e?.message || "Erreur recherche");
    } finally {
      setLoadingRes(false);
    }
  }, [origin, destination, direct, um, pets, sort]);

  // init / rafraîchissements
  useEffect(() => {
    loadCalendar(parseYMDLocal(dateStr) ?? new Date());
  }, [loadCalendar, dateStr]);

  useEffect(() => {
    loadResults(dateStr);
  }, [loadResults, dateStr]);

  // sélection auto 1er résultat
  useEffect(() => {
    if (results.length === 0) setSelectedIndex(-1);
    else if (selectedIndex < 0 || selectedIndex >= results.length) setSelectedIndex(0);
  }, [results, selectedIndex]);

  /* ---------------------------
     Calendrier affiché = union(pinned, calendar)
  --------------------------- */
  const displayCalendar: CalendarMap = useMemo(() => {
    const unionKeys = new Set<string>([
      ...Object.keys(calendar),
      ...Object.keys(pinnedMinByDateRef.current),
    ]);
    const out: CalendarMap = {};
    for (const key of unionKeys) {
      const base = calendar[key];
      const hasPinned = Object.prototype.hasOwnProperty.call(pinnedMinByDateRef.current, key);
      const pinnedVal = hasPinned ? pinnedMinByDateRef.current[key] : undefined;

      let prix: number | null = null;
      if (typeof pinnedVal === "number" && pinnedVal > 0) prix = pinnedVal;
      else if (typeof base?.prix === "number") prix = base!.prix!;
      else prix = null;

      const disponible = base?.disponible ?? (prix != null);
      out[key] = { prix, disponible };
    }
    return out;
  }, [calendar, pinnedVersion]);

  const calStats = useMemo(() => {
    const values = Object.values(displayCalendar)
      .map(d => d.prix)
      .filter((x): x is number => typeof x === "number");
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { min, max };
  }, [displayCalendar]);

  /* ---------------------------
     Semaine, timeline, liste
  --------------------------- */
  const fmtDate = (d: Date) => fmtDateLocal(d);

  const selectDay = (d: Date) => {
    const s = fmtDate(d);
    setDateStr(s);
    setMonthCursor(d);
  };

  const weekDays = useMemo(() => {
    const base = parseYMDLocal(dateStr) ?? new Date();
    const js = (base.getDay() + 6) % 7; // lundi=0
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
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    return days;
  }, [monthCursor]);

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

  const timelineItems = results.map(r => {
    const dep = parseISOorLocal(r.departISO || "");
    const arr = parseISOorLocal(r.arriveeISO || "");
    const s = dep ? dep.getTime() : (parseYMDLocal(dateStr)?.getTime() ?? Date.now()) + 8*3600*1000;
    const e = arr ? arr.getTime() : s + (r.dureeMin ?? 120) * 60000;
    return { start: s, end: e };
  });

  /* ---------------------------
     UI
  --------------------------- */
  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Comparateur — vols</h1>

      {/* Formulaire */}
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
            <div
              ref={miniRef}
              style={{ position: "absolute", zIndex: 50, marginTop: 6, width: 320 }}
              className="rounded-lg border bg-white p-3 shadow"
            >
              <div className="mb-2 flex items-center justify-between">
                <Button variant="outline" onClick={goPrevMonth} type="button">◀</Button>
                <div className="text-sm font-medium">
                  {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </div>
                <Button variant="outline" onClick={goNextMonth} type="button">▶</Button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
                {frenchWeekLabels.map((w, i) => (<div key={`mini-lab-${i}`}>{w}</div>))}
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
                    >
                      <div className="text-[11px]">{d.getDate()}</div>
                      {(() => {
                        const info = displayCalendar[fmtDateLocal(d)];
                        const val = info?.prix ?? null;
                        const tone = classifyPrice(val, calStats.min, calStats.max);
                        const bg =
                          tone === "low" ? "bg-green-200"
                          : tone === "mid" ? "bg-yellow-200"
                          : tone === "empty" ? "bg-gray-200"
                          : "bg-rose-200";
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
          <select
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée croissante</option>
            <option value="depart">Heure de départ (croiss.)</option>
          </select>
        </div>

        <div className="flex items-end justify-between gap-2 md:col-span-1">
          <div className="flex flex-col gap-1 text-sm">
            <Checkbox checked={direct} onChange={(e) => setDirect(e.target.checked)} label="Direct" />
            <Checkbox checked={um} onChange={(e) => setUm(e.target.checked)} label="UM" />
            <Checkbox checked={pets} onChange={(e) => setPets(e.target.checked)} label="Animaux" />
          </div>
          <Button type="submit">Rechercher</Button>
        </div>
      </form>

      {/* Légende + actions */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-200 ring-1 ring-green-400" />
            pas cher
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-yellow-200 ring-1 ring-yellow-400" />
            moyen
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-rose-200 ring-1 ring-rose-400" />
            cher
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="rounded border">
            <button
              className={`px-3 py-1 ${view === "week" ? "bg-black text-white" : ""}`}
              onClick={() => setView("week")}
              type="button"
            >
              Semaine
            </button>
            <button
              className={`px-3 py-1 ${view === "month" ? "bg-black text-white" : ""}`}
              onClick={() => setView("month")}
              type="button"
            >
              Mois
            </button>
          </div>
          <button
            onClick={async () => {
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
            }}
            type="button"
            className="rounded border px-3 py-1"
            title="Partager"
          >
            🔗 Partager
          </button>
        </div>
      </div>

      {/* Calendriers */}
      {loadingCal ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Chargement du calendrier…
          <div className="mt-3 grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] sm:h-[84px] md:h-[96px]" />
            ))}
          </div>
        </div>
      ) : errorCal ? (
        <div className="mt-3">
          <Alert kind="error" title="Erreur calendrier">
            {errorCal} — <button className="underline" onClick={() => loadCalendar(monthCursor)}>Réessayer</button>
          </Alert>
        </div>
      ) : view === "week" ? (
        <>
          <div className="mt-4">
            <div className="mb-2 grid grid-cols-7 gap-3 text-center text-xs text-gray-500">
              {frenchWeekLabels.map((w, i) => <div key={`wlab-${i}`}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-3">
              {weekDays.map((d) => (
                <button
                  key={fmtDateLocal(d)}
                  onClick={() => selectDay(d)}
                  className={[
                    "rounded border transition hover:shadow",
                    "h-[72px] sm:h-[84px] md:h-[96px]",
                    "flex flex-col justify-between px-2 py-2",
                    fmtDateLocal(d) === dateStr ? "ring-2 ring-blue-400" : "",
                  ].join(" ")}
                >
                  <div className={`text-sm ${fmtDateLocal(d) === dateStr ? "font-semibold" : ""}`}>{d.getDate()}</div>
                  <div>
                    {(() => {
                      const info = displayCalendar[fmtDateLocal(d)];
                      const val = info?.prix ?? null;
                      const tone = classifyPrice(val, calStats.min, calStats.max);
                      const cls =
                        tone === "low" ? "price-low"
                        : tone === "mid" ? "price-mid"
                        : tone === "empty" ? "price-empty"
                        : "price-high";
                      return <div className={`rounded border px-6 py-6 text-center text-xl font-medium ${cls}`}>{val == null ? "—" : `${val} €`}</div>;
                    })()}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <CalendarGrid
          monthCursor={monthCursor}
          data={displayCalendar}
          stats={calStats}
          selectedDate={dateStr}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
          onSelect={selectDay}
        />
      )}

      {/* Timeline + résultats */}
      <TimelineBar items={timelineItems} selectedIndex={selectedIndex} onSelect={(i) => {
        setSelectedIndex(i);
        const el = itemRefs.current[i];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }} />

      <div className="mt-4 space-y-3">
        {loadingRes ? (
          <>
            <Skeleton className="h-[88px]" />
            <Skeleton className="h-[88px]" />
            <Skeleton className="h-[88px]" />
          </>
        ) : errorRes ? (
          <Alert kind="error" title="Erreur recherche">
            {errorRes} — <button className="underline" onClick={() => loadResults(dateStr)}>Réessayer</button>
          </Alert>
        ) : results.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            Aucun résultat pour cette date (ou pas encore de recherche).
          </div>
        ) : (
          results.map((r, i) => {
            const directBadge = typeof r.escales === "number" ? r.escales === 0 : false;
            const selected = i === selectedIndex;
            return (
              <Card
                key={i}
                className={`transition ${selected ? "ring-2 ring-blue-400" : ""}`}
                ref={(el: any) => { itemRefs.current[i] = el; }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold">{Math.round(r.prix)} €</div>
                  <div className="text-sm text-gray-600">{r.compagnie || "—"}</div>
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  {r.departText} → {r.arriveeText} ·{" "}
                  {r.dureeMin ? `${Math.floor(r.dureeMin / 60)} h ${r.dureeMin % 60} min` : "—"} ·{" "}
                  {typeof r.escales === "number" ? `${r.escales} escale(s)` : "—"}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{directBadge ? "Direct" : "Avec escale(s)"}</Badge>
                  <Badge>🧒 UM</Badge>
                  <Badge>🐾 Animaux</Badge>
                </div>
                <div className="mt-2">
                  <Button variant="outline" onClick={() => { setSelectedIndex(i); }}>Sélectionner</Button>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* petit lien debug */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">API ping</a>
      </div>
    </main>
  );
}