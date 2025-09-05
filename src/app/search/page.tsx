"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type CalendarCell = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarCell>;

type FlightResult = {
  compagnie?: string;              // ex: "VY"
  prix: number;
  depart?: string;                 // ex: "PAR" ou "ORY"
  arrivee?: string;                // ex: "BCN"
  heure_depart?: string;           // ex: "2025-09-15T10:44"
  heure_arrivee?: string;          // ex: "2025-09-15T12:40"
  duree?: string;                  // ex: "PT1H56M"
  escales?: number;                // ex: 0, 1, 2…
  um_ok?: boolean;
  animal_ok?: boolean;

  // fallback si le backend renvoie un tableau de segments
  vols?: Array<{
    depart?: string;
    arrivee?: string;
    duree?: string;
    compagnie?: string;
    heure_depart?: string;
    heure_arrivee?: string;
  }>;
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdToLabel(ymd: string) {
  if (!ymd) return "";
  const [y, m] = ymd.split("-").slice(0, 2);
  return `${y}-${m}`;
}

function formatMoney(n?: number | null) {
  if (typeof n !== "number") return "—";
  return `${Math.round(n)} €`;
}

function formatTime(iso?: string) {
  if (!iso) return "—";
  // Ultra robuste: si on a un "T12:34", on découpe
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(iso?: string) {
  if (!iso || !iso.startsWith("PT")) return "—";
  const h = iso.match(/(\d+)H/);
  const min = iso.match(/(\d+)M/);
  const hh = h ? `${h[1]} h` : "";
  const mm = min ? ` ${min[1]} min` : "";
  return (hh + mm).trim() || "—";
}

function priceClass(prix: number | null, dispo: boolean) {
  if (!dispo || prix === null || isNaN(Number(prix))) {
    return "bg-gray-100 dark:bg-neutral-800 text-gray-400";
  }
  if (prix < 60) return "bg-green-100 dark:bg-green-900/40";
  if (prix < 120) return "bg-yellow-100 dark:bg-yellow-900/40";
  return "bg-red-100 dark:bg-red-900/40";
}

export default function SearchPage() {
  // Form
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState(toYMD(new Date())); // champ Date
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [stops, setStops] = useState<"all" | "direct" | "withStops">("all");

  // Results
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FlightResult[]>([]);

  // Calendar
  const [currentMonth, setCurrentMonth] = useState(ymdToLabel(toYMD(new Date())));
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(toYMD(new Date()));
  const [view, setView] = useState<"month" | "week">("month");

  // Mini-cal (pop sur le champ date)
  const [showMini, setShowMini] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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

  // Fetch calendar on month change
  useEffect(() => {
    void fetchCalendar(currentMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth, origin, destination]);

  const [year, monthIndex] = useMemo(() => {
    const [y, m] = currentMonth.split("-").map((s) => parseInt(s, 10));
    return [y, m - 1] as const;
  }, [currentMonth]);

  const daysInMonth = useMemo(() => new Date(year, monthIndex + 1, 0).getDate(), [year, monthIndex]);
  const firstWeekday = useMemo(() => new Date(year, monthIndex, 1).getDay() || 7, [year, monthIndex]); // 1..7 (lundi=1)
  const daysThisMonth = useMemo(() => {
    const out: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(toYMD(new Date(year, monthIndex, d)));
    }
    return out;
  }, [year, monthIndex, daysInMonth]);

  const weekAround = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate) : new Date();
    const days: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      days.push(toYMD(d));
    }
    return days;
  }, [selectedDate]);

  function prevMonth() {
    const d = new Date(year, monthIndex, 1);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(ymdToLabel(toYMD(d)));
  }
  function nextMonth() {
    const d = new Date(year, monthIndex, 1);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(ymdToLabel(toYMD(d)));
  }
  function prevWeek() {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 7);
    setSelectedDate(toYMD(d));
    setDate(toYMD(d));
    void searchFlights(toYMD(d));
    setCurrentMonth(ymdToLabel(toYMD(d)));
  }
  function nextWeek() {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 7);
    setSelectedDate(toYMD(d));
    setDate(toYMD(d));
    void searchFlights(toYMD(d));
    setCurrentMonth(ymdToLabel(toYMD(d)));
  }

  async function fetchCalendar(month: string) {
    try {
      setCalendarError(null);
      setCalendarLoading(true);
      const res = await fetch(
        `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&month=${encodeURIComponent(month)}`
      );
      const data = await res.json();
      setCalendar(data.calendar ?? {});
    } catch (e) {
      setCalendarError("Impossible de charger le calendrier. Vérifie que le backend est accessible.");
    } finally {
      setCalendarLoading(false);
    }
  }

  async function searchFlights(d?: string) {
    const dd = d || date;
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&date=${encodeURIComponent(dd)}`
      );
      const data = await res.json();
      let arr: FlightResult[] = Array.isArray(data?.results) ? data.results : [];

      // Si backend renvoie "vols" (segments), on en déduit les champs manquants
      arr = arr.map((f) => {
        if (f.vols && f.vols.length) {
          const first = f.vols[0];
          const last = f.vols[f.vols.length - 1];
          const compagnies = Array.from(new Set(f.vols.map((v) => v.compagnie).filter(Boolean)));
          return {
            ...f,
            depart: first?.depart ?? f.depart,
            arrivee: last?.arrivee ?? f.arrivee,
            heure_depart: first?.heure_depart ?? f.heure_depart,
            heure_arrivee: last?.heure_arrivee ?? f.heure_arrivee,
            duree: f.duree ?? last?.duree,
            escales: typeof f.escales === "number" ? f.escales : Math.max(0, f.vols.length - 1),
            compagnie: f.compagnie ?? compagnies.join(" / "),
          };
        }
        return f;
      });

      // Filtres
      if (stops === "direct") arr = arr.filter((f) => (f.escales ?? 0) === 0);
      if (stops === "withStops") arr = arr.filter((f) => (f.escales ?? 0) > 0);

      // Tri
      if (sort === "price") {
        arr.sort((a, b) => (a.prix ?? Infinity) - (b.prix ?? Infinity));
      } else {
        // Tri sur la durée en minutes
        const dur = (x?: string) => {
          if (!x) return Infinity;
          const h = x.match(/(\d+)H/);
          const m = x.match(/(\d+)M/);
          return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
        };
        arr.sort((a, b) => dur(a.duree) - dur(b.duree));
      }

      setResults(arr);
    } catch (e) {
      // noop: message dans l’UI déjà
    } finally {
      setLoading(false);
    }
  }

  function handlePickDay(ymd: string) {
    setSelectedDate(ymd);
    setDate(ymd);
    void searchFlights(ymd);
  }

  // Rendu calendrier mois
  const renderMonthView = () => {
    const blanks = (firstWeekday + 6) % 7; // 0..6
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
          className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
            isSelected ? "ring-4 ring-blue-500" : ""
          } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
        >
          <span className="text-sm font-semibold dark:text-neutral-100">{day}</span>
          <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">
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
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setView("month")}
              className={`px-3 py-1 rounded border ${view === "month" ? "bg-black text-white" : ""}`}
            >
              Mois
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={`px-3 py-1 rounded border ${view === "week" ? "bg-black text-white" : ""}`}
            >
              Semaine
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

  // Rendu calendrier semaine (±3 jours)
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
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => setView("month")}
            className={`px-3 py-1 rounded border ${view === "month" ? "bg-black text-white" : ""}`}
          >
            Mois
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={`px-3 py-1 rounded border ${view === "week" ? "bg-black text-white" : ""}`}
          >
            Semaine
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekAround.map((ymd, i) => {
          const info = calendar[ymd];
          const d = new Date(ymd);
          const isSelected = selectedDate === ymd;
          const cls = info ? priceClass(info.prix, info.disponible) : "bg-gray-100 dark:bg-neutral-800 text-gray-400";
          return (
            <button
              type="button"
              key={ymd + i}
              onClick={() => handlePickDay(ymd)}
              disabled={!info || !info.disponible}
              className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
                isSelected ? "ring-4 ring-blue-500" : ""
              } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
            >
              <span className="text-sm font-semibold dark:text-neutral-100">{d.getDate()}</span>
              <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">
                {info && info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Vignettes vols
  const renderFlightCard = (f: FlightResult, idx: number) => {
    const depTime = formatTime(f.heure_depart);
    const arrTime = formatTime(f.heure_arrivee);
    const dur = formatDuration(f.duree);
    const stopsLabel = (f.escales ?? 0) === 0 ? "Direct" : `${f.escales} escale(s)`;
    const comp = f.compagnie || "—";

    return (
      <div key={idx} className="rounded border p-3 mb-3 bg-white dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-gray-500 dark:text-neutral-400">
              {f.depart ?? "—"} → {f.arrivee ?? "—"}
            </div>
            <div className="mt-1 text-base font-medium">
              Départ <span className="tabular-nums">{depTime}</span> — Arrivée{" "}
              <span className="tabular-nums">{arrTime}</span> • Durée {dur} • {stopsLabel}
            </div>
            <div className="mt-1 text-sm text-gray-600 dark:text-neutral-300">Compagnie : {comp}</div>

            <div className="mt-2 flex items-center gap-2">
              <span
                className={`text-xs px-2 py-1 rounded border ${
                  f.um_ok ? "bg-green-100 border-green-300" : "bg-red-100 border-red-300 line-through text-red-700"
                }`}
                title={f.um_ok ? "UM accepté" : "UM non disponible"}
              >
                🧒 UM
              </span>
              <span
                className={`text-xs px-2 py-1 rounded border ${
                  f.animal_ok ? "bg-green-100 border-green-300" : "bg-red-100 border-red-300 line-through text-red-700"
                }`}
                title={f.animal_ok ? "Animaux acceptés" : "Animaux non acceptés"}
              >
                🐾 Animaux
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xl font-bold">{formatMoney(f.prix)}</div>
            <button className="mt-2 px-3 py-1 rounded border hover:bg-neutral-50 dark:hover:bg-neutral-800">
              Voir
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Comparateur — vols</h1>

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSelectedDate(date);
          void searchFlights(date);
        }}
        className="grid md:grid-cols-5 gap-2 items-start"
      >
        <input
          className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Origine (ex: PAR)"
        />
        <input
          className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="Destination (ex: BCN)"
        />

        <div className="relative" ref={wrapperRef}>
          <input
            type="text"
            readOnly
            className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white cursor-pointer"
            value={date}
            onClick={() => setShowMini((s) => !s)}
          />
          {showMini && (
            <div className="absolute z-40 mt-2 p-2 bg-white dark:bg-gray-900 border rounded shadow w-64">
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
                {daysThisMonth.map((d, i) => {
                  const info = calendar[d] ?? { prix: null, disponible: false };
                  const dayNum = Number(d.slice(-2));
                  const cls = priceClass(info.prix, info.disponible);
                  const isSelected = selectedDate === d;
                  return (
                    <button
                      type="button"
                      key={d + i}
                      onClick={() => {
                        setShowMini(false);
                        handlePickDay(d);
                      }}
                      disabled={!info.disponible}
                      className={`p-1 rounded flex flex-col items-center justify-center ${cls} ${
                        isSelected ? "ring-2 ring-blue-500" : ""
                      } ${!info.disponible ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}`}
                    >
                      <div className="text-xs font-medium dark:text-neutral-200">{dayNum}</div>
                      <div className="text-sm font-bold mt-0.5 text-indigo-700 dark:text-indigo-200">
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
          )}
        </div>

        <select
          className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white"
          value={sort}
          onChange={(e) => setSort(e.target.value as "price" | "duration")}
        >
          <option value="price">Prix croissant</option>
          <option value="duration">Durée la plus courte</option>
        </select>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded flex items-center justify-center gap-2"
        >
          {loading && <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          Rechercher
        </button>
      </form>

      {/* Filtres ligne 2 */}
      <div className="mt-3 flex items-center gap-3">
        <label className="text-sm">Vols :</label>
        <select
          className="border p-2 rounded dark:bg-neutral-800 dark:text-white"
          value={stops}
          onChange={(e) => setStops(e.target.value as typeof stops)}
        >
          <option value="all">Tous vols</option>
          <option value="direct">Sans escale</option>
          <option value="withStops">Avec escale(s)</option>
        </select>
      </div>

      {/* Calendrier */}
      <div className="mt-4">{view === "month" ? renderMonthView() : renderWeekView()}</div>

      {/* Résultats */}
      <div className="mt-6">
        {loading && <p className="text-sm text-gray-600 dark:text-neutral-300">Recherche en cours…</p>}
        {!loading && results.length === 0 && (
          <p className="text-sm text-gray-600 dark:text-neutral-300">Aucun résultat pour cette date.</p>
        )}
        {results.map((r, i) => renderFlightCard(r, i))}
      </div>
    </main>
  );
}
