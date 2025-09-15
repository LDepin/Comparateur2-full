"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  CSSProperties,
} from "react";
import { useSearchParams } from "next/navigation";

// ---------------------------
// Types & helpers
// ---------------------------

type CalendarDay = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarDay>; // "YYYY-MM-DD" -> { prix, disponible }

type SortKey = "price" | "duration";
type ViewMode = "week" | "month";

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

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

// IMPORTANT : format local (France) → évite le décalage d’un jour
const fmtDateLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseYMDLocal = (s?: string): Date | undefined => {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10) - 1;
  const da = parseInt(m[3], 10);
  const d = new Date(y, mo, da, 0, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
};

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
  // fallback HH:MM → aujourd’hui local
  if (/^\d{2}:\d{2}$/.test(v)) {
    const now = new Date();
    const [h, m] = v.split(":").map(Number);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  }
  return undefined;
};

const parsePTdur = (pt?: string) => {
  if (!pt || typeof pt !== "string" || !pt.startsWith("PT")) return undefined;
  let h = 0,
    m = 0;
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

const frenchWeekLetters = ["L", "M", "M2", "J", "V", "S", "D"]; // clés stables
const frenchWeekLabels = ["L", "M", "M", "J", "V", "S", "D"];

// palette simple par "bon marché / moyen / cher"
function classifyPrice(prix: number | null, min: number, max: number) {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / (max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
}

const tileBgClassForPrice = (prix: number | null, min: number, max: number) => {
  const c = classifyPrice(prix, min, max);
  switch (c) {
    case "low":
      return "bg-green-100 border-green-300";
    case "mid":
      return "bg-yellow-100 border-yellow-300";
    case "high":
      return "bg-rose-100 border-rose-300";
    default:
      return "bg-gray-100 border-gray-300 text-gray-400";
  }
};

// ---------------------------
// Normalisation des vols
// ---------------------------

function normalizeFlight(r: unknown): Flight {
  const v = r as Record<string, unknown>;
  const prixRaw = v?.["prix"];
  const prix = typeof prixRaw === "number" ? prixRaw : Number(prixRaw ?? NaN);

  const vols = Array.isArray(v?.["vols"]) ? (v["vols"] as Array<Record<string, unknown>>) : [];

  const depISO =
    (v["depart_iso"] as string | undefined) ??
    (v["departISO"] as string | undefined) ??
    (v["heure_depart"] as string | undefined) ??
    (vols[0]?.["depart_iso"] as string | undefined) ??
    (vols[0]?.["departISO"] as string | undefined);

  const arrISO =
    (v["arrivee_iso"] as string | undefined) ??
    (v["arriveeISO"] as string | undefined) ??
    (v["heure_arrivee"] as string | undefined) ??
    (vols[vols.length - 1]?.["arrivee_iso"] as string | undefined) ??
    (vols[vols.length - 1]?.["arriveeISO"] as string | undefined);

  const dep = parseISOorLocal(depISO);
  const arr = parseISOorLocal(arrISO);

  const dureeMin =
    typeof v?.["duree_minutes"] === "number"
      ? (v["duree_minutes"] as number)
      : parsePTdur(v?.["duree"] as string | undefined) ?? minutesDiff(dep, arr);

  const compagnie =
    (v["compagnie"] as string | undefined) ??
    (Array.isArray(v?.["compagnies"]) && (v["compagnies"] as string[]).length
      ? (v["compagnies"] as string[]).join("/")
      : undefined);

  const escales =
    typeof v?.["escales"] === "number"
      ? (v["escales"] as number)
      : Math.max(0, vols.length - 1);

  return {
    prix: Number.isFinite(prix) ? Math.round(prix) : 0,
    compagnie,
    escales,
    um_ok: !!v?.["um_ok"],
    animal_ok: !!v?.["animal_ok"],
    departISO: dep ? dep.toISOString() : undefined,
    arriveeISO: arr ? arr.toISOString() : undefined,
    departText: dep ? toLocalHHMM(dep.toISOString()) : "—",
    arriveeText: arr ? toLocalHHMM(arr.toISOString()) : "—",
    dureeMin: dureeMin ?? undefined,
  };
}

// ---------------------------
// Composant principal (client)
// ---------------------------

export default function SearchClient() {
  const params = useSearchParams();

  // état des champs
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(params.get("destination") || "BCN");
  const [dateStr, setDateStr] = useState(params.get("date") || fmtDateLocal(new Date()));
  const [sort, setSort] = useState<SortKey>(
    (params.get("sort") as SortKey) || "price"
  );
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUm] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");
  const [view, setView] = useState<ViewMode>(
    (params.get("view") as ViewMode) || "week"
  );

  // data
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [results, setResults] = useState<Flight[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);

  // sélection d’un résultat (pour la timeline + surbrillance)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  // mini-calendrier popover
  const [showMini, setShowMini] = useState(false);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // mois affiché
  const initialDate = parseYMDLocal(dateStr) ?? new Date();
  const [monthCursor, setMonthCursor] = useState<Date>(() => initialDate);

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

  // URL partageable (client) — History API (évite l’erreur RouteImpl de Next)
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", currentShareURL);
    }
  }, [currentShareURL]);

  // fetch calendrier du mois courant
  const loadCalendar = useCallback(
    async (cursor: Date) => {
      setLoadingCal(true);
      try {
        const m = monthKey(cursor);
        const url = `/api/calendar?origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(destination)}&month=${m}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("calendar upstream");
        const data = (await r.json()) as { calendar?: CalendarMap };
        setCalendar(data.calendar || {});
      } catch {
        setCalendar({});
      } finally {
        setLoadingCal(false);
      }
    },
    [origin, destination]
  );

  // fetch résultats
  const loadResults = useCallback(
    async (dStr: string) => {
      setLoadingRes(true);
      try {
        const url =
          `/api/search?origin=${encodeURIComponent(origin)}` +
          `&destination=${encodeURIComponent(destination)}` +
          `&date=${dStr}` +
          (direct ? "&direct=1" : "") +
          (um ? "&um=1" : "") +
          (pets ? "&pets=1" : "");
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("search upstream");
        const raw = (await r.json()) as { results?: unknown[] };
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
        setSelectedIndex(list.length > 0 ? 0 : -1);
      } catch {
        setResults([]);
        setSelectedIndex(-1);
      } finally {
        setLoadingRes(false);
      }
    },
    [origin, destination, sort, direct, um, pets]
  );

  // init : charge mois + résultats
  useEffect(() => {
    loadCalendar(parseYMDLocal(dateStr) ?? new Date());
  }, [loadCalendar, dateStr]);

  useEffect(() => {
    loadResults(dateStr);
  }, [loadResults, dateStr]);

  // semaine affichée autour de dateStr (L → D) — avec parsing local
  const weekDays = useMemo(() => {
    const base = parseYMDLocal(dateStr) ?? new Date();
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

  // patch calendrier avec min du jour sélectionné → cohérence visuelle
  const patchedCalendar = useMemo(() => {
    const copy: CalendarMap = { ...calendar };
    const dayMin = results.length > 0 ? Math.min(...results.map((r) => r.prix)) : null;
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

  // submit manuel (bouton Rechercher)
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadCalendar(parseYMDLocal(dateStr) ?? new Date());
    loadResults(dateStr);
  };

  // sélection d’un jour
  const selectDay = (d: Date) => {
    const s = fmtDateLocal(d);
    setDateStr(s);
    setMonthCursor(d);
    // fetch via useEffect
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

  // partage
  const doShare = async () => {
    const base =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const url = `${base}${currentShareURL}`;
    try {
      const nav = navigator as unknown as { share?: (data: { title: string; text: string; url: string }) => Promise<void>; clipboard?: { writeText?: (t: string) => Promise<void> } };
      if (typeof nav.share === "function") {
        await nav.share({ title: "Comparateur — vols", text: "Résultats de recherche", url });
      } else if (nav.clipboard?.writeText) {
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

  // ------------- RENDUS --------------

// --- PriceBadge compact ---
const PriceBadge: React.FC<{ value: number | null; compact?: boolean }> = ({ value, compact }) => {
  const cls =
    classifyPrice(value, calStats.min, calStats.max) === "low"
      ? "bg-green-100 border-green-300"
      : classifyPrice(value, calStats.min, calStats.max) === "mid"
      ? "bg-yellow-100 border-yellow-300"
      : value == null
      ? "bg-gray-100 border-gray-300 text-gray-400"
      : "bg-rose-100 border-rose-300";

  const padY = compact ? "py-2" : "py-6";
  const padX = compact ? "px-3" : "px-6";
  const txt  = compact ? "text-base" : "text-xl";

  return (
    <div className={`rounded border ${cls} ${padX} ${padY} text-center ${txt} font-medium`}>
      {value == null ? "—" : `${value} €`}
    </div>
  );
};

// --- DayTile compact + hauteur stable ---
const DayTile: React.FC<{ d: Date; compact?: boolean }> = ({ d, compact }) => {
  const key = fmtDateLocal(d);
  const info = patchedCalendar[key];
  const selected = key === dateStr;

  return (
    <button
      onClick={() => selectDay(d)}
      title={key}
      className={[
        "rounded border transition hover:shadow",
        // hauteur stable + layout
        compact ? "h-24 sm:h-28" : "h-32 md:h-32",
        "flex flex-col justify-between px-2 py-2",
        selected ? "ring-2 ring-blue-400" : "",
      ].join(" ")}
    >
      <div className={`text-sm ${selected ? "font-semibold" : ""}`}>{d.getDate()}</div>
      <div className="mt-1">
        <PriceBadge value={info?.prix ?? null} compact={compact} />
      </div>
    </button>
  );
};

// --- WeekView : on passe compact ---
const WeekView = () => (
  <div className="mt-4">
    <div className="mb-2 grid grid-cols-7 gap-3 text-center text-xs text-gray-500">
      {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => (
        <div key={`w-${i}`}>{w}</div>
      ))}
    </div>
    <div className="grid grid-cols-7 gap-3">
      {weekDays.map((d) => (
        <DayTile key={fmtDateLocal(d)} d={d} compact />
      ))}
    </div>
  </div>
);

// --- MonthView : compact aussi ---
const MonthView = () => (
  <div className="mt-4">
    <div className="mb-3 flex items-center gap-2">
      <button type="button" onClick={goPrevMonth} className="rounded border px-2 py-1">◀</button>
      <div className="min-w-[180px] text-center font-medium">
        {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
      </div>
      <button type="button" onClick={goNextMonth} className="rounded border px-2 py-1">▶</button>
    </div>

    <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
      {["L", "M", "M", "J", "V", "S", "D"].map((w, i) => (
        <div key={`m-${i}`}>{w}</div>
      ))}
    </div>

    <div className="grid grid-cols-7 gap-2">
      {monthDays.map((d, i) =>
        d ? (
          <DayTile key={fmtDateLocal(d)} d={d} compact />
        ) : (
          <div key={`empty-${i}`} className="rounded border px-2 py-2 opacity-30">&nbsp;</div>
        )
      )}
    </div>
  </div>
);

  // MINI CALENDRIER — pleine case colorée, **sans prix**
  const MiniCalendar: React.FC = () => {
    if (!showMini) return null;
    const style: CSSProperties = { position: "absolute", zIndex: 50, marginTop: 6, width: 320 };
    return (
      <div ref={miniRef} style={style} className="rounded-lg border bg-white p-3 shadow">
        <div className="mb-2 flex items-center justify-between">
          <button onClick={goPrevMonth} className="rounded border px-2 py-1">◀</button>
          <div className="text-sm font-medium">
            {monthCursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
          </div>
          <button onClick={goNextMonth} className="rounded border px-2 py-1">▶</button>
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
                className={
                  "rounded border px-2 py-2 text-left " +
                  tileBgClassForPrice(patchedCalendar[fmtDateLocal(d)]?.prix ?? null, calStats.min, calStats.max) +
                  (fmtDateLocal(d) === dateStr ? " ring-2 ring-blue-400" : "")
                }
                title={
                  patchedCalendar[fmtDateLocal(d)]?.prix == null
                    ? "Indisponible"
                    : `${patchedCalendar[fmtDateLocal(d)]?.prix} €`
                }
              >
                <div className="text-[12px] font-medium">{d.getDate()}</div>
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
    const start = parseYMDLocal(dateStr) ?? new Date();
    const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000;

    const bars = results
      .map((r) => {
        const dep = parseISOorLocal(r.departISO || "");
        const arr = parseISOorLocal(r.arriveeISO || "");
        const s = dep ? dep.getTime() : dayStart + 8 * 3600 * 1000; // 08:00 fallback
        const e = arr ? arr.getTime() : s + (r.dureeMin ?? 120) * 60000;
        const clampedS = Math.max(dayStart, Math.min(s, dayEnd));
        const clampedE = Math.max(dayStart + 10 * 60 * 1000, Math.min(e, dayEnd));
        const left = ((clampedS - dayStart) / (dayEnd - dayStart)) * 100;
        const width = ((clampedE - clampedS) / (dayEnd - dayStart)) * 100;
        return { left, width };
      })
      .filter((b) => Number.isFinite(b.left) && Number.isFinite(b.width));

    return (
      <div className="mt-6">
        <div className="mb-1 text-xs text-gray-500">Timeline (barre surlignée = résultat sélectionné)</div>
        <div className="relative h-4 sm:h-5 md:h-6 w-full rounded border bg-gray-50">
          {bars.map((b, i) => (
            <div
              key={i}
              className={`absolute top-0 h-full rounded ${
                i === selectedIndex ? "bg-blue-600" : "bg-blue-300/80"
              }`}
              style={{ left: `${b.left}%`, width: `${Math.max(b.width, 2)}%` }}
              title={`Vol ${i + 1}`}
            />
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-gray-500">
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
        </div>
      </div>
    );
  };

  const ResultsList = () => (
    <div className="mt-4 space-y-3">
      {loadingRes ? (
        <div className="py-8 text-center text-sm text-gray-500">Recherche…</div>
      ) : results.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Aucun résultat pour cette date (ou filtres trop restrictifs).
        </div>
      ) : (
        results.map((r, i) => (
          <div
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={
              "cursor-pointer rounded border p-3 transition " +
              (i === selectedIndex ? "ring-2 ring-blue-400 border-blue-400 bg-blue-50/40" : "hover:shadow")
            }
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setSelectedIndex(i);
            }}
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
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className="rounded-full border px-2 py-0.5">{(r.escales ?? 0) === 0 ? "Direct" : "Avec escale(s)"}</span>
              <span className="rounded-full border px-2 py-0.5">{r.um_ok ? "🧒 UM OK" : "🧒 UM —"}</span>
              <span className="rounded-full border px-2 py-0.5">{r.animal_ok ? "🐾 Animaux OK" : "🐾 Animaux —"}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );

  // --------- Render

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
              const d = parseYMDLocal(v);
              if (d) setMonthCursor(d);
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

        <div className="md:col-span-2 grid grid-cols-3 items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
            Direct
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={um} onChange={(e) => setUm(e.target.checked)} />
            UM
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} />
            Animaux
          </label>
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
          <button onClick={doShare} type="button" className="rounded border px-3 py-1" title="Partager">
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

      {/* petit lien debug */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">API ping</a>
      </div>
    </main>
  );
}