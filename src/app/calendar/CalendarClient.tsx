// src/app/calendar/CalendarClient.tsx
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

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const monthKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const firstDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const lastDayOfMonth = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0);

// YYYY-MM-DD (local)
const fmtDateLocal = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const parseYMDLocal = (s?: string) => {
  if (!s) return undefined;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]),
    mm = Number(m[2]),
    dd = Number(m[3]);
  return new Date(y, mm - 1, dd, 0, 0, 0, 0);
};

const frenchWeekLabels = ["L", "M", "M", "J", "V", "S", "D"];

function classifyPrice(prix: number | null, min: number, max: number) {
  if (prix == null) return "empty";
  if (max === min) return "low";
  const t = (prix - min) / (max - min);
  if (t <= 0.33) return "low";
  if (t <= 0.66) return "mid";
  return "high";
}

/* ---------------------------
   Composant principal
--------------------------- */
export default function CalendarClient() {
  const router = useRouter();
  const params = useSearchParams();

  // États des champs (mêmes clés que la page Search pour compat URL)
  const [origin, setOrigin] = useState(params.get("origin") || "PAR");
  const [destination, setDestination] = useState(
    params.get("destination") || "BCN"
  );
  const [direct, setDirect] = useState(params.get("direct") === "1");
  const [um, setUm] = useState(params.get("um") === "1");
  const [pets, setPets] = useState(params.get("pets") === "1");

  // Curseur de mois (par défaut : mois de la date passée en query ? sinon aujourd’hui)
  const initialMonth =
    (() => {
      const qMonth = params.get("month");
      if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) {
        const [y, m] = qMonth.split("-").map(Number);
        return new Date(y, m - 1, 1);
      }
      const qDate = parseYMDLocal(params.get("date") || undefined);
      return qDate ? new Date(qDate.getFullYear(), qDate.getMonth(), 1) : firstDayOfMonth(new Date());
    })();

  const [monthCursor, setMonthCursor] = useState<Date>(initialMonth);

  // Data
  const [calendar, setCalendar] = useState<CalendarMap>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pour placer un “min” validé par la page Search si on vient de là (optionnel, simple cohérence visuelle)
  const pinnedMinByDateRef = useRef<Record<string, number>>({});
  const [pinnedVersion, setPinnedVersion] = useState(0);

  // URL partageable
  const currentShareURL = useMemo(() => {
    const p = new URLSearchParams();
    p.set("origin", origin);
    p.set("destination", destination);
    p.set("month", monthKey(monthCursor));
    p.set("direct", direct ? "1" : "0");
    p.set("um", um ? "1" : "0");
    p.set("pets", pets ? "1" : "0");
    return `/calendar?${p.toString()}`;
  }, [origin, destination, monthCursor, direct, um, pets]);

  // Pousser l’URL (sans reload)
  useEffect(() => {
    if (typeof window === "undefined") return;
    router.replace(currentShareURL as any);
  }, [router, currentShareURL]);

  // Fetch calendrier
  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const m = monthKey(monthCursor);
      const url = `/api/calendar?origin=${encodeURIComponent(
        origin
      )}&destination=${encodeURIComponent(destination)}&month=${m}${
        direct ? "&direct=1" : ""
      }${um ? "&um=1" : ""}${pets ? "&pets=1" : ""}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        throw new Error(`${r.status} ${r.statusText} — ${txt.slice(0, 160)}`);
      }
      const data = await r.json();

      const raw = (data?.calendar ?? {}) as Record<
        string,
        { prix?: unknown; disponible?: unknown }
      >;

      const sanitized: CalendarMap = {};
      for (const [k, v] of Object.entries(raw)) {
        const rawPrice =
          typeof v?.prix === "number" ? v.prix : Number(v?.prix);
        const prix =
          Number.isFinite(rawPrice) && rawPrice > 0
            ? Math.round(rawPrice)
            : null;
        const disponible = Boolean(v?.disponible);
        sanitized[k] = { prix, disponible };
      }
      setCalendar(sanitized);
    } catch (e: any) {
      setCalendar({});
      setErrorMsg(e?.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [origin, destination, monthCursor, direct, um, pets]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  // Affichage = union(pinned, calendar)
  const displayCalendar: CalendarMap = useMemo(() => {
    const keys = new Set<string>([
      ...Object.keys(calendar),
      ...Object.keys(pinnedMinByDateRef.current),
    ]);
    const out: CalendarMap = {};
    for (const k of keys) {
      const base = calendar[k];
      const pinned = pinnedMinByDateRef.current[k];
      const prix =
        typeof pinned === "number" && pinned > 0
          ? pinned
          : typeof base?.prix === "number"
          ? base!.prix!
          : null;
      const disponible = base?.disponible ?? (prix != null);
      out[k] = { prix, disponible };
    }
    return out;
  }, [calendar, pinnedVersion]);

  const calStats = useMemo(() => {
    const values = Object.values(displayCalendar)
      .map((d) => d.prix)
      .filter((x): x is number => typeof x === "number");
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    return { min, max };
  }, [displayCalendar]);

  // Navigation mois
  const goPrevMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() - 1, 1);
    setMonthCursor(d);
  };
  const goNextMonth = () => {
    const d = new Date(monthCursor);
    d.setMonth(d.getMonth() + 1, 1);
    setMonthCursor(d);
  };

  // Aller à Search sur clic jour
  const goToSearch = (ymd: string) => {
    const p = new URLSearchParams();
    p.set("origin", origin);
    p.set("destination", destination);
    p.set("date", ymd);
    p.set("direct", direct ? "1" : "0");
    p.set("um", um ? "1" : "0");
    p.set("pets", pets ? "1" : "0");
    router.push(`/search?${p.toString()}`);
  };

  // Form submit = reload mois courant
  const onSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    loadCalendar();
  };

  // UI helpers
  const DayTile: React.FC<{ d: Date | null }> = ({ d }) => {
    if (!d) {
      return <div className="rounded border px-2 py-2 opacity-30 h-[72px] sm:h-[84px] md:h-[96px]" />;
    }
    const key = fmtDateLocal(d);
    const info = displayCalendar[key];
    const tone = classifyPrice(info?.prix ?? null, calStats.min, calStats.max);
    const bg =
      tone === "low"
        ? "bg-green-100 border-green-300"
        : tone === "mid"
        ? "bg-yellow-100 border-yellow-300"
        : tone === "empty"
        ? "bg-gray-100 border-gray-300 text-gray-400"
        : "bg-rose-100 border-rose-300";

    return (
      <button
        onClick={() => goToSearch(key)}
        title={key}
        className={[
          "rounded border transition hover:shadow",
          "h-[72px] sm:h-[84px] md:h-[96px]",
          "flex flex-col justify-between px-2 py-2 text-left",
          bg,
        ].join(" ")}
      >
        <div className="text-sm font-medium">{d.getDate()}</div>
        <div className="text-lg font-semibold">
          {info?.prix == null ? "—" : `${info.prix} €`}
        </div>
      </button>
    );
  };

  const monthDays = useMemo(() => {
    const first = firstDayOfMonth(monthCursor);
    const last = lastDayOfMonth(monthCursor);
    const startCol = (first.getDay() + 6) % 7; // L=0
    const days: (Date | null)[] = [];
    for (let i = 0; i < startCol; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), d));
    }
    return days;
  }, [monthCursor]);

  const doShare = async () => {
    const base =
      typeof window !== "undefined" && window.location
        ? window.location.origin
        : "";
    const url = `${base}${currentShareURL}`;
    try {
      const nav: any =
        (typeof navigator !== "undefined" ? navigator : {}) as any;
      if (nav?.share && typeof nav.share === "function") {
        await nav.share({
          title: "Comparateur — calendrier",
          text: "Calendrier des prix",
          url,
        });
      } else if (nav?.clipboard?.writeText) {
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

  return (
    <main className="mx-auto max-w-5xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">Calendrier — min prix par jour</h1>

      {/* Formulaire critères */}
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-6">
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
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm text-gray-600">Mois (YYYY-MM)</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={monthKey(monthCursor)}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d{4}-\d{2}$/.test(v)) {
                const [y, m] = v.split("-").map(Number);
                setMonthCursor(new Date(y, m - 1, 1));
              }
            }}
          />
        </div>
        <div className="flex items-end justify-between gap-2 md:col-span-2">
          <div className="flex flex-col gap-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={direct}
                onChange={(e) => setDirect(e.target.checked)}
              />
              Direct
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={um}
                onChange={(e) => setUm(e.target.checked)}
              />
              UM
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pets}
                onChange={(e) => setPets(e.target.checked)}
              />
              Animaux
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border px-3 py-1"
              onClick={goPrevMonth}
              title="Mois précédent"
            >
              ◀
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1"
              onClick={goNextMonth}
              title="Mois suivant"
            >
              ▶
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Rafraîchir
            </button>
            <button
              type="button"
              onClick={doShare}
              className="rounded border px-3 py-1"
              title="Partager"
            >
              🔗 Partager
            </button>
          </div>
        </div>
      </form>

      {/* Zone erreurs / retry */}
      {errorMsg && (
        <div className="mt-3 rounded border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          Erreur: {errorMsg}{" "}
          <button
            onClick={loadCalendar}
            className="ml-2 rounded border px-2 py-0.5 text-rose-800"
          >
            Retry
          </button>
        </div>
      )}

      {/* Grille calendrier */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Chargement du calendrier…
          <div className="mt-3 grid grid-cols-7 gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] sm:h-[84px] md:h-[96px] animate-pulse rounded border bg-gray-100"
              />
            ))}
          </div>
        </div>
      ) : Object.keys(displayCalendar).length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          Aucune donnée pour ce mois.
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs text-gray-500">
            {frenchWeekLabels.map((w, i) => (
              <div key={`w-${i}`}>{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {(() => {
              const first = firstDayOfMonth(monthCursor);
              const last = lastDayOfMonth(monthCursor);
              const startCol = (first.getDay() + 6) % 7;
              const cells: (Date | null)[] = [];
              for (let i = 0; i < startCol; i++) cells.push(null);
              for (let d = 1; d <= last.getDate(); d++) {
                cells.push(
                  new Date(
                    monthCursor.getFullYear(),
                    monthCursor.getMonth(),
                    d
                  )
                );
              }
              return cells.map((d, i) => <DayTile key={i} d={d} />);
            })()}
          </div>
        </div>
      )}

      {/* petit lien debug */}
      <div className="mt-8 text-xs text-gray-500">
        <a className="underline" href="/api/ping">
          API ping
        </a>
      </div>
    </main>
  );
}