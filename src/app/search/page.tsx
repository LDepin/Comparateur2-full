"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// ---------------------------
// Types & helpers
// ---------------------------

type SortKey = "price" | "duration";
type ViewMode = "week" | "month";

type CalendarDay = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarDay>; // "YYYY-MM-DD" -> { prix, disponible }

type Segment = {
  depart_iso?: string;
  departISO?: string;
  arrivee_iso?: string;
  arriveeISO?: string;
};

type FlightRaw = {
  prix?: number | string;
  compagnie?: string;
  compagnies?: string[];
  escales?: number;
  duree_minutes?: number;
  duree?: string;
  depart_iso?: string;
  departISO?: string;
  heure_depart?: string;
  arrivee_iso?: string;
  arriveeISO?: string;
  heure_arrivee?: string;
  vols?: Segment[];
  um_ok?: boolean;
  animal_ok?: boolean;
};

type Flight = {
  prix: number;
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

// Dates locales stables (évite le décalage de jour)
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const fmtDateLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// HH:MM local
const toLocalHHMM = (v?: string | Date) => {
  if (!v) return "—";
  const dt = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

// Parse ISO ou "HH:MM" → Date locale aujourd’hui
const parseISOorLocal = (v?: string) => {
  if (!v) return undefined;
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;
  if (/^\d{2}:\d{2}$/.test(v)) {
    const now = new Date();
    const [h, m] = v.split(":").map(Number);
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
    return dt;
  }
  return undefined;
};

// PT#H#M → minutes
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

const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const frenchWeekLetters = ["L", "M", "M2", "J", "V", "S", "D"]; // clés uniques
const frenchWeekLabels = ["L", "M", "M", "J", "V", "S", "D"];

// palette simple par "bon / moyen / cher"
function classifyPrice(prix: number | null, min: number, max: number) {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / (max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
}

// Normalisation des vols
function normalizeFlight(r: FlightRaw): Flight {
  const price = typeof r?.prix === "number" ? r.prix : Number(r?.prix ?? NaN);

  // horaires (niveau vol + premier/dernier segment)
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
    (r?.vols && r.vols.length > 0
      ? r.vols[r.vols.length - 1]?.arrivee_iso ??
        r.vols[r.vols.length - 1]?.arriveeISO
      : undefined);

  const dep = parseISOorLocal(depISO);
  const arr = parseISOorLocal(arrISO);

  const dureeMin =
    typeof r?.duree_minutes === "number"
      ? r.duree_minutes
      : parsePTdur(r?.duree) ?? minutesDiff(dep, arr);

  const compagnie =
    r?.compagnie ??
    (Array.isArray(r?.compagnies) && r.compagnies.length
      ? r.compagnies.join("/")
      : undefined);

  return {
    prix: Number.isFinite(price) ? Math.round(price) : 0,
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
    departText: dep ? toLocalHHMM(dep) : "—",
    arriveeText: arr ? toLocalHHMM(arr) : "—",
    dureeMin: dureeMin ?? undefined,
  };
}

// Partage (Web Share + fallback)
type ShareDataLite = { title?: string; text?: string; url?: string };
type NavigatorShare = Navigator & { share?: (data: ShareDataLite) => Promise<void> };
type NavigatorClipboard = Navigator & { clipboard?: { writeText?: (t: string) => Promise<void> } };
const hasShare = (n: Navigator): n is NavigatorShare =>
  typeof (n as NavigatorShare).share === "function";

// ---------------------------
// Composant principal
// ---------------------------

export default function SearchPage() {
  const params = useSearchParams();

  // état des champs
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(params.get("destination") || "BCN");
  const [dateStr, setDateStr] = useState(
    params.get("date") || fmtDateLocal(new Date())
  );
  const [sort, setSort] = useState<SortKey>(
    (params.get("sort") as SortKey) || "price"
  );
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUM] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");
  const [view, setView] = useState<ViewMode>(
    (params.get("view") as ViewMode) || "week"
  );

  // data
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [results, setResults] = useState<Flight[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);

  // sélection d’un vol (pour piloter la timeline)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // mini-calendrier popover (sur champ date)
  const [showMini, setShowMini] = useState(false);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // mois affiché (pour mois & mini-cal)
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
  });

  // fermer le mini-cal au clic extérieur
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

  // URL partageable (string simple)
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

  // pousse l’URL (sans rechargement) — évite le type RouteImpl
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", currentShareURL);
    }
  }, [currentShareURL]);

  // patch calendrier avec min du jour sélectionné → cohérence visuelle
  const patchedCalendar = useMemo(() => {
    const copy: CalendarMap = { ...calendar };
    const dayMin =
      results.length > 0 ? Math.min(...results.map((r) => r.prix)) : null;
    const key = dateStr;
    if (copy[key]) {
      copy[key] = { prix: dayMin, disponible: copy[key].disponible };
    }
    return copy;
  }, [calendar, results, dateStr]);

  const calStats = useMemo(() => {
    const values = Object.values(patchedCalendar)
      .map((d) => d.prix)
      .filter((x): x is number => typeof x === "number");
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { min, max };
  }, [patchedCalendar]);

  // fetch calendrier du mois courant
  const loadCalendar = useCallback(
    async (cursor: Date) => {
      setLoadingCal(true);
      try {
        const m = monthKey(cursor);
        const url =
          `/api/calendar?origin=${encodeURIComponent(origin)}` +
          `&destination=${encodeURIComponent(destination)}&month=${m}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("calendar upstream");
        const data = await r.json();
        setCalendar(data.calendar || {});
      } catch {
        setCalendar({});
      } finally {
        setLoadingCal(false);
      }
    },
    [origin, destination]
  );

  // fetch résultats du jour (TOUS les vols, pas seulement le moins cher)
  const loadResults = useCallback(
    async (dStr: string) => {
      setLoadingRes(true);
      try {
        const url =
          `/api/search?origin=${encodeURIComponent(origin)}` +
          `&destination=${encodeURIComponent(destination)}&date=${dStr}` +
          (direct ? "&direct=1" : "") +
          (um ? "&um=1" : "") +
          (pets ? "&pets=1" : "");
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("search upstream");
        const raw = await r.json();
        let list: Flight[] = Array.isArray(raw?.results)
          ? raw.results.map(normalizeFlight)
          : [];
        if (direct) list = list.filter((x) => (x.escales ?? 0) === 0);

        // tri
        list.sort((a, b) =>
          sort === "price"
            ? a.prix - b.prix
            : (a.dureeMin ?? 9e9) - (b.dureeMin ?? 9e9)
        );

        setResults(list);
        setSelectedIdx(null); // reset la sélection quand le jour change
      } catch {
        setResults([]);
        setSelectedIdx(null);
      } finally {
        setLoadingRes(false);
      }
    },
    [origin, destination, sort, direct, um, pets]
  );

  // init : charge mois + résultats
  useEffect(() => {
    loadCalendar(new Date(dateStr));
  }, [loadCalendar, dateStr]);

  useEffect(() => {
    loadResults(dateStr);
  }, [loadResults, dateStr]);

  // submit manuel (bouton Rechercher)
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCalendar(new Date(dateStr));
    loadResults(dateStr);
  };

  // sélection d’un jour (depuis semaine, mois ou mini-cal)
  const selectDay = (d: Date) => {
    const s = fmtDateLocal(d); // local → plus de décalage
    setDateStr(s);
    setMonthCursor(d);
    // les useEffect déclenchent fetch
  };

  // navigation mois
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

  // semaine affichée autour de dateStr (L → D)
  const weekDays = useMemo(() => {
    const base = new Date(dateStr);
    if (isNaN(base.getTime())) return [] as Date[];
    // lundi=0 … dimanche=6
    const js = (base.getDay() + 6) % 7;
    const monday = new Date(base);
    monday.setDate(base.getDate() - js);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [dateStr]);

  // vue mois : jours à afficher (cases vides incluses pour aligner)
  const monthDays = useMemo(() => {
    const first = firstDayOfMonth(monthCursor);
    const last = lastDayOfMonth(monthCursor);
    const startCol = (first.getDay() + 6) % 7; // 0 = lundi
    const days: (Date | null)[] = [];
    for (let i = 0; i < startCol; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    return days;
  }, [monthCursor]);

  // Partage
  const doShare = async () => {
    const base =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const url = `${base}${currentShareURL}`;
    try {
      if (typeof navigator !== "undefined" && hasShare(navigator)) {
        await (navigator as NavigatorShare).share({
          title: "Comparateur — vols",
          text: "Résultats de recherche",
          url,
        });
      } else {
        const nav = navigator as NavigatorClipboard;
        if (nav.clipboard?.writeText) {
          await nav.clipboard.writeText(url);
          alert("Lien copié dans le presse-papiers !");
        } else {
          window.history.replaceState(null, "", currentShareURL);
          alert("Lien prêt dans la barre d’adresse (copie manuelle).");
        }
      }
    } catch {
      window.history.replaceState(null, "", currentShareURL);
      alert("Lien prêt dans la barre d’adresse (copie manuelle).");
    }
  };

  // ---------- helpers sélection/scroll ----------
  const scrollToIdx = (idx: number) => {
    const el = itemRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // ------------- RENDUS --------------

  const PriceBadge: React.FC<{ value: number | null }> = ({ value }) => {
    const cls =
      classifyPrice(value, calStats.min, calStats.max) === "low"
        ? "bg-green-100 border-green-300"
        : classifyPrice(value, calStats.min, calStats.max) === "mid"
        ? "bg-yellow-100 border-yellow-300"
        : value == null
        ? "bg-gray-100 border-gray-300 text-gray-400"
        : "bg-rose-100 border-rose-300";
    return (
      <div className={`rounded border ${cls} px-6 py-6 text-center text-xl font-medium`}>
        {value == null ? "—" : `${value} €`}
      </div>
    );
  };

  const DayTile: React.FC<{ d: Date; compact?: boolean }> = ({ d, compact }) => {
    const key = fmtDateLocal(d);
    const info = patchedCalendar[key];
    const selected = key === dateStr;
    return (
      <button
        onClick={() => selectDay(d)}
        className={`rounded border ${
          selected ? "ring-2 ring-blue-400" : ""
        } px-2 py-2 hover:shadow transition`}
        title={key}
      >
        <div className={`mb-1 text-sm ${selected ? "font-semibold" : ""}`}>
          {d.getDate()}
        </div>
        <div className={compact ? "text-base" : ""}>
          <PriceBadge value={info?.prix ?? null} />
        </div>
      </button>
    );
  };

  const WeekView = () => (
    <div className="mt-4">
      <div className="mb-2 grid grid-cols-7 gap-3 text-center text-xs text-gray-500">
        {frenchWeekLabels.map((w, i) => (
          <div key={frenchWeekLetters[i]}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-3">
        {weekDays.map((d) => (
          <DayTile key={fmtDateLocal(d)} d={d} />
        ))}
      </div>
    </div>
  );

  const MonthView = () => (
    <div className="mt-4">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" onClick={goPrevMonth} className="rounded border px-2 py-1">
          ◀
        </button>
        <div className="min-w-[180px] text-center font-medium">
          {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
        </div>
        <button type="button" onClick={goNextMonth} className="rounded border px-2 py-1">
          ▶
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
        {frenchWeekLabels.map((w, i) => (
          <div key={`m-${frenchWeekLetters[i]}`}>{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {monthDays.map((d, i) =>
          d ? (
            <DayTile key={fmtDateLocal(d)} d={d} compact />
          ) : (
            <div key={`empty-${i}`} className="rounded border px-2 py-2 opacity-30">
              &nbsp;
            </div>
          )
        )}
      </div>
    </div>
  );

  const MiniCalendar: React.FC = () => {
    if (!showMini) return null;
    const style: React.CSSProperties = {
      position: "absolute",
      zIndex: 50,
      marginTop: 6,
      width: 320,
    };
    return (
      <div ref={miniRef} style={style} className="rounded-lg border bg-white p-3 shadow">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={goPrevMonth} className="rounded border px-2 py-1">
            ◀
          </button>
          <div className="text-sm font-medium">
            {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
          <button onClick={goNextMonth} className="rounded border px-2 py-1">
            ▶
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
          {frenchWeekLabels.map((w, i) => (
            <div key={`mini-${frenchWeekLetters[i]}`}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthDays.map((d, i) =>
            d ? (
              <button
                key={`mini-${fmtDateLocal(d)}`}
                onClick={() => {
                  selectDay(d);
                  setShowMini(false);
                }}
                className={`rounded border px-2 py-1 text-left ${
                  fmtDateLocal(d) === dateStr ? "ring-2 ring-blue-400" : ""
                }`}
                title={fmtDateLocal(d)}
              >
                <div className="text-[11px]">{d.getDate()}</div>
                {/* couleur uniquement (pas de prix) */}
                <div className="mt-1 h-4 w-full rounded border opacity-80"
                  style={{
                    background:
                      classifyPrice(
                        patchedCalendar[fmtDateLocal(d)]?.prix ?? null,
                        calStats.min,
                        calStats.max
                      ) === "low"
                        ? "#DCFCE7"
                        : classifyPrice(
                            patchedCalendar[fmtDateLocal(d)]?.prix ?? null,
                            calStats.min,
                            calStats.max
                          ) === "mid"
                        ? "#FEF9C3"
                        : patchedCalendar[fmtDateLocal(d)]?.prix == null
                        ? "#F3F4F6"
                        : "#FFE4E6",
                  }}
                />
              </button>
            ) : (
              <div key={`mini-empty-${i}`} />
            )
          )}
        </div>
      </div>
    );
  };

  const Timeline: React.FC = () => {
    // chaque vol est projeté sur 24 h du jour sélectionné
    const start = new Date(dateStr);
    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000;

    const bars = results
      .map((r, idx) => {
        const dep = parseISOorLocal(r.departISO || "");
        const arr = parseISOorLocal(r.arriveeISO || "");
        const s = dep ? dep.getTime() : dayStart + 8 * 3600 * 1000; // 08:00 fallback
        const e = arr ? arr.getTime() : s + (r.dureeMin ?? 120) * 60000;
        const clampedS = Math.max(dayStart, Math.min(s, dayEnd));
        const clampedE = Math.max(dayStart + 10 * 60 * 1000, Math.min(e, dayEnd));
        const left = ((clampedS - dayStart) / (dayEnd - dayStart)) * 100;
        const width = ((clampedE - clampedS) / (dayEnd - dayStart)) * 100;
        return { left, width, idx };
      })
      .filter((b) => isFinite(b.left) && isFinite(b.width));

    return (
      <div className="mt-6">
        <div className="mb-1 text-xs text-gray-500">
          Timeline (chaque barre = un vol positionné sur 24 h — départ → arrivée)
        </div>
        <div className="relative h-6 w-full rounded border bg-gray-50">
          {bars.map((b) => (
            <button
              key={b.idx}
              className={`absolute top-0 h-full rounded transition ${
                selectedIdx === b.idx ? "bg-blue-600/90" : "bg-blue-300/80 hover:bg-blue-400/80"
              }`}
              style={{ left: `${b.left}%`, width: `${Math.max(b.width, 2)}%` }}
              title={`Vol ${b.idx + 1}`}
              onClick={() => {
                setSelectedIdx(b.idx);
                scrollToIdx(b.idx);
              }}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    );
  };

  // rendu liste
  const ResultsList = () => (
    <div className="mt-4 space-y-3">
      {loadingRes ? (
        <div className="py-8 text-center text-sm text-gray-500">Recherche…</div>
      ) : results.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Aucun résultat pour cette date (ou pas encore de recherche).
        </div>
      ) : (
        results.map((r, i) => {
          const directBadge =
            typeof r.escales === "number" ? r.escales === 0 : undefined;
          const selected = selectedIdx === i;
          return (
            <div
              key={i}
              ref={(el) => (itemRefs.current[i] = el)}
              className={`rounded border p-3 transition ${
                selected ? "ring-2 ring-blue-500 border-blue-400" : "hover:shadow"
              }`}
              onClick={() => {
                setSelectedIdx(i);
                scrollToIdx(i);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
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
                <span className={`rounded-full border px-2 py-0.5 ${directBadge ? "bg-green-50" : ""}`}>
                  Direct
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${r.um_ok ? "bg-yellow-50" : "opacity-60"}`}>
                  🧒 UM {r.um_ok ? "possible" : "—"}
                </span>
                <span className={`rounded-full border px-2 py-0.5 ${r.animal_ok ? "bg-yellow-50" : "opacity-60"}`}>
                  🐾 Animaux {r.animal_ok ? "possible" : "—"}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Comparateur — vols</h1>

      {/* Formulaire */}
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-7">
        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Origine</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            placeholder="PAR"
          />
        </div>
        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Destination</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            placeholder="BCN"
          />
        </div>

        <div className="relative md:col-span-2">
          <label className="mb-1 block text-sm text-gray-600">Date</label>
          <input
            ref={dateInputRef}
            type="date"
            className="w-full rounded border px-3 py-2"
            value={dateStr}
            onChange={(e) => {
              const v = e.target.value;
              setDateStr(v);
              const d = new Date(v);
              if (!isNaN(d.getTime())) setMonthCursor(d);
            }}
            onFocus={() => setShowMini(true)}
          />
          <MiniCalendar />
        </div>

        <div className="md:col-span-1">
          <label className="mb-1 block text-sm text-gray-600">Tri</label>
          <select
            className="w-full rounded border px-3 py-2"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="price">Prix croissant</option>
            <option value="duration">Durée croissante</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-end justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
            Direct
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={um} onChange={(e) => setUM(e.target.checked)} />
            UM
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} />
            Animaux
          </label>
          <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            Rechercher
          </button>
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
            onClick={doShare}
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
        <div className="py-8 text-center text-sm text-gray-500">Chargement du calendrier…</div>
      ) : view === "week" ? (
        <WeekView />
      ) : (
        <MonthView />
      )}

      {/* Timeline + liste */}
      <Timeline />
      <ResultsList />

      {/* petit lien debug (pas de Link typé) */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">
          API ping
        </a>
      </div>
    </main>
  );
}