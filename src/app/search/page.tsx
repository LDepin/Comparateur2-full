"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Flight = {
  compagnie: string;
  prix: number | string;
  depart: string;        // code aéroport (ex: PAR)
  arrivee: string;       // code aéroport (ex: BCN)
  heure_depart: string;  // ISO ex: 2025-09-15T10:44
  heure_arrivee: string; // ISO
  duree: string;         // ex: PT1H40M
  escales: number;
  um_ok: boolean;
  animal_ok: boolean;
};

type CalendarCell = {
  prix: number | null;
  disponible: boolean;
};

type CalendarMap = Record<string, CalendarCell>;

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toYM = (d: Date) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
};

const parseISOLocalHM = (iso: string) => {
  // Affiche HH:mm locale même si l’ISO vient du backend
  const dt = new Date(iso);
  const hh = `${dt.getHours()}`.padStart(2, "0");
  const mm = `${dt.getMinutes()}`.padStart(2, "0");
  return `${hh}:${mm}`;
};

const parsePTtoHM = (pt: string) => {
  // "PT1H40M" -> "1h40"
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(pt);
  if (!m) return pt;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  if (h && min) return `${h}h${min}`;
  if (h) return `${h}h`;
  return `${min} min`;
};

const durationToMinutes = (pt: string) => {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(pt);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  return h * 60 + min;
};

const euro = (v: number | null | undefined) =>
  typeof v === "number" ? `${Math.round(v)} €` : "—";

const classByPrice = (p: number | null, min: number, max: number, available: boolean) => {
  if (!available || p == null || !isFinite(p)) {
    return "bg-gray-100 dark:bg-neutral-800 text-gray-400";
  }
  if (max <= min) {
    return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200";
  }
  const r = (p - min) / (max - min); // 0 -> pas cher, 1 -> cher
  if (r < 0.33) return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-200";
  if (r < 0.66) return "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200";
  return "bg-rose-100 dark:bg-rose-900/40 text-rose-900 dark:text-rose-200";
};

