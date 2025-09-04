// comparateur2/src/app/search/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

type CalEntry = { prix: number | null; disponible: boolean; flights?: any[] };
type Segment = {
  mode?: string;
  carrier?: string;
  from?: string;
  to?: string;
  dep?: string;
  arr?: string;
  duration_minutes?: number;
};
type Offer = {
  prix: number;
  duree_totale_minutes: number;
  escales: number;
  segments: Segment[];
  um_ok: boolean;
  animal_ok: boolean;
};

function two(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toYMD(d: Date) { return `${d.getFullYear()}-${two(d.getMonth()+1)}-${two(d.getDate())}`; }
function minutesToHhMm(min: number) { const h = Math.floor(min/60); const m = min%60; return `${h}h ${m.toString().padStart(2,"0")}m`; }

export default function SearchPage() {
  // Recherche / état
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState<string>(() => toYMD(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(date);

  // Calendrier
  const [currentMonth, setCurrentMonth] = useState<string>(() => date.slice(0,7));
  const [calendar, setCalendar] = useState<Record<string, CalEntry>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // UI
  const [showMini, setShowMini] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<"month" | "week">("month");

  // Résultats
  const [results, setResults] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // filtres
  const [nonstop, setNonstop] = useState<null | boolean>(null);
  const [requireUM, setRequireUM] = useState(false);
  const [requireAnimal, setRequireAnimal] = useState(false);
  const [sort, setSort] = useState<"price" | "duration">("price");

  // close mini if click outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setShowMini(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // month helpers
  const year = useMemo(() => Number(currentMonth.split("-")[0]), [currentMonth]);
  const monthIndex = useMemo(() => Number(currentMonth.split("-")[1]) - 1, [currentMonth]);
  const daysInMonth = useMemo(() => new Date(year, monthIndex+1, 0).getDate(), [year, monthIndex]);
  const firstWeekday = useMemo(() => new Date(year, monthIndex, 1).getDay(), [year, monthIndex]);
  const daysThisMonth = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(`${year}-${String(monthIndex+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
    return out;
  }, [year, monthIndex, daysInMonth]);

  // week around selected date
  const weekAround = useMemo(() => {
    const center = selectedDate ? new Date(selectedDate) : new Date(year, monthIndex, 15);
    const out: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center);
      d.setDate(center.getDate() + i);
      out.push(toYMD(d));
    }
    return out;
  }, [selectedDate, year, monthIndex]);

  // price stats for color quantiles
  const priceStats = useMemo(() => {
    const vals = Object.values(calendar).filter(c=>c.disponible && typeof c.prix === "number").map(c=>c.prix as number).sort((a,b)=>a-b);
    if (vals.length === 0) return null;
    const q1 = vals[Math.max(0, Math.floor(vals.length * 0.33))];
    const q2 = vals[Math.max(0, Math.floor(vals.length * 0.66))];
    return {min: vals[0], max: vals[vals.length-1], q1, q2};
  }, [calendar]);

  const priceClass = (p: number | null, disponible: boolean) => {
    if (!disponible || p == null) return "bg-gray-200 border-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
    if (!priceStats) return "bg-gray-50 dark:bg-neutral-800";
    if (p <= priceStats.q1) return "bg-green-100 border-green-300 text-green-800 dark:bg-green-900 dark:text-green-200";
    if (p <= priceStats.q2) return "bg-yellow-100 border-amber-300 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    return "bg-red-100 border-rose-300 text-rose-800 dark:bg-rose-900 dark:text-rose-200";
  };

  // --- API calls
  const fetchCalendar = async (month: string) => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const params = new URLSearchParams({ origin, destination, month, sort });
      if (nonstop !== null) params.set("nonstop", String(nonstop));
      if (requireUM) params.set("require_um", "true");
      if (requireAnimal) params.set("require_animal", "true");
      const res = await fetch(`${API_BASE}/calendar?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const raw = json.calendar ?? json;
      const normalized: Record<string, CalEntry> = {};
      if (raw && typeof raw === "object") {
        for (const [k, v] of Object.entries(raw)) {
          const entry: any = v ?? {};
          const prix = entry.prix ?? entry.price ?? entry.min_price ?? null;
          const disponible = entry.disponible ?? entry.available ?? (prix !== null && prix !== undefined);
          normalized[k] = { prix: typeof prix === "number" ? prix : prix ? Number(prix) : null, disponible: !!disponible, flights: entry.flights ?? undefined };
        }
      }
      setCalendar(normalized);
    } catch (e) {
      console.error("fetchCalendar", e);
      setCalendarError("Impossible de charger le calendrier (backend inaccessible).");
      setCalendar({});
    } finally {
      setCalendarLoading(false);
    }
  };

  const searchFlights = async (when: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ origin, destination, date: when, sort });
      if (nonstop !== null) params.set("nonstop", String(nonstop));
      if (requireUM) params.set("require_um", "true");
      if (requireAnimal) params.set("require_animal", "true");
      const res = await fetch(`${API_BASE}/search?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const arr = json.results ?? json ?? [];
      setResults(Array.isArray(arr) ? arr : []);
      setSelectedDate(when);
      setDate(when);
      setCurrentMonth(when.slice(0,7));
    } catch (e) {
      console.error("searchFlights", e);
      setError("Impossible de charger les résultats (backend inaccessible).");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // initial calendar load & reactive
  useEffect(() => {
    fetchCalendar(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination, currentMonth, nonstop, requireUM, requireAnimal, sort]);

  // UI handlers
  const handlePickDay = async (d: string) => {
    const info = calendar[d];
    if (!info || !info.disponible) return;
    setShowMini(false);
    await searchFlights(d);
  };

  const prevMonth = () => { const d = new Date(year, monthIndex - 1, 1); setCurrentMonth(`${d.getFullYear()}-${two(d.getMonth()+1)}`); };
  const nextMonth = () => { const d = new Date(year, monthIndex + 1, 1); setCurrentMonth(`${d.getFullYear()}-${two(d.getMonth()+1)}`); };
  const prevWeek = () => { if (!selectedDate) return; const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(toYMD(d)); setCurrentMonth(toYMD(d).slice(0,7)); };
  const nextWeek = () => { if (!selectedDate) return; const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(toYMD(d)); setCurrentMonth(toYMD(d).slice(0,7)); };

  // Renders
  const renderMiniCalendar = () => (
    <div className="absolute z-40 mt-2 p-2 bg-white dark:bg-gray-900 border rounded shadow w-64">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{currentMonth}</div>
        <div className="flex gap-1">
          <button className="px-2 py-1 border rounded text-xs" onClick={prevMonth}>‹</button>
          <button className="px-2 py-1 border rounded text-xs" onClick={nextMonth}>›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {daysThisMonth.map(d => {
          const info = calendar[d] ?? { prix: null, disponible: false };
          const dayNum = d.slice(-2);
          const cls = priceClass(info.prix, info.disponible);
          const isSelected = selectedDate === d;
          return (
            <button key={d} onClick={() => handlePickDay(d)} disabled={!info.disponible}
              className={`p-1 rounded flex flex-col items-center justify-center ${cls} ${isSelected ? "ring-2 ring-blue-500" : ""} ${!info.disponible ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}`}>
              <div className="text-xs font-medium dark:text-neutral-200">{Number(dayNum)}</div>
              <div className="text-sm font-bold mt-0.5 text-indigo-700 dark:text-indigo-200">
  {info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)}€` : "--"}
</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <button className="px-2 py-1 border rounded" onClick={() => setShowMini(false)}>Fermer</button>
        <button className="px-2 py-1 border rounded" onClick={() => { setShowMini(false); setView("month"); }}>Voir mois</button>
      </div>
    </div>
  );

  const renderMonthView = () => {
    const blanks = (firstWeekday + 6) % 7;
    const cells: JSX.Element[] = [];
    for (let i = 0; i < blanks; i++) cells.push(<div key={`b-${i}`} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, monthIndex, day);
      const ymd = toYMD(d);
      const info = calendar[ymd];
      const isSelected = selectedDate === ymd;
      const cls = info ? priceClass(info.prix, info.disponible) : "bg-gray-100 dark:bg-neutral-800 text-gray-400";
      cells.push(
        <button key={ymd} onClick={() => handlePickDay(ymd)} disabled={!info || !info.disponible}
          className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${isSelected ? "ring-4 ring-blue-500" : ""} ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}>
          <span className="text-sm font-semibold dark:text-neutral-100">{day}</span>
          <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">{info && info.disponible ? `${Math.round(info.prix)} €` : "—"}</span>
        </button>
      );
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-2 py-1 border rounded">◀</button>
            <div className="font-semibold">{currentMonth}</div>
            <button onClick={nextMonth} className="px-2 py-1 border rounded">▶</button>
          </div>
        </div>
        {calendarLoading ? <div className="p-4 text-sm text-gray-600 dark:text-neutral-300">Chargement du calendrier…</div> :
          calendarError ? <p className="text-red-600 dark:text-rose-300">{calendarError}</p> :
          <div className="grid grid-cols-7 gap-2">{cells}</div>}
      </div>
    );
  };

  const renderWeekView = () => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="px-2 py-1 border rounded">◀ Semaine</button>
          <div className="font-semibold">Semaine autour de {selectedDate ?? "—"}</div>
          <button onClick={nextWeek} className="px-2 py-1 border rounded">Semaine ▶</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekAround.map(ymd => {
          const info = calendar[ymd];
          const d = new Date(ymd);
          const isSelected = selectedDate === ymd;
          const cls = info ? priceClass(info.prix, info.disponible) : "bg-gray-100 dark:bg-neutral-800 text-gray-400";
          return (
            <button key={ymd} onClick={() => handlePickDay(ymd)} disabled={!info || !info.disponible}
              className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${isSelected ? "ring-4 ring-blue-500" : ""} ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}>
              <span className="text-sm font-semibold dark:text-neutral-100">{d.getDate()}</span>
              <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">{info && info.disponible ? `${Math.round(info.prix)} €` : "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderOfferCard = (o: Offer, idx: number) => {
    const first = o.segments[0];
    const last = o.segments[o.segments.length - 1];
    const carriers = Array.from(new Set(o.segments.map(s => s.carrier))).join(", ");
    return (
      <div key={idx} className="p-4 rounded-xl border bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-semibold">{first?.from} → {last?.to} <span className="text-sm text-gray-500">• {o.escales} escale(s)</span></div>
          <div className="text-2xl font-bold text-indigo-800 dark:text-indigo-200">{o.prix.toFixed(0)} €</div>
        </div>
        <div className="text-sm text-gray-600 dark:text-neutral-300">Compagnies : {carriers}</div>
        <div className="mt-2 text-sm text-gray-700 dark:text-neutral-200">
          {first?.dep ? new Date(first.dep).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : ""} — {last?.arr ? new Date(last.arr).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}) : ""} • {minutesToHhMm(o.duree_totale_minutes)}
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {o.segments.map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{s.from}</div>
                <div className="text-xs text-gray-500 dark:text-neutral-400">{s.dep?.slice(11,16) ?? ""}</div>
              </div>
              <div className="text-xs text-gray-500 dark:text-neutral-400">→ {s.duration_minutes ? minutesToHhMm(s.duration_minutes) : ""}</div>
              <div className="text-right">
                <div className="font-medium">{s.to}</div>
                <div className="text-xs text-gray-500 dark:text-neutral-400">{s.arr?.slice(11,16) ?? ""}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-3 items-center">
          <div className={`px-2 py-0.5 rounded border ${o.um_ok ? "bg-green-50 border-green-300 dark:bg-green-900 dark:text-green-200" : "bg-rose-50 border-rose-300 dark:bg-rose-900 dark:text-rose-200 line-through"}`}>🧒 UM</div>
          <div className={`px-2 py-0.5 rounded border ${o.animal_ok ? "bg-green-50 border-green-300 dark:bg-green-900 dark:text-green-200" : "bg-rose-50 border-rose-300 dark:bg-rose-900 dark:text-rose-200 line-through"}`}>🐶 Animaux</div>
          <div className="ml-auto text-sm text-gray-500 dark:text-neutral-400">{o.duree_totale_minutes ? minutesToHhMm(o.duree_totale_minutes) : ""}</div>
        </div>
      </div>
    );
  };

  // JSX main
  return (
    <main className="p-5 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Comparateur — vols</h1>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end" ref={wrapperRef}>
        <div>
          <label className="text-sm text-gray-600 dark:text-neutral-300">Origine</label>
          <input className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white" value={origin} onChange={(e)=>setOrigin(e.target.value.toUpperCase())}/>
        </div>

        <div>
          <label className="text-sm text-gray-600 dark:text-neutral-300">Destination</label>
          <input className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white" value={destination} onChange={(e)=>setDestination(e.target.value.toUpperCase())}/>
        </div>

        <div className="relative">
          <label className="text-sm text-gray-600 dark:text-neutral-300">Date</label>
          <input className="border p-2 rounded w-full cursor-pointer dark:bg-neutral-800 dark:text-white" value={date} readOnly onClick={() => { setShowMini(s=>!s); setCurrentMonth(date.slice(0,7)); }} />
          {showMini && renderMiniCalendar()}
        </div>

        <div>
          <label className="text-sm text-gray-600 dark:text-neutral-300">Tri</label>
          <select className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white" value={sort} onChange={(e)=>setSort(e.target.value as any)}>
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>

        <div>
          <button className="w-full bg-blue-600 text-white p-2 rounded flex items-center justify-center gap-2" onClick={() => { setSelectedDate(date); void searchFlights(date); }}>
            {loading && <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Rechercher
          </button>
        </div>
      </div>

      {/* filtres */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={nonstop===null} onChange={()=>setNonstop(null)} /> Tous</label>
        <label className="flex items-center gap-1"><input type="radio" checked={nonstop===true} onChange={()=>setNonstop(true)} /> Sans escale</label>
        <label className="flex items-center gap-1"><input type="radio" checked={nonstop===false} onChange={()=>setNonstop(false)} /> Avec escales</label>

        <label className="ml-4 flex items-center gap-1"><input type="checkbox" checked={requireUM} onChange={(e)=>setRequireUM(e.target.checked)} /> UM requis</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={requireAnimal} onChange={(e)=>setRequireAnimal(e.target.checked)} /> Animaux OK</label>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={()=>setView("month")} className={`px-3 py-1 rounded border ${view==="month" ? "bg-black text-white" : ""}`}>Mois</button>
          <button onClick={()=>setView("week")} className={`px-3 py-1 rounded border ${view==="week" ? "bg-black text-white" : ""}`}>Semaine</button>
        </div>
      </div>

      <div className="mt-4">
        {view === "month" ? renderMonthView() : renderWeekView()}
      </div>

      <div className="mt-6">
        {error && <div className="text-red-600 dark:text-rose-300">{error}</div>}
        {results.length === 0 ? (
          <div className="text-gray-600 dark:text-neutral-400">Aucun résultat pour cette date.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">{results.map(renderOfferCard)}</div>
        )}
      </div>
    </main>
  );
}