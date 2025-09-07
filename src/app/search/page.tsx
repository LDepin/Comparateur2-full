"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/** -----------------------------
 *  Types robustes (segments optionnels)
 *  ----------------------------- */
type Segment = {
  from: string;      // IATA ou ville
  to: string;        // IATA ou ville
  dep: string;       // ISO 8601
  arr: string;       // ISO 8601
  carrier?: string;  // code/nom compagnie
};

type Flight = {
  compagnie?: string;
  prix: number | string;
  depart: string;
  arrivee: string;
  heure_depart: string;   // ISO
  heure_arrivee: string;  // ISO
  duree?: string;         // "PT1H56M" ou "1h56"
  escales: number;
  um_ok?: boolean;
  animal_ok?: boolean;
  segments?: Segment[];   // si présent on dessine chaque tronçon
};

type CalendarCell = {
  prix: number | null;
  disponible: boolean;
};

type CalendarMap = Record<string, CalendarCell>;

/** Appelle toujours les proxys Next (/api/...) côté front */
const API_BASE = "/api";

/** -----------------------------
 *  petites utilitaires
 *  ----------------------------- */
const toYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const monthStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const firstWeekdayOfMonth = (year: number, monthIndex0: number) => {
  // Lundi=0 … Dimanche=6 (on décale le getDay() natif)
  const wd = new Date(year, monthIndex0, 1).getDay(); // 0=Dimanche
  return (wd + 6) % 7;
};

const daysInMonth = (year: number, monthIndex0: number) =>
  new Date(year, monthIndex0 + 1, 0).getDate();

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

const parseISODur = (s?: string): { h?: number; m?: number; txt: string } => {
  if (!s) return { txt: "—" };
  // accepte "PT1H56M" ou "1h56"
  const iso = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(s);
  if (iso) {
    const h = iso[1] ? parseInt(iso[1], 10) : 0;
    const m = iso[2] ? parseInt(iso[2], 10) : 0;
    return { h, m, txt: `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`.trim() };
  }
  const human = /^(\d+)h(?:(\d+))?$/i.exec(s);
  if (human) {
    const h = parseInt(human[1], 10);
    const m = human[2] ? parseInt(human[2], 10) : 0;
    return { h, m, txt: `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`.trim() };
  }
  return { txt: s };
};

