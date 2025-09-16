"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

/* ---------------------------
   Types & helpers
--------------------------- */

type CalendarDay = { prix: number | null; disponible: boolean };
type CalendarMap = Record<string, CalendarDay>; // "YYYY-MM-DD" -> { prix, disponible }

type SortKey = "price" | "duration" | "depart";
type ViewMode = "week" | "month";

type FlightRaw = any;
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
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );
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
const lastDayOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0);

// format local YYYY-MM-DD (sans fuseau)
const fmtDateLocal = (d: Date) => {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// parse "YYYY-MM-DD" en Date locale (00:00 locale)
const parseYMDLocal = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  return new Date(y, mm - 1, dd, 0, 0, 0, 0);
};

const frenchWeekLetters = ["L", "M", "M2", "J", "V", "S", "D"];
const frenchWeekLabels = ["L", "M", "M", "J", "V", "S", "D"];

function classifyPrice(prix: number | null, min: number, max: number) {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / (max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
}

function normalizeFlight(r: FlightRaw): Flight {
  const price = typeof r?.prix === "number" ? r.prix : Number(r?.prix ?? NaN);

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
    departText: dep ? toLocalHHMM(dep.toISOString()) : "—",
    arriveeText: arr ? toLocalHHMM(arr.toISOString()) : "—",
    dureeMin: dureeMin ?? undefined,
  };
}

/* ---------------------------
   Composant principal
--------------------------- */

