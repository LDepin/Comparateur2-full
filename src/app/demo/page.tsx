'use client';

import React, { useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

type Profile = { id: string; label: string; default_for_search: boolean };
type MeResponse = { email: string; profiles: Profile[] };

type QuoteOut = { total: number; currency: string; breakdown: Record<string, number> };

export default function DemoPage() {
  const [token, setToken] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [origin, setOrigin] = useState('PAR');
  const [destination, setDestination] = useState('BCN');
  const [date, setDate] = useState('2025-10-12');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Récupère le token (stocké par /account/profiles)
  useEffect(() => {
    setToken(localStorage.getItem('dev_jwt') || '');
  }, []);

  const hasDefault = useMemo(
    () => me?.profiles?.some((p) => p.default_for_search) ?? false,
    [me]
  );

  const fetchMe = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as MeResponse;
      setMe(data);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuote = async () => {
    if (!token) {
      setError('Colle d’abord le jeton dans /account/profiles.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin, destination, date }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as QuoteOut;
      setQuote(data);
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  // Auto-charge /me si un token est présent
  useEffect(() => {
    if (token) fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Démo — Devis “live” par profil</h1>

      {!token && (
        <div className="p-3 rounded-xl border bg-yellow-50">
          Colle ton JWT dans <a className="underline" href="/account/profiles">/account/profiles</a> puis reviens ici.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span>Origine (IATA)</span>
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value.toUpperCase())}
            className="rounded-xl border px-3 py-2"
            placeholder="PAR"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Destination (IATA)</span>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value.toUpperCase())}
            className="rounded-xl border px-3 py-2"
            placeholder="BCN"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Date</span>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border px-3 py-2"
            placeholder="YYYY-MM-DD"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/account/profiles" className="px-3 py-2 rounded-xl border">Gérer mes profils</a>
        <button onClick={fetchMe} className="px-3 py-2 rounded-xl border" disabled={!token || loading}>
          {loading ? 'Chargement…' : 'Charger mon profil'}
        </button>
        <button onClick={fetchQuote} className="px-3 py-2 rounded-xl bg-black text-white" disabled={!token || loading}>
          {loading ? 'Calcul…' : 'Calculer un prix'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      {me && (
        <div className="rounded-2xl border p-4 bg-white">
          <div className="font-medium">Connecté : {me.email}</div>
          <div className="text-sm text-gray-600 mt-1">
            Profils : {me.profiles.length > 0 ? me.profiles.map((p) => p.label).join(', ') : 'aucun'}
          </div>
          <div className="text-sm mt-1">
            Profil par défaut : {me.profiles.find((p) => p.default_for_search)?.label ?? '—'}{' '}
            {hasDefault ? '✅' : '⚠️'}
          </div>
        </div>
      )}

      {quote && (
        <div className="rounded-2xl border p-4 bg-white space-y-2">
          <div className="text-xl">
            Prix calculé : <span className="font-semibold">{quote.total} {quote.currency}</span>
          </div>
          <div className="text-sm text-gray-600">Détail :</div>
          <ul className="text-sm list-disc ml-6">
            {Object.entries(quote.breakdown).map(([k, v]) => (
              <li key={k}>
                <span className="inline-block min-w-32">{k}</span>{' '}
                <span className={v >= 0 ? 'text-gray-800' : 'text-emerald-700'}>
                  {v >= 0 ? `+${v}` : v} €
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}