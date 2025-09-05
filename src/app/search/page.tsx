"use client";
import { useEffect, useMemo, useState } from "react";

type CalendarDay = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarDay>;

type Segment = {
  origin: string;
  destination: string;
  depart_iso?: string;
  arrivee_iso?: string;
  compagnie?: string;
  numero?: string;
  duree_minutes?: number;
  // legacy fields possibly present
  depart?: string;
  arrivee?: string;
  duree?: string;
};

type Flight = {
  compagnies?: string[];
  prix: number;
  depart_code?: string;
  arrivee_code?: string;
  depart_iso?: string;
  arrivee_iso?: string;
  duree_minutes?: number;
  segments?: Segment[];
  escales?: number;
  um_ok?: boolean;
  animal_ok?: boolean;
  // legacy compat
  vols?: Segment[];
};

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(iso?: string) {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function parseISODurationToMin(iso?: string) {
  // e.g. PT1H40M
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return undefined;
  const h = m[1] ? parseInt(m[1]) : 0;
  const min = m[2] ? parseInt(m[2]) : 0;
  return h * 60 + min;
}

function formatMinutes(min?: number) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h <= 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function cls(...arr: (string | false | null | undefined)[]) {
  return arr.filter(Boolean).join(" ");
}

export default function SearchPage() {
  const [origin, setOrigin] = useState("PAR");
  const [destination, setDestination] = useState("BCN");
  const [date, setDate] = useState(toYMD(new Date(2025, 8, 15))); // 2025-09-15
  const [sort, setSort] = useState<"price" | "duration">("price");
  const [nonStopOnly, setNonStopOnly] = useState(false);

  const [results, setResults] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);

  // calendar
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [month, setMonth] = useState(() => `${date.slice(0, 7)}`);
  const [calLoading, setCalLoading] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [view, setView] = useState<"month" | "week">("month");
  const selectedDate = date;

  const daysThisMonth = useMemo(() => {
    const [yy, mm] = month.split("-").map((x) => parseInt(x, 10));
    const first = new Date(yy, mm - 1, 1);
    const last = new Date(yy, mm, 0);
    const out: string[] = [];
    for (let d = 1; d <= last.getDate(); d++) {
      out.push(toYMD(new Date(yy, mm - 1, d)));
    }
    return out;
  }, [month]);

  const priceStats = useMemo(() => {
    const vals = Object.values(calendar)
      .map((d) => (typeof d.prix === "number" ? d.prix : null))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (!vals.length) return { min: 0, max: 0, q1: 0, q3: 0 };
    const q = (p: number) => vals[Math.floor((vals.length - 1) * p)];
    return { min: vals[0], max: vals[vals.length - 1], q1: q(0.25), q3: q(0.75) };
  }, [calendar]);

  function priceClass(price: number | null, dispo: boolean) {
    if (!dispo || price == null) return "bg-gray-100 text-gray-400 border-gray-200";
    const { q1, q3 } = priceStats;
    if (price <= q1) return "bg-green-100 border-green-300";
    if (price <= q3) return "bg-amber-100 border-amber-300";
    return "bg-rose-100 border-rose-300";
  }

  async function fetchCalendar(m: string) {
    try {
      setCalError(null);
      setCalLoading(true);
      const url = `${API_BASE}/calendar?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&month=${m}`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      setCalendar(data.calendar || {});
    } catch (e) {
      setCalError("Impossible de charger le calendrier. Vérifie que le backend tourne.");
    } finally {
      setCalLoading(false);
    }
  }

  async function searchFlights(d?: string) {
    const dd = d || date;
    setLoading(true);
    try {
      const url = `${API_BASE}/search?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&date=${dd}${
        nonStopOnly ? "&non_stop=true" : ""
      }`;
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      let list: Flight[] = data.results || [];

      // tri côté client si demandé
      if (sort === "price") {
        list = [...list].sort((a, b) => a.prix - b.prix);
      } else {
        const dur = (x: Flight) =>
          x.duree_minutes ??
          (x.segments?.reduce((acc, s) => {
            const v = s.duree_minutes ?? parseISODurationToMin(s.duree) ?? 0;
            return acc + v;
          }, 0) ?? 0);
        list = [...list].sort((a, b) => dur(a) - dur(b));
      }
      setResults(list);
    } catch (e) {
      // no-op: on garde l’état précédent
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    const [yy, mm] = month.split("-").map((x) => parseInt(x, 10));
    const d = new Date(yy, mm - 2, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(m);
  }
  function nextMonth() {
    const [yy, mm] = month.split("-").map((x) => parseInt(x, 10));
    const d = new Date(yy, mm, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    setMonth(m);
  }

  function handlePickDay(ymd: string) {
    setDate(ymd);
    searchFlights(ymd);
  }

  // semaine centrée autour de la date sélectionnée (±3 jours)
  const weekAround = useMemo(() => {
    if (!selectedDate) return [];
    const base = new Date(selectedDate);
    const out: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      out.push(toYMD(d));
    }
    return out;
  }, [selectedDate]);

  useEffect(() => {
    fetchCalendar(month);
  }, [month, origin, destination]);

  // première recherche
  useEffect(() => {
    searchFlights(date);
  }, []); // eslint-disable-line

  // ----------- RENDER HELPERS ------------------------------------------------

  function renderSegments(f: Flight) {
    const segs = (f.segments && f.segments.length ? f.segments : f.vols) || [];
    if (!segs.length) return null;

    const totalMin =
      f.duree_minutes ??
      segs.reduce((acc, s) => acc + (s.duree_minutes ?? parseISODurationToMin(s.duree) ?? 0), 0);

    return (
      <div className="text-sm">
        {/* Ligne villes + flèches */}
        <div className="flex items-center gap-2 flex-wrap">
          {segs.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="font-semibold">{s.origin}</div>
              <div className="text-neutral-400">→</div>
              <div className="font-semibold">{s.destination}</div>
              <div className="text-neutral-500 text-xs">
                ({formatMinutes(s.duree_minutes ?? parseISODurationToMin(s.duree))})
              </div>
              {idx < segs.length - 1 && <div className="mx-2 text-neutral-300">•</div>}
            </div>
          ))}
        </div>

        {/* Ligne heures */}
        <div className="mt-1 text-neutral-600">
          Départ <span className="font-medium">{formatTime(segs[0]?.depart_iso)}</span> — Arrivée{" "}
          <span className="font-medium">{formatTime(segs[segs.length - 1]?.arrivee_iso)}</span> •{" "}
          Durée <span className="font-medium">{formatMinutes(totalMin)}</span>{" "}
          • {segs.length - 1 === 0 ? "Direct" : `${segs.length - 1} escale(s)`}
        </div>

        {/* compagnies */}
        <div className="mt-1 text-xs text-neutral-500">
          Compagnie{(f.compagnies?.length ?? 0) > 1 ? "s" : ""} :{" "}
          {f.compagnies?.join(", ") ||
            [...new Set(segs.map((s) => s.compagnie).filter(Boolean) as string[])].join(", ") ||
            "—"}
        </div>
      </div>
    );
  }

  function renderCard(f: Flight, idx: number) {
    return (
      <div key={idx} className="border rounded-lg p-3 bg-white shadow-sm">
        {renderSegments(f)}

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cls(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                f.um_ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              )}
              title={f.um_ok ? "UM accepté" : "UM non accepté"}
            >
              🐣 UM
            </span>
            <span
              className={cls(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs",
                f.animal_ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              )}
              title={f.animal_ok ? "Animaux acceptés" : "Animaux non acceptés"}
            >
              🐾 Animaux
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xl font-bold">{Math.round(f.prix)} €</div>
            <button className="px-3 py-1 border rounded hover:bg-neutral-50">Voir</button>
          </div>
        </div>
      </div>
    );
  }

  // ----------- UI ------------------------------------------------------------

  return (
    <main className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-semibold mb-4">Comparateur — vols</h1>

      {/* Formulaire */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div>
          <label className="block text-sm text-neutral-600 mb-1">Origine</label>
          <input
            className="border rounded px-2 py-2 w-full"
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600 mb-1">Destination</label>
          <input
            className="border rounded px-2 py-2 w-full"
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600 mb-1">Date</label>
          <input
            type="date"
            className="border rounded px-2 py-2 w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm text-neutral-600 mb-1">Tri</label>
          <select
            className="border rounded px-2 py-2 w-full"
            value={sort}
            onChange={(e) => setSort(e.target.value as "price" | "duration")}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée la plus courte</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            className="border rounded px-3 py-2 w-full bg-blue-600 text-white disabled:opacity-60 flex items-center justify-center gap-2"
            disabled={loading}
            onClick={() => searchFlights()}
          >
            {loading && (
              <span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Rechercher
          </button>
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={nonStopOnly}
              onChange={(e) => setNonStopOnly(e.target.checked)}
            />
            Direct
          </label>
        </div>
      </div>

      {/* Vue calendrier */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="px-2 py-1 border rounded">
            ◀
          </button>
          <div className="font-semibold">{month}</div>
          <button onClick={nextMonth} className="px-2 py-1 border rounded">
            ▶
          </button>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            className={cls(
              "px-3 py-1 rounded border",
              view === "month" && "bg-black text-white"
            )}
            onClick={() => setView("month")}
          >
            Mois
          </button>
          <button
            className={cls(
              "px-3 py-1 rounded border",
              view === "week" && "bg-black text-white"
            )}
            onClick={() => setView("week")}
          >
            Semaine
          </button>
        </div>
      </div>

      {/* Grille calendrier */}
      <div className="mt-3">
        {calLoading ? (
          <div className="text-sm text-neutral-600">Chargement du calendrier…</div>
        ) : calError ? (
          <div className="text-sm text-rose-600">{calError}</div>
        ) : view === "month" ? (
          <div className="grid grid-cols-7 gap-2">
            {daysThisMonth.map((d) => {
              const info = calendar[d] ?? { prix: null, disponible: false };
              const isSelected = selectedDate === d;
              return (
                <button
                  key={d}
                  onClick={() => handlePickDay(d)}
                  disabled={!info.disponible}
                  className={cls(
                    "p-3 rounded border flex flex-col items-center",
                    priceClass(info.prix, info.disponible),
                    !info.disponible && "cursor-not-allowed opacity-60",
                    isSelected && "ring-4 ring-blue-500"
                  )}
                  title={d}
                >
                  <div className="text-sm font-semibold">{parseInt(d.slice(-2), 10)}</div>
                  <div className="text-base font-bold mt-1">
                    {info.disponible && info.prix != null ? `${Math.round(info.prix)} €` : "—"}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {weekAround.map((d) => {
              const info = calendar[d] ?? { prix: null, disponible: false };
              const isSelected = selectedDate === d;
              return (
                <button
                  key={d}
                  onClick={() => handlePickDay(d)}
                  disabled={!info.disponible}
                  className={cls(
                    "p-3 rounded border flex flex-col items-center",
                    priceClass(info.prix, info.disponible),
                    !info.disponible && "cursor-not-allowed opacity-60",
                    isSelected && "ring-4 ring-blue-500"
                  )}
                  title={d}
                >
                  <div className="text-sm font-semibold">{parseInt(d.slice(-2), 10)}</div>
                  <div className="text-base font-bold mt-1">
                    {info.disponible && info.prix != null ? `${Math.round(info.prix)} €` : "—"}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Résultats */}
      <div className="mt-6 space-y-3">
        {results.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Aucun résultat pour cette date (ou pas encore de recherche).
          </div>
        ) : (
          results.map((f, i) => renderCard(f, i))
        )}
      </div>
    </main>
  );
}