export default function SearchClient(): JSX.Element {
  const router = useRouter();
  const params = useSearchParams();

  // états champs
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(
    params.get("destination") || "BCN"
  );
  const initialDate = parseYMDLocal(params.get("date") || undefined) ?? new Date();
  const [dateStr, setDateStr] = useState<string>(fmtDateLocal(initialDate));
  const [sort, setSort] = useState<SortKey>(
    (params.get("sort") as SortKey) || "price"
  );
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUm] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");
  const [view, setView] = useState<ViewMode>(
    (params.get("view") as ViewMode) || "month"
  );

  // data
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [results, setResults] = useState<Flight[]>([]);
  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRes, setLoadingRes] = useState(false);

  // sélection d’un résultat (timeline + carte)
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // mini-calendrier
  const [showMini, setShowMini] = useState(false);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  // mois affiché
  const [monthCursor, setMonthCursor] = useState<Date>(() => initialDate);

  // helper local : format YYYY-MM-DD en local
  const fmtDate = (d: Date): string => fmtDateLocal(d);

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

  // pousser l’URL (sans rechargement)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const abs = new URL(currentShareURL, window.location.origin);
    router.replace(abs as unknown as string); // RouteImpl<string> vs URL — cast sûr côté client
  }, [router, currentShareURL]);

  // fetch calendrier
  const loadCalendar = useCallback(
    async (cursor: Date) => {
      setLoadingCal(true);
      try {
        const m = monthKey(cursor);
        const url = `/api/calendar?origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(destination)}&month=${m}${
          direct ? "&direct=1" : ""
        }${um ? "&um=1" : ""}${pets ? "&pets=1" : ""}`;
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
    [origin, destination, direct, um, pets]
  );

  // fetch résultats
  const loadResults = useCallback(
    async (dStr: string) => {
      setLoadingRes(true);
      try {
        const url = `/api/search?origin=${encodeURIComponent(
          origin
        )}&destination=${encodeURIComponent(destination)}&date=${dStr}${
          direct ? "&direct=1" : ""
        }${um ? "&um=1" : ""}${pets ? "&pets=1" : ""}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("search upstream");
        const raw = await r.json();
        let list: Flight[] = Array.isArray(raw?.results)
          ? raw.results.map(normalizeFlight)
          : [];

        // filtre direct si demandé (sécurité)
        if (direct) list = list.filter((x) => (x.escales ?? 0) === 0);

        // tri enrichi
        list.sort((a, b) => {
          if (sort === "price") return a.prix - b.prix;
          if (sort === "duration")
            return (a.dureeMin ?? 9e9) - (b.dureeMin ?? 9e9);
          // "depart"
          const ad = parseISOorLocal(a.departISO)?.getTime() ?? 9e13;
          const bd = parseISOorLocal(b.departISO)?.getTime() ?? 9e13;
          return ad - bd;
        });

        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setLoadingRes(false);
      }
    },
    [origin, destination, direct, um, pets, sort]
  );

  // init / rafraîchissements
  useEffect(() => {
    loadCalendar(parseYMDLocal(dateStr) ?? new Date());
  }, [loadCalendar, dateStr]);

  useEffect(() => {
    loadResults(dateStr);
  }, [loadResults, dateStr]);

  // recalibrage sélection résultats (timeline/carte)
  useEffect(() => {
    if (results.length === 0) setSelectedIndex(-1);
    else if (selectedIndex < 0 || selectedIndex >= results.length)
      setSelectedIndex(0);
  }, [results, selectedIndex]);

  // patch calendrier avec min du jour sélectionné (pour cohérence couleur)
  const patchedCalendar = useMemo(() => {
    const copy: CalendarMap = { ...calendar };
    const dayMin =
      results.length > 0 ? Math.min(...results.map((r) => r.prix)) : null;
    const key = dateStr;
    if (copy[key]) copy[key] = { prix: dayMin, disponible: copy[key].disponible };
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

  // sélection d’un jour
  const selectDay = (d: Date) => {
    const s = fmtDate(d);
    setDateStr(s);
    setMonthCursor(d);
  };

  // semaine autour de dateStr
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

  // grille mois avec jours vides
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

  // partage
  const doShare = async () => {
    const base =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const url = `${base}${currentShareURL}`;
    try {
      if (
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        // @ts-expect-error — API Web Share non typée partout
        typeof navigator.share === "function"
      ) {
        // @ts-expect-error — API Web Share non typée partout
        await navigator.share({
          title: "Comparateur — vols",
          text: "Résultats de recherche",
          url,
        });
      } else {
        const nav: any = navigator as any;
        if (nav?.clipboard?.writeText) {
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

  /* ---------------------------
     RENDUS
  --------------------------- */

  // helper local : format "YYYY-MM-DD" en heure locale (utilisé dans DayTile)
  const fmtDate_compat = (d: Date): string => fmtDateLocal(d);

  const PriceBadge: React.FC<{ value: number | null }> = ({ value }) => {
    const tone = classifyPrice(value, calStats.min, calStats.max);
    const cls =
      tone === "low"
        ? "bg-green-100 border-green-300"
        : tone === "mid"
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
    const key = fmtDate_compat(d);
    const info = patchedCalendar[key];
    const selected = key === dateStr;
    return (
      <button
        onClick={() => selectDay(d)}
        title={key}
        className={[
          "rounded border transition hover:shadow",
          // hauteur uniforme (mobile > desktop)
          "h-[72px] sm:h-[84px] md:h-[96px]",
          // contenu : numéro en haut gauche + badge centré
          "flex flex-col justify-between",
          "px-2 py-2",
          selected ? "ring-2 ring-blue-400" : "",
        ].join(" ")}
      >
        <div className={`text-sm ${selected ? "font-semibold" : ""}`}>{d.getDate()}</div>
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
          <DayTile key={fmtDate_compat(d)} d={d} />
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
            <DayTile key={fmtDate_compat(d)} d={d} compact />
          ) : (
            <div key={`empty-${i}`} className="rounded border px-2 py-2 opacity-30 h-[72px] sm:h-[84px] md:h-[96px]" />
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
                key={`mini-${fmtDate_compat(d)}`}
                onClick={() => {
                  selectDay(d);
                  setShowMini(false);
                }}
                className={[
                  "rounded border px-1 py-1 text-left h-[32px]",
                  fmtDate_compat(d) === dateStr ? "ring-2 ring-blue-400" : "",
                ].join(" ")}
                title={fmtDate_compat(d)}
              >
                <div className="text-[11px]">{d.getDate()}</div>
                {/* pastille couleur (pas de prix) */}
                {(() => {
                  const tone = classifyPrice(
                    patchedCalendar[fmtDate_compat(d)]?.prix ?? null,
                    calStats.min,
                    calStats.max
                  );
                  const bg =
                    tone === "low"
                      ? "bg-green-200"
                      : tone === "mid"
                      ? "bg-yellow-200"
                      : tone === "empty"
                      ? "bg-gray-200"
                      : "bg-rose-200";
                  return <div className={`mt-0.5 h-1.5 w-4 rounded ${bg}`} />;
                })()}
              </button>
            ) : (
              <div key={`mini-empty-${i}`} />
            )
          )}
        </div>
      </div>
    );
  };

  const scrollToIdx = (idx: number) => {
    const el = itemRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* Timeline cliquable */
  const Timeline: React.FC = () => {
    const start = parseYMDLocal(dateStr) ?? new Date();
    const dayStart = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
    const dayEnd = dayStart + 24 * 3600 * 1000;

    const bars = results
      .map((r) => {
        const dep = parseISOorLocal(r.departISO || "");
        const arr = parseISOorLocal(r.arriveeISO || "");
        const s = dep ? dep.getTime() : dayStart + 8 * 3600 * 1000;
        const e = arr ? arr.getTime() : s + (r.dureeMin ?? 120) * 60000;
        const clampedS = Math.max(dayStart, Math.min(s, dayEnd));
        const clampedE = Math.max(dayStart + 10 * 60 * 1000, Math.min(e, dayEnd));
        const left = ((clampedS - dayStart) / (dayEnd - dayStart)) * 100;
        const width = ((clampedE - clampedS) / (dayEnd - dayStart)) * 100;
        return { left, width };
      })
      .filter((b) => isFinite(b.left) && isFinite(b.width));

    return (
      <div className="mt-6">
        <div className="mb-1 text-xs text-gray-500">
          Timeline (barre surlignée = résultat sélectionné)
        </div>
        <div className="relative h-4 sm:h-5 md:h-6 w-full rounded border bg-gray-50">
          {bars.map((b, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setSelectedIndex(i);
                scrollToIdx(i);
              }}
              className={`absolute top-0 h-full rounded focus:outline-none ${
                i === selectedIndex ? "bg-blue-600" : "bg-blue-300/80"
              }`}
              style={{ left: `${b.left}%`, width: `${Math.max(b.width, 2)}%` }}
              title={`Résultat ${i + 1}`}
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

  const SkeletonCard = () => (
    <div className="animate-pulse rounded border p-3">
      <div className="mb-2 h-4 w-24 rounded bg-gray-200" />
      <div className="mb-2 h-3 w-64 rounded bg-gray-200" />
      <div className="flex gap-2">
        <div className="h-6 w-16 rounded-full bg-gray-200" />
        <div className="h-6 w-20 rounded-full bg-gray-200" />
      </div>
    </div>
  );

  const ResultsList = () => (
    <div className="mt-4 space-y-3">
      {loadingRes ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : results.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Aucun résultat pour cette date (ou pas encore de recherche).
        </div>
      ) : (
        results.map((r, i) => {
          const directBadge =
            typeof r.escales === "number" ? r.escales === 0 : false;
          const selected = i === selectedIndex;
          return (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={`rounded border p-3 transition ${
                selected ? "ring-2 ring-blue-400" : ""
              }`}
              onClick={() => {
                setSelectedIndex(i);
              }}
            >
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{Math.round(r.prix)} €</div>
                <div className="text-sm text-gray-600">{r.compagnie || "—"}</div>
              </div>
              <div className="mt-1 text-sm text-gray-700">
                {r.departText} → {r.arriveeText} ·{" "}
                {r.dureeMin
                  ? `${Math.floor(r.dureeMin / 60)} h ${r.dureeMin % 60} min`
                  : "—"}{" "}
                · {typeof r.escales === "number" ? `${r.escales} escale(s)` : "—"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border px-2 py-0.5">
                  {directBadge ? "Direct" : "Avec escale(s)"}
                </span>
                <span className="rounded-full border px-2 py-0.5">🧒 UM</span>
                <span className="rounded-full border px-2 py-0.5">🐾 Animaux</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );

  /* ---------------------------
     Rendu principal
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
            <option value="depart">Heure de départ (croiss.)</option>
          </select>
        </div>

        <div className="flex items-end justify-between gap-2 md:col-span-1">
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={direct} onChange={(e) => setDirect(e.target.checked)} />
              Direct
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={um} onChange={(e) => setUm(e.target.checked)} />
              UM
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pets} onChange={(e) => setPets(e.target.checked)} />
              Animaux
            </label>
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
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
          <button onClick={doShare} type="button" className="rounded border px-3 py-1" title="Partager">
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
              <div key={i} className="h-[72px] sm:h-[84px] md:h-[96px] animate-pulse rounded border bg-gray-100" />
            ))}
          </div>
        </div>
      ) : view === "week" ? (
        <WeekView />
      ) : (
        <MonthView />
      )}

      {/* Timeline + résultats */}
      <Timeline />
      <ResultsList />

      {/* petit lien debug */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">
          API ping
        </a>
      </div>
    </main>
  );
}