export default function SearchPage() {
  // Formulaires
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState<string>(toYMD(new Date()));
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [directOnly, setDirectOnly] = useState(false);

  // Résultats
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calendrier
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");

  const [currentMonth, setCurrentMonth] = useState<string>(toYM(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(date);

  // Mini calendrier (popup)
  const [showMini, setShowMini] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Fermer le mini-cal quand on clique ailleurs ou ESC
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setShowMini(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMini(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Charger le calendrier quand le mois / OD change
  useEffect(() => {
    void fetchCalendar(currentMonth);
  }, [currentMonth, origin, destination]);

  // Charger les vols au chargement initial et à chaque changement de date
  useEffect(() => {
    setSelectedDate(date);
    void searchFlights(date);
  }, [date, origin, destination, sort, directOnly]);

  const fetchCalendar = async (month: string) => {
    try {
      setCalendarError(null);
      setCalendarLoading(true);
      const res = await fetch(
        `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&month=${encodeURIComponent(month)}`
      );
      const data = (await res.json()) as { calendar: CalendarMap };
      setCalendar(data.calendar || {});
    } catch  {
      setCalendarError("Impossible de charger le calendrier.");
    } finally {
      setCalendarLoading(false);
    }
  };

  const searchFlights = async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&date=${encodeURIComponent(d)}`
      );
      const data = (await res.json()) as { results: Flight[] };

      let list = Array.isArray(data.results) ? data.results : [];
      // Normaliser + filtres client
      list = list
        .map((f) => ({
          ...f,
          prix: typeof f.prix === "string" ? Number(f.prix) : f.prix,
        }))
        .filter((f) => (directOnly ? f.escales === 0 : true));

      // Tri
      list.sort((a, b) => {
        if (sort === "price") {
          return Number(a.prix ?? 0) - Number(b.prix ?? 0);
        }
        // durée
        return durationToMinutes(a.duree || "PT0M") - durationToMinutes(b.duree || "PT0M");
      });

      setResults(list);
    } catch  {
      setError("Échec de la recherche.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  // ----- Calendrier (données dérivées) -----
  const monthMeta = useMemo(() => {
    const [yy, mm] = currentMonth.split("-").map((s) => parseInt(s, 10));
    const year = yy;
    const monthIndex = mm - 1;
    const first = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const firstWeekday = (first.getDay() + 6) % 7; // Lundi = 0
    return { year, monthIndex, daysInMonth, firstWeekday };
  }, [currentMonth]);

  // min/max prix du mois (pour l’échelle de couleur)
  const [minPrice, maxPrice] = useMemo(() => {
    const vals = Object.values(calendar)
      .filter((c) => c.disponible && typeof c.prix === "number")
      .map((c) => c.prix as number);
    if (vals.length === 0) return [0, 0] as const;
    return [Math.min(...vals), Math.max(...vals)] as const;
  }, [calendar]);

  const weekAround = useMemo(() => {
    // 3 jours avant/après la date sélectionnée
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    const out: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(toYMD(d));
    }
    return out;
  }, [selectedDate, date]);

  // Navigation mois/semaines
  const prevMonth = () => {
    const [yy, mm] = currentMonth.split("-").map((s) => parseInt(s, 10));
    const d = new Date(yy, mm - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(toYM(d));
  };
  const nextMonth = () => {
    const [yy, mm] = currentMonth.split("-").map((s) => parseInt(s, 10));
    const d = new Date(yy, mm - 1, 1);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(toYM(d));
  };

  const prevWeek = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    base.setDate(base.getDate() - 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    setDate(ymd);
  };
  const nextWeek = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    base.setDate(base.getDate() + 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    setDate(ymd);
  };

  const handlePickDay = (ymd: string, autoSearch = true) => {
    setSelectedDate(ymd);
    setDate(ymd);
    if (autoSearch) void searchFlights(ymd);
  };

  // Rendu mini calendrier (popup sur le champ date)
  const daysOfCurrentMonth = useMemo(() => {
    const arr: string[] = [];
    const [yy, mm] = currentMonth.split("-").map((s) => parseInt(s, 10));
    const last = new Date(yy, mm, 0).getDate();
    for (let d = 1; d <= last; d++) {
      arr.push(`${currentMonth}-${String(d).padStart(2, "0")}`);
    }
    return arr;
  }, [currentMonth]);

  // ----- UI -----
  return (
    <main className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Comparateur — vols</h1>

      <form
        className="grid grid-cols-1 md:grid-cols-[1fr,1fr,180px,180px,1fr] gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void searchFlights(date);
        }}
      >
        {/* Origine */}
        <div>
          <label className="block text-sm mb-1">Origine</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="PAR"
          />
        </div>

        {/* Destination */}
        <div>
          <label className="block text-sm mb-1">Destination</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="BCN"
          />
        </div>

        {/* Date + mini calendrier */}
        <div ref={wrapperRef} className="relative">
          <label className="block text-sm mb-1">Date</label>
          <input
            type="date"
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onFocus={() => setShowMini(true)}
          />
          {showMini && (
            <div className="absolute z-40 mt-2 p-2 bg-white dark:bg-neutral-900 border rounded shadow w-64">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">{currentMonth}</div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 border rounded text-xs"
                    onClick={prevMonth}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 border rounded text-xs"
                    onClick={nextMonth}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {daysOfCurrentMonth.map((d, i) => {
                  const info = calendar[d] ?? { prix: null, disponible: false };
                  const cls = classByPrice(
                    typeof info.prix === "number" ? info.prix : null,
                    minPrice,
                    maxPrice,
                    info.disponible
                  );
                  const isSel = selectedDate === d;
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
                        isSel ? "ring-2 ring-blue-500" : ""
                      } ${!info.disponible ? "opacity-50 cursor-not-allowed" : "hover:opacity-95"}`}
                    >
                      <div className="text-xs font-medium dark:text-neutral-100">
                        {Number(d.slice(-2))}
                      </div>
                      <div className="text-sm font-bold leading-none mt-0.5 text-indigo-800 dark:text-indigo-200">
                        {info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <button
                  type="button"
                  className="px-2 py-1 border rounded"
                  onClick={() => setShowMini(false)}
                >
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

        {/* Tri */}
        <div>
          <label className="block text-sm mb-1">Tri</label>
          <select
            className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white"
            value={sort}
            onChange={(e) => setSort(e.target.value as "price" | "duration")}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>

        {/* Boutons */}
        <div className="flex gap-2">
          <button
            type="submit"
            className="w-full bg-blue-600 text-white p-2 rounded flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Rechercher
          </button>
          <label className="ml-2 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={directOnly}
              onChange={(e) => setDirectOnly(e.target.checked)}
            />
            Direct
          </label>
        </div>
      </form>

      {/* Switch vue calendrier */}
      <div className="mt-3 flex items-center gap-2">
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
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
          <span className="inline-block h-3 w-3 rounded bg-emerald-200 dark:bg-emerald-900/40" /> pas cher
          <span className="inline-block h-3 w-3 rounded bg-amber-200 dark:bg-amber-900/40 ml-3" /> moyen
          <span className="inline-block h-3 w-3 rounded bg-rose-200 dark:bg-rose-900/40 ml-3" /> cher
        </div>
      </div>

      {/* Calendrier */}
      <section className="mt-3">
        {view === "month" ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={prevMonth} className="px-2 py-1 border rounded" type="button">
                ◀
              </button>
              <div className="font-semibold">{currentMonth}</div>
              <button onClick={nextMonth} className="px-2 py-1 border rounded" type="button">
                ▶
              </button>
            </div>

            {calendarLoading ? (
              <p className="text-sm text-gray-600 dark:text-neutral-300">Chargement du calendrier…</p>
            ) : calendarError ? (
              <p className="text-red-600 dark:text-rose-300">{calendarError}</p>
            ) : (
              <MonthGrid
                currentMonth={currentMonth}
                firstWeekday={monthMeta.firstWeekday}
                daysInMonth={monthMeta.daysInMonth}
                calendar={calendar}
                minPrice={minPrice}
                maxPrice={maxPrice}
                selectedDate={selectedDate}
                onPickDay={handlePickDay}
              />
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <button onClick={prevWeek} className="px-2 py-1 border rounded" type="button">
                ◀ Semaine
              </button>
              <div className="font-semibold">
                Semaine autour de {selectedDate ?? "—"}
              </div>
              <button onClick={nextWeek} className="px-2 py-1 border rounded" type="button">
                Semaine ▶
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {weekAround.map((ymd) => {
                const info = calendar[ymd] ?? { prix: null, disponible: false };
                const cls = classByPrice(
                  typeof info.prix === "number" ? info.prix : null,
                  minPrice,
                  maxPrice,
                  info.disponible
                );
                const d = new Date(ymd);
                const isSel = selectedDate === ymd;
                return (
                  <button
                    key={ymd}
                    type="button"
                    onClick={() => handlePickDay(ymd)}
                    disabled={!info.disponible}
                    className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
                      isSel ? "ring-4 ring-blue-500" : ""
                    } ${!info.disponible ? "cursor-not-allowed opacity-50" : "hover:opacity-95"}`}
                  >
                    <span className="text-sm font-semibold dark:text-neutral-100">{d.getDate()}</span>
                    <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">
                      {info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Résultats */}
      <section className="mt-6">
        {error && <p className="text-red-600 dark:text-rose-300 mb-2">{error}</p>}
        {loading && (
          <div className="text-sm text-gray-600 dark:text-neutral-300">Recherche en cours…</div>
        )}
        {!loading && results.length === 0 && (
          <div className="text-sm text-gray-500 dark:text-neutral-400">
            Aucun résultat pour cette date (ou pas encore de recherche).
          </div>
        )}

        <div className="space-y-3">
          {results.map((r, i) => {
            const prixNum = typeof r.prix === "number" ? r.prix : Number(r.prix ?? 0);
            const umBadge = r.um_ok ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                🧒 UM
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-800 line-through dark:bg-rose-900/40 dark:text-rose-200">
                🧒 UM
              </span>
            );
            const petBadge = r.animal_ok ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                🐾 Animaux
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-800 line-through dark:bg-rose-900/40 dark:text-rose-200">
                🐾 Animaux
              </span>
            );

            return (
              <div
                key={i}
                className="border rounded-lg p-4 bg-white dark:bg-neutral-900"
              >
                {/* Ligne itinéraire */}
                <div className="text-sm text-gray-700 dark:text-neutral-200 mb-2">
                  <span className="font-medium">{r.depart}</span>{" "}
                  <span className="mx-2">—</span>
                  <span className="font-medium">{r.arrivee}</span>{" "}
                  <span className="mx-2">•</span>{" "}
                  <span>Durée {parsePTtoHM(r.duree || "PT0M")}</span>{" "}
                  <span className="mx-2">•</span>{" "}
                  <span>{r.escales === 0 ? "Direct" : `${r.escales} escale(s)`}</span>
                </div>

                {/* Heures + compagnie */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base dark:text-white">
                    <span className="font-semibold">{parseISOLocalHM(r.heure_depart)}</span>{" "}
                    →{" "}
                    <span className="font-semibold">{parseISOLocalHM(r.heure_arrivee)}</span>
                    <span className="ml-3 text-sm text-gray-600 dark:text-neutral-300">
                      Compagnie : {r.compagnie || "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">{umBadge}{petBadge}</div>

                  <div className="text-lg font-bold">{euro(prixNum)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

// Composant grille mois séparé pour rester lisible
function MonthGrid(props: {
  currentMonth: string;
  firstWeekday: number;
  daysInMonth: number;
  calendar: CalendarMap;
  minPrice: number;
  maxPrice: number;
  selectedDate: string | null;
  onPickDay: (ymd: string) => void;
}) {
  const {
    currentMonth,
    firstWeekday,
    daysInMonth,
    calendar,
    minPrice,
    maxPrice,
    selectedDate,
    onPickDay,
  } = props;

  const cells: React.ReactElement[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(<div key={`b-${i}`} />);
  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = `${currentMonth}-${String(day).padStart(2, "0")}`;
    const info = calendar[ymd] ?? { prix: null, disponible: false };
    const cls = classByPrice(
      typeof info.prix === "number" ? info.prix : null,
      minPrice,
      maxPrice,
      info.disponible
    );
    const isSel = selectedDate === ymd;

    cells.push(
      <button
        type="button"
        key={ymd}
        onClick={() => onPickDay(ymd)}
        disabled={!info.disponible}
        className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
          isSel ? "ring-4 ring-blue-500" : ""
        } ${!info.disponible ? "cursor-not-allowed opacity-50" : "hover:opacity-95"}`}
      >
        <span className="text-sm font-semibold dark:text-neutral-100">{day}</span>
        <span className="text-base font-bold mt-1 text-indigo-800 dark:text-indigo-200">
          {info.disponible && typeof info.prix === "number" ? `${Math.round(info.prix)} €` : "—"}
        </span>
      </button>
    );
  }

  return <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">{cells}</div>;
}
