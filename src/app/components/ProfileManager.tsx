'use client';

import React, { useEffect, useMemo, useState } from 'react';

// Base API (prend la var d'env si dispo)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

// ===== Types =====
type Profile = {
  id: string;
  label: string;
  default_for_search: boolean;
  // champs optionnels simples
  birthdate?: string | null;
};

type MeResponse = {
  email: string;
  profiles: Profile[];
};

type ProfileIn = {
  label: string;
  birthdate?: string | null;
  default_for_search?: boolean;
};

// ===== UI helpers =====
function Spinner() {
  return <div className="animate-pulse text-sm opacity-75">Chargement…</div>;
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200">
      {error}
    </div>
  );
}

function TokenBox({
  token,
  setToken,
  onSave,
}: {
  token: string;
  setToken: (v: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-2xl border bg-white shadow-sm">
      <label htmlFor="dev_jwt" className="text-sm font-medium">
        Jeton (JWT) de dev
      </label>
      <input
        id="dev_jwt"
        name="dev_jwt"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="eyJhbGciOi..."
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
        autoComplete="off"
        inputMode="text"
      />
      <div className="text-xs text-gray-500">
        Génère-le côté backend : <code>python -m app.utils.dev_token ton.email@domaine.com</code>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
          type="button"
        >
          Enregistrer le jeton
        </button>
        <button
          onClick={() => {
            setToken('');
            localStorage.removeItem('dev_jwt');
          }}
          className="px-3 py-2 rounded-xl border"
          type="button"
        >
          Effacer
        </button>
      </div>
    </div>
  );
}

function ProfileForm({
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  initial?: Partial<Profile & { id?: string }>;
  onCancel: () => void;
  onSubmit: (payload: ProfileIn, id?: string) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [defaultForSearch, setDefaultForSearch] = useState<boolean>(
    Boolean(initial?.default_for_search)
  );

  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Nom du profil</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-xl border px-3 py-2 outline-none focus:ring"
            placeholder="Moi, Famille, Pro…"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Date de naissance (YYYY-MM-DD)</span>
          <input
            value={birthdate ?? ''}
            onChange={(e) => setBirthdate(e.target.value)}
            className="rounded-xl border px-3 py-2 outline-none focus:ring"
            placeholder="1990-05-10"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={defaultForSearch}
            onChange={(e) => setDefaultForSearch(e.target.checked)}
          />
          Définir comme profil par défaut
        </label>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          onClick={() =>
            onSubmit(
              {
                label: label.trim(),
                birthdate: birthdate || undefined,
                default_for_search: defaultForSearch,
              },
              initial?.id
            )
          }
          className="px-3 py-2 rounded-xl bg-black text-white disabled:opacity-60"
          disabled={submitting || !label.trim()}
        >
          {submitting ? 'Enregistrement…' : initial?.id ? 'Mettre à jour' : 'Créer'}
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-xl border">
          Annuler
        </button>
      </div>
    </div>
  );
}

// ===== Composant principal =====
export default function ProfileManager() {
  const [token, setToken] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);

  const hasToken = !!token;

  // Charger le token sauvegardé
  useEffect(() => {
    const saved = localStorage.getItem('dev_jwt') || '';
    if (saved) setToken(saved);
  }, []);

  // ===== API calls (directs) =====
  const apiGetMe = async (t: string): Promise<MeResponse> => {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`/api/users/me: ${res.status} ${res.statusText}`);
    return res.json();
  };

  const apiCreateProfile = async (t: string, payload: ProfileIn) => {
    const res = await fetch(`${API_BASE}/api/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`POST /api/profiles: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  };

  const apiUpdateProfile = async (t: string, id: string, payload: ProfileIn) => {
    // On utilise PUT s’il existe chez toi; sinon on pourrait faire PATCH.
    const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`PUT /api/profiles/${id}: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  };

  const apiDeleteProfile = async (t: string, id: string) => {
    const res = await fetch(`${API_BASE}/api/profiles/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`DELETE /api/profiles/${id}: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  };

  const apiSetDefault = async (t: string, id: string) => {
    const res = await fetch(`${API_BASE}/api/profiles/${id}/default`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`PATCH /api/profiles/${id}/default: ${res.status} ${res.statusText} ${txt}`);
    }
    return res.json();
  };

  // ===== Handlers =====
  const fetchMe = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetMe(token);
      setMe(data);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const onSaveToken = () => {
    localStorage.setItem('dev_jwt', token);
    fetchMe();
  };

  const onCreate = async (payload: ProfileIn) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiCreateProfile(token, payload);
      await fetchMe();
      setEditing(null);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const onUpdate = async (id?: string, payload?: ProfileIn) => {
    if (!token || !id || !payload) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiUpdateProfile(token, id, payload);
      await fetchMe();
      setEditing(null);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiDeleteProfile(token, id);
      await fetchMe();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const onSetDefault = async (id: string) => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSetDefault(token, id);
      await fetchMe();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== Rendu =====
  const defaultId = useMemo(
    () => me?.profiles.find((p) => p.default_for_search)?.id,
    [me]
  );

  return (
    <section className="mx-auto max-w-3xl p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Profils voyageurs</h2>

      <TokenBox token={token} setToken={setToken} onSave={onSaveToken} />
      {!hasToken && (
        <div className="text-sm text-gray-600">Colle un jeton pour charger tes profils.</div>
      )}
      {error && <ErrorBox error={error} />}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setEditing({ id: '', label: '', default_for_search: false })}
          className="px-3 py-2 rounded-xl bg-black text-white"
          disabled={!hasToken}
        >
          + Nouveau profil
        </button>
        <button
          onClick={fetchMe}
          className="px-3 py-2 rounded-xl border"
          disabled={!hasToken || loading}
        >
          {loading ? 'Actualisation…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="grid gap-3">
        {loading && <Spinner />}
        {!loading && me?.profiles?.length === 0 && (
          <div className="text-sm text-gray-600">Aucun profil. Crée ton premier profil !</div>
        )}

        {!loading &&
          me?.profiles?.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-2xl border p-4 bg-white"
            >
              <div>
                <div className="font-medium">
                  {p.label}{' '}
                  {p.default_for_search && (
                    <span className="text-xs rounded-full px-2 py-0.5 border ml-2">
                      Par défaut
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {p.birthdate ? `Naissance : ${p.birthdate}` : ''}
                </div>
                {defaultId === p.id && (
                  <div className="text-xs text-emerald-600">Utilisé pour les recherches</div>
                )}
              </div>
              <div className="flex gap-2">
                {!p.default_for_search && (
                  <button
                    className="px-3 py-2 rounded-xl border"
                    onClick={() => onSetDefault(p.id)}
                    disabled={submitting}
                  >
                    Définir par défaut
                  </button>
                )}
                <button
                  className="px-3 py-2 rounded-xl border"
                  onClick={() => setEditing(p)}
                >
                  Modifier
                </button>
                <button
                  className="px-3 py-2 rounded-xl border text-red-600"
                  onClick={() => onDelete(p.id)}
                  disabled={submitting}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
      </div>

      {editing && (
        <ProfileForm
          initial={editing}
          submitting={submitting}
          onCancel={() => setEditing(null)}
          onSubmit={(payload, id) => {
            if (id) onUpdate(id, payload);
            else onCreate(payload);
          }}
        />
      )}

      <div className="text-xs text-gray-400 pt-6">
        API: <code>{API_BASE}</code>
      </div>
    </section>
  );
}