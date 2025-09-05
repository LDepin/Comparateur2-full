"use client";

import { useEffect, useMemo, useState } from "react";

// ---------- utils ----------
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const fromYMD = (ymd: string) => {
  // robust parse YYYY-MM-DD
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(y, (m || 1) - 1, d || 1);
};

function parseISODurationToMin(s?: string | null): number | null {
  if (!s || typeof s !== "string") return null;
  // formats like PT1H40M, PT2H, PT55M
  const m = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/i);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  return h * 60 + mm;
}

function formatMinutes(min: number | null) {
  if (min == null || isNaN(min)) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m.toString().padStart(2, "0")}` : `${m} min`;
}

function hhmm(dateLike?: string | Date | null) {
  if (!dateLike) return "—";
  const d = typeof dateLike === "string" ? new Date(dateLike) : dateLike;
  if (isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

type CalendarCell = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarCell>;

type Segment = {
  from?: string;
  to?: string;
  depart?: string; // ISO
  arrive?: string; // ISO
  carrier?: string;
  duration?: string; // ISO PT...
};

type NormalizedOffer = {
  price: number;
  segments: Segment[];
  stops: number;
  durationMin: number | null;
  um_ok: boolean;
  animal_ok: boolean;
  airlines: string[];
};

// ---------- composant ----------
export default function SearchPage() {
  // form
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState(toYMD(new Date()));
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [stopsFilter, setStopsFilter] = useState<"all" | "direct" | "stops">(
    "all"
  );

  // calendrier
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // résultats vols
  const [results, setResults] = useState<NormalizedOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ----- calendar fetch -----
  useEffect(() => {
    async function run() {
      try {
        setCalendarError(null);
        setCalendarLoading(true);
        const res = await fetch(
          `${API_BASE}/calendar?origin=${encodeURIComponent(
            origin
          )}&destination=${encodeURIComponent(
            destination
          )}&month=${encodeURIComponent(currentMonth)}`
        );
        const data = await res.json();
        // data.calendar: { "YYYY-MM-DD": { prix, disponible } }
        setCalendar(data?.calendar || {});
      } catch (e: any) {
        setCalendarError("Impossible de charger le calendrier.");
        setCalendar({});
      } finally {
        setCalendarLoading(false);
      }
    }
    run();
  }, [origin, destination, currentMonth]);

  // ----- search flights -----
  async function searchFlights(d?: string) {
    const theDate = d || date;
    try {
      setErrorMsg(null);
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/search?origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(
          destination
        )}&date=${encodeURIComponent(theDate)}`
      );
      const data = await res.json();
      const offers = Array.isArray(data?.results) ? data.results : [];
      const normalized = offers.map(normalizeOfferSafely);
      setResults(applyClientSortAndFilter(normalized, sort, stopsFilter));
    } catch (e: any) {
      setErrorMsg("Erreur de recherche.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // tri/filtre client quand l’utilisateur change d’option
  useEffect(() => {
    if (results.length) {
      setResults((prev) => applyClientSortAndFilter(prev, sort, stopsFilter));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, stopsFilter]);

  // ---------- helpers front ----------
  function applyClientSortAndFilter(
    list: NormalizedOffer[],
    how: "price" | "duration",
    filter: "all" | "direct" | "stops"
  ) {
    let out = [...list];
    if (filter === "direct") out = out.filter((o) => o.stops === 0);
    if (filter === "stops") out = out.filter((o) => o.stops > 0);

    out.sort((a, b) =>
      how === "price"
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : (a.durationMin ?? Infinity) - (b.durationMin ?? Infinity)
    );
    return out;
  }

  function handlePickDay(ymd: string) {
    setSelectedDate(ymd);
    setDate(ymd);
    void searchFlights(ymd);
  }

  // couleurs calendrier par quartiles
  const priceThresholds = useMemo(() => {
    const arr = Object.values(calendar)
      .filter((c) => c.disponible && typeof c.prix === "number")
      .map((c) => c.prix as number)
      .sort((a, b) => a - b);
    if (arr.length === 0) return null;
    const q = (p: number) => arr[Math.floor((arr.length - 1) * p)];
    return {
      q25: q(0.25),
      q50: q(0.5),
      q75: q(0.75),
    };
  }, [calendar]);

  function priceClass(p?: number | null, available?: boolean) {
    if (!available) return "bg-gray-100 text-gray-400 dark:bg-neutral-800";
    if (p == null || priceThresholds == null)
      return "bg-gray-100 dark:bg-neutral-800";
    const { q25, q50, q75 } = priceThresholds;
    if (p <= q25) return "bg-green-100 text-green-900";
    if (p <= q50) return "bg-emerald-100 text-emerald-900";
    if (p <= q75) return "bg-amber-100 text-amber-900";
    return "bg-rose-100 text-rose-900";
  }

  // vue calendrier (mois)
  const monthMeta = useMemo(() => {
    const [yy, mm] = currentMonth.split("-").map((n) => parseInt(n, 10));
    const first = new Date(yy, (mm || 1) - 1, 1);
    const daysInMonth = new Date(yy, (mm || 1), 0).getDate();
    const firstWeekday = (first.getDay() + 6) % 7; // Lundi=0
    return { yy, mm, daysInMonth, firstWeekday };
  }, [currentMonth]);

  function prevMonth() {
    const d = fromYMD(currentMonth + "-01");
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const d = fromYMD(currentMonth + "-01");
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const weekAround = useMemo(() => {
    const pivot = selectedDate ? fromYMD(selectedDate) : fromYMD(date);
    const out: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(pivot);
      d.setDate(d.getDate() + i);
      out.push(toYMD(d));
    }
    return out;
  }, [selectedDate, date]);

  // ---------- UI ----------
  return (
    <main className="max-w-5xl mx-auto p-4 text-sm dark:text-neutral-100">
      <h1 className="text-2xl font-bold mb-4">Comparateur — vols</h1>

      {/* Form */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="block text-xs mb-1">Origine</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="PAR, CDG, ORY…"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Destination</label>
          <input
            className="w-full border p-2 rounded dark:bg-neutral-800"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="BCN…"
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Date</label>
          <input
            type="date"
            className="w-full border p-2 rounded dark:bg-neutral-800"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSelectedDate(e.target.value);
            }}
          />
        </div>
        <div>
          <label className="block text-xs mb-1">Tri</label>
          <select
            className="w-full border p-2 rounded dark:bg-neutral-800"
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "price" | "duration")
            }
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSelectedDate(date);
              void searchFlights(date);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2 rounded flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Rechercher
          </button>
        </div>
      </div>

      {/* Filtres secondaires */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs">Vols :</span>
          <select
            className="border p-1 rounded dark:bg-neutral-800"
            value={stopsFilter}
            onChange={(e) =>
              setStopsFilter(e.target.value as "all" | "direct" | "stops")
            }
          >
            <option value="all">Tous vols</option>
            <option value="direct">Direct</option>
            <option value="stops">Avec escale(s)</option>
          </select>
        </div>

        <div className="ml-auto flex gap-2">
          <button
            className={`px-3 py-1 rounded border ${
              view === "month" ? "bg-black text-white" : ""
            }`}
            onClick={() => setView("month")}
          >
            Mois
          </button>
          <button
            className={`px-3 py-1 rounded border ${
              view === "week" ? "bg-black text-white" : ""
            }`}
            onClick={() => setView("week")}
          >
            Semaine
          </button>
        </div>
      </div>

      {/* Calendrier */}
      <div className="mt-3">
        {view === "month" ? (
          <MonthGrid
            currentMonth={currentMonth}
            onPrev={prevMonth}
            onNext={nextMonth}
            calendar={calendar}
            priceClass={priceClass}
            selectedDate={selectedDate}
            onPick={handlePickDay}
            meta={monthMeta}
            loading={calendarLoading}
            error={calendarError}
          />
        ) : (
          <WeekStrip
            week={weekAround}
            calendar={calendar}
            priceClass={priceClass}
            selectedDate={selectedDate}
            onPick={handlePickDay}
            loading={calendarLoading}
            error={calendarError}
          />
        )}
      </div>

      {/* Résultats */}
      <div className="mt-4">
        {errorMsg && (
          <p className="text-red-600 dark:text-rose-300">{errorMsg}</p>
        )}
        {!loading && !results.length && (
          <p className="text-gray-600 dark:text-neutral-300">
            Aucun résultat pour cette date (ou pas encore de recherche).
          </p>
        )}

        <div className="space-y-3">
          {results.map((r, i) => (
            <FlightCard key={i} offer={r} />
          ))}
        </div>
      </div>
    </main>
  );
}