const classByPrice = (price?: number | null, ok?: boolean) => {
  if (!ok) return "bg-gray-100 text-gray-400 dark:bg-neutral-800 dark:text-neutral-400";
  if (typeof price !== "number") return "bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-neutral-200";
  if (price <= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200";
  if (price <= 140) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200";
  return "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200";
};

/** -----------------------------
 *  Composant Timeline (vol → escales → arrivée)
 *  ----------------------------- */
function FlightTimeline({ flight }: { flight: Flight }) {
  // construit une liste de segments ; si pas fournie, on crée 1 segment
  const segs: Segment[] = useMemo(() => {
    if (Array.isArray(flight.segments) && flight.segments.length > 0) return flight.segments;
    return [
      {
        from: flight.depart,
        to: flight.arrivee,
        dep: flight.heure_depart,
        arr: flight.heure_arrivee,
        carrier: flight.compagnie,
      },
    ];
  }, [flight]);

  // durée totale (si non fournie)
  const totalTxt = useMemo(() => {
    if (flight.duree) return parseISODur(flight.duree).txt;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const t = new Date(last.arr).getTime() - new Date(first.dep).getTime();
    if (!Number.isFinite(t)) return "—";
    const min = Math.round(t / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`.trim();
  }, [flight.duree, segs]);

  return (
    <div className="w-full">
      {/* stations */}
      <div className="flex items-center gap-3 text-sm">
        {segs.map((s, i) => (
          <React.Fragment key={`${s.from}-${s.to}-${i}`}>
            <div className="flex flex-col items-start min-w-[64px]">
              <div className="font-semibold">{s.from}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-300">{fmtTime(s.dep)}</div>
            </div>

            {/* flèche + infos tronçon */}
            <div className="flex-1">
              <div className="h-1 rounded bg-neutral-300 dark:bg-neutral-700" />
              <div className="mt-1 flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
                <span>{s.carrier ?? flight.compagnie ?? "—"}</span>
                <span>→ {parseISODur(undefined).txt /* placeholder invisible */}</span>
              </div>
            </div>

            {/* étape suivante */}
            <div className="flex flex-col items-end min-w-[64px]">
              <div className="font-semibold">{s.to}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-300">{fmtTime(s.arr)}</div>
            </div>

            {i < segs.length - 1 && (
              <div className="px-2 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-300">
                escale
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* résumé */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-neutral-700 dark:text-neutral-200">
          ⏱ {totalTxt}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
          ✈️ {flight.escales === 0 ? "Direct" : `${flight.escales} escale(s)`}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${flight.um_ok ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "opacity-60"}`}>
          🧒 UM
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${flight.animal_ok ? "border-emerald-500 text-emerald-700 dark:text-emerald-300" : "opacity-60"}`}>
          🐾 Animaux
        </span>
      </div>
    </div>
  );
}

/** -----------------------------
 *  Page principale
 *  ----------------------------- */
export default function SearchPage() {
  // UI + filtres
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState(toYMD(new Date()));
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [directOnly, setDirectOnly] = useState(false);
  const [view, setView] = useState<"month" | "week">("month");

  // calendrier
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // mini calendrier
  const [showMini, setShowMini] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // résultats
  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // mois courant (pour les vues calendrier)
  const current = useMemo(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date(date);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [date, selectedDate]);

  const year = current.getFullYear();
  const monthIndex = current.getMonth();
  const currentMonthLabel = current.toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
  const firstWd = firstWeekdayOfMonth(year, monthIndex);
  const nbDays = daysInMonth(year, monthIndex);

  /** URL <-> état (partage) */
  const syncURL = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams({
      origin,
      destination,
      date,
      sort,
      direct: directOnly ? "1" : "0",
      view,
    });
    window.history.replaceState(null, "", `/search?${params.toString()}`);
  };

  const loadFromURL = () => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const o = sp.get("origin") ?? origin;
    const d = sp.get("destination") ?? destination;
    const dt = sp.get("date") ?? date;
    const s = (sp.get("sort") as "price" | "duration") ?? sort;
    const dir = sp.get("direct") === "1";
    const v = (sp.get("view") as "month" | "week") ?? view;

    setOrigin(o);
    setDestination(d);
    setDate(dt);
    setSort(s);
    setDirectOnly(dir);
    setView(v);
    setSelectedDate(dt);
  };

  /** fetch calendrier pour un mois YYYY-MM */
  const fetchCalendar = async (monthYYYYMM: string) => {
    try {
      setCalendarError(null);
      setCalendarLoading(true);
      const res = await fetch(
        `${API_BASE}/calendar?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&month=${encodeURIComponent(monthYYYYMM)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { calendar: CalendarMap };
      setCalendar(data.calendar || {});
    } catch {
      setCalendarError("Impossible de charger le calendrier.");
      setCalendar({});
    } finally {
      setCalendarLoading(false);
    }
  };

  /** recherche vols pour une date YYYY-MM-DD */
  const searchFlights = async (d: string) => {
    try {
      setError(null);
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/search?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
          destination
        )}&date=${encodeURIComponent(d)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: Flight[] };
      let list = Array.isArray(data.results) ? data.results : [];

      // normalisation
      list = list.map((f) => ({
        ...f,
        prix: typeof f.prix === "string" ? Number(f.prix) : f.prix,
      }));

      // filtre direct
      if (directOnly) {
        list = list.filter((f) => f.escales === 0);
      }

      // tri
      list.sort((a, b) => {
        if (sort === "price") {
          return (Number(a.prix) || 0) - (Number(b.prix) || 0);
        }
        // durée : tente d'utiliser ISO, sinon approximations
        const da = parseISODur(a.duree).h ?? 0;
        const ma = parseISODur(a.duree).m ?? 0;
        const db = parseISODur(b.duree).h ?? 0;
        const mb = parseISODur(b.duree).m ?? 0;
        return da * 60 + ma - (db * 60 + mb);
      });

      setResults(list);
    } catch {
      setError("Échec de la recherche.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  /** interactions calendrier */
  const onPickDay = (ymd: string) => {
    setSelectedDate(ymd);
    setDate(ymd);
    setShowMini(false);
    void searchFlights(ymd);
    syncURL();
  };

  const prevMonth = () => {
    const d = new Date(year, monthIndex - 1, 1);
    void fetchCalendar(monthStr(d));
    setSelectedDate(toYMD(new Date(d.getFullYear(), d.getMonth(), Math.min(15, daysInMonth(d.getFullYear(), d.getMonth())))));
  };

  const nextMonth = () => {
    const d = new Date(year, monthIndex + 1, 1);
    void fetchCalendar(monthStr(d));
    setSelectedDate(toYMD(new Date(d.getFullYear(), d.getMonth(), Math.min(15, daysInMonth(d.getFullYear(), d.getMonth())))));
  };

  /** mini calendrier (popover) : fermeture clic extérieur + ESC */
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

  /** init : charge URL, mois & recherche */
  useEffect(() => {
    loadFromURL();
    // premier fetch calendrier et résultats
    const m = monthStr(new Date(date));
    void fetchCalendar(m);
    void searchFlights(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** si on change d’itinéraire ou de vue → recharge calendrier du mois courant */
  useEffect(() => {
    const m = monthStr(new Date(selectedDate ?? date));
    void fetchCalendar(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destination]);

  /** copie le lien de la recherche */
  const handleCopyLink = async () => {
    try {
      const base =
        typeof window !== "undefined" ? window.location.origin : "https://comparateur2-full-td9e.vercel.app";
      const params = new URLSearchParams({
        origin,
        destination,
        date,
        sort,
        direct: directOnly ? "1" : "0",
        view,
      });
      const url = `${base}/search?${params.toString()}`;
      await navigator.clipboard.writeText(url);
      alert("Lien copié dans le presse-papiers !");
    } catch {
      // fallback
      syncURL();
      alert("Lien prêt dans la barre d’adresse (copie manuelle).");
    }
  };

  /** rendus calendriers */
  const renderMonthView = () => {
    const blanks = firstWd;
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < blanks; i++) cells.push(<div key={`b-${i}`} />);

    for (let day = 1; day <= nbDays; day++) {
      const d = new Date(year, monthIndex, day);
      const ymd = toYMD(d);
      const info = calendar[ymd];
      const isSel = selectedDate === ymd;
      const cls = classByPrice(info?.prix ?? null, info?.disponible ?? false);

      cells.push(
        <button
          type="button"
          key={ymd}
          onClick={() => onPickDay(ymd)}
          disabled={!info || !info.disponible}
          className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
            isSel ? "ring-4 ring-blue-500" : ""
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
            <div className="font-semibold">{currentMonthLabel}</div>
            <button type="button" onClick={nextMonth} className="px-2 py-1 border rounded">
              ▶
            </button>
          </div>
        </div>

        {calendarLoading ? (
          <div className="p-4 text-sm text-neutral-600 dark:text-neutral-300">Chargement du calendrier…</div>
        ) : calendarError ? (
          <p className="text-rose-600 dark:text-rose-300">{calendarError}</p>
        ) : (
          <div className="grid grid-cols-7 gap-2">{cells}</div>
        )}
      </div>
    );
  };

  const weekAround = useMemo(() => {
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    const arr: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      arr.push(toYMD(d));
    }
    return arr;
  }, [date, selectedDate]);

  const prevWeek = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    base.setDate(base.getDate() - 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    void fetchCalendar(monthStr(base));
  };

  const nextWeek = () => {
    const base = selectedDate ? new Date(selectedDate) : new Date(date);
    base.setDate(base.getDate() + 7);
    const ymd = toYMD(base);
    setSelectedDate(ymd);
    void fetchCalendar(monthStr(base));
  };

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
        {weekAround.map((ymd, i) => {
          const info = calendar[ymd];
          const d = new Date(ymd);
          const isSel = selectedDate === ymd;
          const cls = classByPrice(info?.prix ?? null, info?.disponible ?? false);
          return (
            <button
              type="button"
              key={ymd + i}
              onClick={() => onPickDay(ymd)}
              disabled={!info || !info.disponible}
              className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
                isSel ? "ring-4 ring-blue-500" : ""
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

  /** mini calendrier (input) */
  const renderMiniCalendar = () => {
    const days: string[] = [];
    for (let day = 1; day <= nbDays; day++) {
      days.push(toYMD(new Date(year, monthIndex, day)));
    }
    return (
      <div className="absolute z-40 mt-2 p-2 bg-white dark:bg-neutral-900 border rounded shadow w-72">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">{currentMonthLabel}</div>
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
          {days.map((d) => {
            const info = calendar[d] ?? { prix: null, disponible: false };
            const dayNum = d.slice(-2);
            const cls = classByPrice(info.prix, info.disponible);
            const isSel = selectedDate === d;
            return (
              <button
                type="button"
                key={d}
                onClick={() => onPickDay(d)}
                disabled={!info.disponible}
                className={`p-1 rounded flex flex-col items-center justify-center ${cls} ${
                  isSel ? "ring-2 ring-blue-500" : ""
                } ${!info.disponible ? "opacity-60 cursor-not-allowed" : "hover:opacity-90"}`}
              >
                <div className="text-xs font-medium dark:text-neutral-200">{Number(dayNum)}</div>
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
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold mb-4">Comparateur — vols</h1>

      {/* filtres */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end" ref={wrapperRef}>
        <div className="md:col-span-1">
          <label className="text-xs block mb-1">Origine</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            onBlur={syncURL}
          />
        </div>
        <div className="md:col-span-1">
          <label className="text-xs block mb-1">Destination</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            onBlur={syncURL}
          />
        </div>
        <div className="md:col-span-1 relative">
          <label className="text-xs block mb-1">Date</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800 dark:text-white"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedDate(e.target.value);
              syncURL();
            }}
            onFocus={() => setShowMini(true)}
          />
          {showMini && renderMiniCalendar()}
        </div>
        <div className="md:col-span-1">
          <label className="text-xs block mb-1">Tri</label>
          <select
            className="border p-2 rounded w-full dark:bg-neutral-800 dark:text-white"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as "price" | "duration");
              syncURL();
            }}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>
        <div className="md:col-span-1 flex gap-2">
          <button
            type="button"
            className="flex-1 bg-blue-600 text-white p-2 rounded"
            onClick={() => {
              setSelectedDate(date);
              void searchFlights(date);
              syncURL();
            }}
          >
            Rechercher
          </button>
          <label className="inline-flex items-center gap-2 text-sm px-2">
            <input
              type="checkbox"
              checked={directOnly}
              onChange={(e) => {
                setDirectOnly(e.target.checked);
                void searchFlights(date);
                syncURL();
              }}
            />
            Direct
          </label>
        </div>
      </div>

      {/* actions secondaires */}
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

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-emerald-400/70" /> pas cher
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-amber-400/70" /> moyen
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-rose-400/70" /> cher
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyLink}
            className="px-3 py-1 rounded border hover:bg-neutral-50 dark:hover:bg-neutral-800"
            title="Copier un lien partageable de cette recherche"
          >
            🔗 Copier le lien
          </button>
        </div>
      </div>

      {/* calendrier */}
      <div className="mt-3">{view === "month" ? renderMonthView() : renderWeekView()}</div>

      {/* résultats */}
      <div className="mt-6 space-y-3">
        {loading && <div className="text-sm text-neutral-500">Chargement…</div>}
        {error && <div className="text-rose-600">{error}</div>}
        {!loading && !error && results.length === 0 && (
          <div className="text-sm text-neutral-500">Aucun résultat pour cette date (ou pas encore de recherche).</div>
        )}

        {results.map((f, idx) => (
          <div
            key={idx}
            className="rounded border p-3 bg-white dark:bg-neutral-900 dark:border-neutral-700 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="text-lg font-semibold min-w-[72px] text-right">
                {typeof f.prix === "number" ? `${Math.round(f.prix)} €` : `${f.prix}`}
              </div>
              <div className="flex-1">
                <FlightTimeline flight={f} />
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="px-3 py-1 rounded bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                  onClick={handleCopyLink}
                  title="Copier cette recherche"
                >
                  Copier
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded border"
                  onClick={() => alert("Détails / redirection compagnies → à brancher plus tard")}
                >
                  Voir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}