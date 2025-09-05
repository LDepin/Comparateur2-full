"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CalendarEntry = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarEntry>;

type Flight = {
  compagnie: string;
  prix: number;
  depart: string;
  arrivee: string;
  heure_depart: string; // ISO
  heure_arrivee: string; // ISO
  duree: string; // ex: PT1H40M
  escales: number;
  um_ok: boolean;
  animal_ok: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

// utils
const pad2 = (n: number) => String(n).padStart(2, "0");
const toYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const fromYMD = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const isoDateInput = (ymd: string) => ymd; // on garde YYYY-MM-DD

function durationToHuman(iso: string) {
  // très simple: PT#H#M => #h ##m
  const h = /(\d+)H/.exec(iso)?.[1];
  const m = /(\d+)M/.exec(iso)?.[1];
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return iso;
}

export default function SearchPage() {
  // formulaire
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState("2025-09-15");

  // résultats vols
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // tri / filtres simples
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [stopsFilter, setStopsFilter] = useState<"all" | "direct" | "withstops">("all");

  // calendrier
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [view, setView] = useState<"month" | "week">("month");
  const [showMini, setShowMini] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>("2025-09-15");

  // mois courant pour le grand & mini calendrier
  const [currentMonth, setCurrentMonth] = useState("2025-09");

  // refs pour fermer le mini-cal au clic à l’extérieur
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // close mini on click-out / escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setShowMini(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowMini(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // extraire année/mois
  const year = useMemo(() => Number(currentMonth.split("-")[0]), [currentMonth]);
  const monthIndex = useMemo(() => Number(currentMonth.split("-")[1]) - 1, [currentMonth]);
  const daysInMonth = useMemo(() => new Date(year, monthIndex + 1, 0).getDate(), [year, monthIndex]);
  const firstWeekday = useMemo(() => new Date(year, monthIndex, 1).getDay(), [year, monthIndex]); // 0=dimanche

  // bornes de prix pour colorer
  const prices = useMemo(() => {
    const arr = Object.values(calendar)
      .map((v) => (typeof v.prix === "number" ? v.prix : null))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b);
    return arr;
  }, [calendar]);

  const pMin = prices.length ? prices[0] : null;
  const pMax = prices.length ? prices[prices.length - 1] : null;

  function priceClass(value: number | null, disponible: boolean) {
    if (!disponible || value === null || pMin === null || pMax === null) {
      return "bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-neutral-400";
    }
    if (pMax === pMin) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    const ratio = (value - pMin) / (pMax - pMin);
    if (ratio < 0.33) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    if (ratio < 0.66) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200";
    return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200";
  }

  // fetch calendar pour currentMonth
  const fetchCalendar = async (month: string) => {
    try {
      setCalendarError(null);
      setCalendarLoading(true);
      const res = await fetch(
        `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&month=${encodeURIComponent(month)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { calendar: CalendarMap };
      setCalendar(data.calendar || {});
    } catch (e: any) {
      setCalendarError("Impossible de charger le calendrier.");
      setCalendar({});
    } finally {
      setCalendarLoading(false);
    }
  };

  // charge calendrier au changement de mois, d’OD, ou à l’ouverture du mini
  useEffect(() => {
    fetchCalendar(currentMonth).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, origin, destination]);

  // semaine autour de selectedDate (±3 jours)
  const weekAround = useMemo(() => {
    const base = selectedDate ? fromYMD(selectedDate) : fromYMD(date);
    const list: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      list.push(toYMD(d));
    }
    return list;
  }, [selectedDate, date]);

  // recherche vols
  const searchFlights = async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&date=${encodeURIComponent(d)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: Flight[] };
      let rows = data.results || [];

      // filtre escales
      if (stopsFilter === "direct") rows = rows.filter((r) => r.escales === 0);
      if (stopsFilter === "withstops") rows = rows.filter((r) => r.escales > 0);

      // tri
      if (sort === "price") rows = rows.slice().sort((a, b) => a.prix - b.prix);
      if (sort === "duration") {
        const dur = (iso: string) => {
          const h = /(\d+)H/.exec(iso)?.[1];
          const m = /(\d+)M/.exec(iso)?.[1];
          return (h ? parseInt(h) * 60 : 0) + (m ? parseInt(m) : 0);
        };
        rows = rows.slice().sort((a, b) => dur(a.duree) - dur(b.duree));
      }

      setResults(rows);
    } catch (e: any) {
      setError("Échec de la recherche.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // submit formulaire
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = selectedDate || date;
    setDate(d);
    await searchFlights(d);
  };

  // navigation mois
  const nextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };
  const prevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, (m || 1) - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  };

  // navigation semaine
  const nextWeek = () => {
    const base = selectedDate ? fromYMD(selectedDate) : fromYMD(date);
    base.setDate(base.getDate() + 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    setDate(ymd);
    setCurrentMonth(ymd.slice(0, 7));
    void searchFlights(ymd);
  };
  const prevWeek = () => {
    const base = selectedDate ? fromYMD(selectedDate) : fromYMD(date);
    base.setDate(base.getDate() - 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    setDate(ymd);
    setCurrentMonth(ymd.slice(0, 7));
    void searchFlights(ymd);
  };

  // choix d’un jour
  const handlePickDay = (ymd: string) => {
    setSelectedDate(ymd);
    setDate(ymd);
    void searchFlights(ymd);
  };

  // mini calendrier (ouvert en cliquant le champ date)
  const daysThisMonth = useMemo(() => {
    const arr: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      arr.push(`${currentMonth}-${pad2(d)}`);
    }
    return arr;
  }, [currentMonth, daysInMonth]);

  const renderMiniCalendar = () => (
    <div className="absolute z-40 mt-2 p-2 bg-white dark:bg-neutral-900 border rounded shadow w-72">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{currentMonth}</div>
        <div className="flex gap-1">
          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={prevMonth}>
            ‹
          </button>
          <button type="button" className="px-2 py-1 border rounded text-xs" onClick={nextMonth}>
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {daysThisMonth.map((d) => {
          const info = calendar[d] ?? { prix: null, disponible: false };
          const cls = priceClass(info.prix, info.disponible);
          const isSelected = selectedDate === d;
          return (
            <button
              type="button"
              key={d}
              onClick={() => handlePickDay(d)}
              disabled={!info.disponible}
              className={`h-16 rounded border flex flex-col items-center justify-center ${cls} ${
                isSelected ? "ring-2 ring-blue-500" : ""
              } ${!info.disponible ? "opacity-60 cursor-not-allowed" : "hover:opacity-95"}`}
            >
              <div className="text-xs font-medium">{Number(d.slice(-2))}</div>
              <div className="text-sm font-extrabold mt-0.5">
                {info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)}€` : "—"}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs">
        <button type="button" className="px-2 py-1 border rounded" onClick={() => setShowMini(false)}>
          Fermer
        </button>
        <button
          type="button"
          className="px-2 py-1 border rounded"
          onClick={() => {
            setShowMini(false);
            setView("month");
          }}
        >
          Voir mois
        </button>
      </div>
    </div>
  );

  // vue mois (grande grille)
  const renderMonthView = () => {
    const blanks = (firstWeekday + 6) % 7;
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < blanks; i++) cells.push(<div key={`b-${i}`} />);
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, monthIndex, day);
      const ymd = toYMD(d);
      const info = calendar[ymd];
      const isSelected = selectedDate === ymd;
      const cls = info ? priceClass(info.prix, info.disponible) : "bg-gray-100 dark:bg-neutral-800 text-gray-400";
      cells.push(
        <button
          type="button"
          key={ymd}
          onClick={() => handlePickDay(ymd)}
          disabled={!info || !info.disponible}
          className={`h-24 rounded border flex flex-col items-center justify-center ${cls} ${
            isSelected ? "ring-4 ring-blue-500" : ""
          } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
        >
          <span className="text-sm font-semibold">{day}</span>
          <span className="text-base font-extrabold mt-1">
            {info && info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
          </span>
        </button>
      );
    }
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={prevMonth} className="px-2 py-1 border rounded">
              ◀
            </button>
            <div className="font-semibold">{currentMonth}</div>
            <button type="button" onClick={nextMonth} className="px-2 py-1 border rounded">
              ▶
            </button>
          </div>
        </div>
        {calendarLoading ? (
          <div className="p-4 text-sm text-gray-600 dark:text-neutral-300">Chargement du calendrier…</div>
        ) : calendarError ? (
          <p className="text-red-600 dark:text-rose-300">{calendarError}</p>
        ) : (
          <div className="grid grid-cols-7 gap-2">{cells}</div>
        )}
      </div>
    );
  };

  // vue semaine (±3 jours)
  const renderWeekView = () => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevWeek} className="px-2 py-1 border rounded">
            ◀ Semaine
          </button>
          <div className="font-semibold">Semaine autour de {selectedDate ?? "—"}</div>
          <button type="button" onClick={nextWeek} className="px-2 py-1 border rounded">
            Semaine ▶
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekAround.map((ymd) => {
          const info = calendar[ymd];
          const d = fromYMD(ymd);
          const cls = info ? priceClass(info.prix, info.disponible) : "bg-gray-100 dark:bg-neutral-800 text-gray-400";
          const isSelected = selectedDate === ymd;
          return (
            <button
              type="button"
              key={ymd}
              onClick={() => handlePickDay(ymd)}
              disabled={!info || !info.disponible}
              className={`h-24 rounded border flex flex-col items-center justify-center ${cls} ${
                isSelected ? "ring-4 ring-blue-500" : ""
              } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
            >
              <span className="text-sm font-semibold">{d.getDate()}</span>
              <span className="text-base font-extrabold mt-1">
                {info && info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // résultats en cartes
  const renderResults = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-300">
          <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Recherche…
        </div>
      );
    }
    if (error) return <p className="text-red-600 dark:text-rose-300">{error}</p>;
    if (!results.length) return <p className="text-sm text-gray-500">Aucun résultat pour cette date.</p>;

    return (
      <ul className="grid gap-3">
        {results.map((r, i) => (
          <li key={i} className="rounded border p-3 bg-white dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold mb-1">
                  {r.depart} → {r.arrivee} • {r.compagnie}
                </div>
                <div className="text-xs text-gray-600 dark:text-neutral-300">
                  Départ {new Date(r.heure_depart).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — Arrivée{" "}
                  {new Date(r.heure_arrivee).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • Durée {durationToHuman(r.duree)} •{" "}
                  {r.escales === 0 ? "Direct" : `${r.escales} escale(s)`}
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      r.um_ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200 line-through"
                    }`}
                  >
                    👶 UM
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded border ${
                      r.animal_ok ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200 line-through"
                    }`}
                  >
                    🐾 Animaux
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold">{Math.round(r.prix)} €</div>
                <button className="mt-1 text-xs px-2 py-1 border rounded">Voir</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <main className="p-4 max-w-5xl mx-auto text-gray-900 dark:text-neutral-100">
      <h1 className="text-2xl font-bold mb-4">Comparateur — vols</h1>

      <form onSubmit={handleSubmit} className="grid md:grid-cols-5 gap-2 items-end">
        <div className="grid gap-1">
          <label className="text-xs">Origine</label>
          <input
            className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="ex: PAR"
          />
        </div>
        <div className="grid gap-1">
          <label className="text-xs">Destination</label>
          <input
            className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="ex: BCN"
          />
        </div>

        <div className="grid gap-1 relative" ref={wrapperRef}>
          <label className="text-xs">Date</label>
          <input
            type="text"
            className="border p-2 rounded dark:bg-neutral-800 dark:text-white cursor-pointer"
            onFocus={() => setShowMini(true)}
            onClick={() => setShowMini(true)}
            value={isoDateInput(selectedDate || date)}
            readOnly
          />
          {showMini && renderMiniCalendar()}
        </div>

        <div className="grid gap-1">
          <label className="text-xs">Tri</label>
          <select
            className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={sort}
            onChange={(e) => setSort(e.target.value as "price" | "duration")}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded flex items-center justify-center gap-2"
          onClick={() => {
            const d = selectedDate || date;
            setDate(d);
          }}
        >
          {loading && <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Rechercher
        </button>
      </form>

      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs">Vols :</label>
        <select
          className="border p-1 rounded text-sm dark:bg-neutral-800 dark:text-white"
          value={stopsFilter}
          onChange={(e) => setStopsFilter(e.target.value as any)}
        >
          <option value="all">Tous vols</option>
          <option value="direct">Sans escale</option>
          <option value="withstops">Avec escale(s)</option>
        </select>

        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className={`px-3 py-1 rounded border ${view === "month" ? "bg-black text-white" : ""}`}
            onClick={() => setView("month")}
          >
            Mois
          </button>
          <button
            type="button"
            className={`px-3 py-1 rounded border ${view === "week" ? "bg-black text-white" : ""}`}
            onClick={() => setView("week")}
          >
            Semaine
          </button>
        </div>
      </div>

      <div className="mt-3">{view === "month" ? renderMonthView() : renderWeekView()}</div>

      <div className="mt-6">{renderResults()}</div>
    </main>
  );
}