// ---------- sous-composants ----------

function MonthGrid(props: {
  currentMonth: string;
  onPrev: () => void;
  onNext: () => void;
  calendar: CalendarMap;
  priceClass: (p?: number | null, a?: boolean) => string;
  selectedDate: string | null;
  onPick: (ymd: string) => void;
  meta: { yy: number; mm: number; daysInMonth: number; firstWeekday: number };
  loading: boolean;
  error: string | null;
}) {
  const {
    currentMonth,
    onPrev,
    onNext,
    calendar,
    priceClass,
    selectedDate,
    onPick,
    meta,
    loading,
    error,
  } = props;

  const blanks = Array.from({ length: meta.firstWeekday });
  const days = Array.from({ length: meta.daysInMonth }, (_, idx) => idx + 1);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={onPrev} className="px-2 py-1 border rounded">
          ◀
        </button>
        <div className="font-semibold">{currentMonth}</div>
        <button onClick={onNext} className="px-2 py-1 border rounded">
          ▶
        </button>
      </div>

      {loading ? (
        <div className="p-3 text-gray-600 dark:text-neutral-300">
          Chargement du calendrier…
        </div>
      ) : error ? (
        <p className="text-red-600 dark:text-rose-300">{error}</p>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {blanks.map((_, i) => (
            <div key={`b${i}`} />
          ))}
          {days.map((day) => {
            const ymd = `${currentMonth}-${String(day).padStart(2, "0")}`;
            const info = calendar[ymd];
            const cls = priceClass(info?.prix ?? null, info?.disponible);
            const isSel = selectedDate === ymd;
            return (
              <button
                type="button"
                key={ymd}
                onClick={() => onPick(ymd)}
                disabled={!info || !info.disponible}
                className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
                  isSel ? "ring-4 ring-blue-500" : ""
                } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
              >
                <span className="text-sm font-semibold">{day}</span>
                <span className="text-base font-bold mt-1">
                  {info?.disponible && typeof info.prix === "number"
                    ? `${Math.round(info.prix)} €`
                    : "—"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeekStrip(props: {
  week: string[];
  calendar: CalendarMap;
  priceClass: (p?: number | null, a?: boolean) => string;
  selectedDate: string | null;
  onPick: (ymd: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const { week, calendar, priceClass, selectedDate, onPick, loading, error } =
    props;

  if (loading)
    return (
      <div className="p-3 text-gray-600 dark:text-neutral-300">
        Chargement du calendrier…
      </div>
    );
  if (error) return <p className="text-red-600 dark:text-rose-300">{error}</p>;

  return (
    <div className="grid grid-cols-7 gap-2">
      {week.map((ymd, i) => {
        const info = calendar[ymd];
        const d = new Date(ymd);
        const cls = priceClass(info?.prix ?? null, info?.disponible);
        const isSel = selectedDate === ymd;
        return (
          <button
            type="button"
            key={ymd + i}
            onClick={() => onPick(ymd)}
            disabled={!info || !info.disponible}
            className={`p-3 rounded border flex flex-col items-center justify-center ${cls} ${
              isSel ? "ring-4 ring-blue-500" : ""
            } ${!info || !info.disponible ? "cursor-not-allowed" : "hover:opacity-95"}`}
          >
            <span className="text-sm font-semibold">{d.getDate()}</span>
            <span className="text-base font-bold mt-1">
              {info?.disponible && typeof info.prix === "number"
                ? `${Math.round(info.prix)} €`
                : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FlightCard({ offer }: { offer: NormalizedOffer }) {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];

  return (
    <div className="border rounded p-3 bg-white dark:bg-neutral-900">
      {/* header prix + badge UM/Animaux */}
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            ok={offer.um_ok}
            label="UM"
            title={offer.um_ok ? "UM accepté" : "UM non accepté"}
          />
          <Badge
            ok={offer.animal_ok}
            label="Animaux"
            title={offer.animal_ok ? "Animaux acceptés" : "Animaux non acceptés"}
          />
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            {offer.stops === 0 ? "Direct" : `${offer.stops} escale(s)`}
          </span>
          <span className="text-xs text-gray-500 dark:text-neutral-400">
            Durée: {formatMinutes(offer.durationMin)}
          </span>
          {offer.airlines.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-neutral-400">
              Compagnie(s) : {offer.airlines.join(", ")}
            </span>
          )}
        </div>

        <div className="text-lg font-bold">{Math.round(offer.price)} €</div>
      </div>

      {/* timeline segments */}
      <div className="mt-3 space-y-2">
        {offer.segments.map((s, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 text-sm flex-wrap"
            title={s.duration ? `Durée segment: ${s.duration}` : undefined}
          >
            <div className="font-medium">
              {s.from ?? first?.from ?? "—"} <span className="text-gray-400">({hhmm(s.depart)})</span>
            </div>
            <div className="text-gray-400">→</div>
            <div className="font-medium">
              {s.to ?? last?.to ?? "—"} <span className="text-gray-400">({hhmm(s.arrive)})</span>
            </div>
            {s.carrier && (
              <span className="ml-2 text-xs rounded px-2 py-0.5 border">
                {s.carrier}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ ok, label, title }: { ok: boolean; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${
        ok
          ? "bg-green-50 text-green-700 border-green-300"
          : "bg-rose-50 text-rose-700 border-rose-300 line-through"
      }`}
    >
      {label}
    </span>
  );
}

// ---------- normalisation robuste ----------

function normalizeOfferSafely(src: any): NormalizedOffer {
  // 1) récupérer segments selon plusieurs formats possibles
  let segments: Segment[] = [];

  if (Array.isArray(src?.segments) && src.segments.length) {
    segments = src.segments.map((s: any) => ({
      from: s.from ?? s.depart ?? s.origin ?? s.de,
      to: s.to ?? s.arrive ?? s.destination ?? s.a,
      depart: s.depart ?? s.heure_depart ?? s.departureTime ?? s.departure,
      arrive: s.arrive ?? s.heure_arrivee ?? s.arrivalTime ?? s.arrival,
      carrier: s.carrier ?? s.compagnie ?? s.airline,
      duration: s.duration ?? s.duree,
    }));
  } else if (Array.isArray(src?.vols) && src.vols.length) {
    // ancien format: vols: [{depart, arrivee, duree, compagnie}]
    segments = src.vols.map((v: any) => ({
      from: v.depart,
      to: v.arrivee,
      depart: v.heure_depart ?? v.depart,
      arrive: v.heure_arrivee ?? v.arrivee,
      carrier: v.compagnie,
      duration: v.duree,
    }));
  } else {
    // fallback: champs à plat
    segments = [
      {
        from: src.depart ?? src.origin,
        to: src.arrivee ?? src.destination,
        depart: src.heure_depart ?? src.depart,
        arrive: src.heure_arrivee ?? src.arrive,
        carrier: src.compagnie ?? src.airline,
        duration: src.duree,
      },
    ];
  }

  // 2) durée totale
  let durationMin: number | null =
    parseISODurationToMin(src.duree_totale) ?? null;

  // si pas fournie, essayer via somme des segments ou diff globale
  if (durationMin == null) {
    const segDur = segments
      .map((s) => parseISODurationToMin(s.duration))
      .filter((x) => typeof x === "number") as number[];
    if (segDur.length === segments.length && segDur.length > 0) {
      durationMin = segDur.reduce((a, b) => a + b, 0);
    } else {
      const first = segments[0]?.depart ? new Date(segments[0].depart) : null;
      const last = segments[segments.length - 1]?.arrive
        ? new Date(segments[segments.length - 1].arrive)
        : null;
      if (first && last && !isNaN(first.getTime()) && !isNaN(last.getTime())) {
        durationMin = Math.max(0, Math.round((+last - +first) / 60000));
      }
    }
  }

  const airlinesSet = new Set<string>();
  segments.forEach((s) => s.carrier && airlinesSet.add(String(s.carrier)));

  return {
    price: Number(src.prix ?? src.price ?? src.total ?? 0),
    segments,
    stops: Math.max(0, segments.length - 1),
    durationMin,
    um_ok: !!src.um_ok,
    animal_ok: !!src.animal_ok,
    airlines: Array.from(airlinesSet),
  };
}
