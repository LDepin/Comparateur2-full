'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ProfileManager from '../../../src/app/components/ProfileManager';

/** ========== Config ===========
 * Mets NEXT_PUBLIC_API_BASE dans ton .env.local si besoin, ex:
 * NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
 * Sinon on prend http://127.0.0.1:8000 par défaut.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

/** ========= Types ========= */
type Profile = {
  id: string;
  label: string;
  default_for_search: boolean;
};
type MeResponse = {
  email: string;
  profiles: Profile[];
};
type PetType = 'dog' | 'cat' | 'other';
type ProfileIn = {
  label: string;
  birthdate?: string | null;
  is_unaccompanied_minor?: boolean;
  has_disability?: boolean;
  assistance_needs?: string | null;
  pet?: { type?: PetType | null; cabin?: boolean | null } | null;
  loyalty_programs?: Array<Record<string, any>>;
  discount_cards?: Array<Record<string, any>>;
  student?: boolean;
  youth?: boolean;
  senior?: boolean;
  baggage?: { cabin?: number | null; checked?: number | null } | null;
  seating_prefs?: Record<string, any> | null;
  default_for_search?: boolean;
};

/** ========= Helpers API ========= */
async function api<T>(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText} — ${txt}`);
  }
  return res.json();
}

async function getMe(token: string): Promise<MeResponse> {
  return api<MeResponse>('/api/users/me', token);
}
async function createProfile(token: string, payload: ProfileIn): Promise<Profile> {
  return api<Profile>('/api/profiles', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
async function updateProfile(
  token: string,
  id: string,
  payload: ProfileIn,
): Promise<Profile> {
  return api<Profile>(`/api/profiles/${id}`, token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
async function deleteProfile(token: string, id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/profiles/${id}`, token, { method: 'DELETE' });
}

/** ========= UI ========= */
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
      <div className="text-sm font-medium">Jeton (JWT) de dev</div>
      <input
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Bearer eyJhbGciOi..."
        className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
      />
      <div className="text-xs text-gray-500">
        Astuce : génère-le dans le backend :{' '}
        <code>python -m app.utils.dev_token ton.email@domaine.com</code>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          className="px-3 py-2 rounded-xl bg-black text-white hover:opacity-90"
        >
          Enregistrer le jeton
        </button>
        <button
          onClick={() => {
            setToken('');
            localStorage.removeItem('dev_jwt');
          }}
          className="px-3 py-2 rounded-xl border"
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
  initial?: Partial<ProfileIn & { id?: string }>;
  onCancel: () => void;
  onSubmit: (payload: ProfileIn, id?: string) => void;
  submitting: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [defaultForSearch, setDefaultForSearch] = useState(
    initial?.default_for_search ?? false,
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
                label,
                birthdate: birthdate || undefined,
                default_for_search: defaultForSearch,
              },
              initial?.id,
            )
          }
          className="px-3 py-2 rounded-xl bg-black text-white disabled:opacity-60"
          disabled={submitting || !label.trim()}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={onCancel} className="px-3 py-2 rounded-xl border">
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function AccountPage() {
  const [token, setToken] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const hasToken = !!token;

  useEffect(() => {
    const saved = localStorage.getItem('dev_jwt') || '';
    if (saved) setToken(saved);
  }, []);

  const fetchMe = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMe(token);
      setMe(data);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchMe();
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
      await createProfile(token, payload);
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
      await updateProfile(token, id, payload);
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
      await deleteProfile(token, id);
      await fetchMe();
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSubmitting(false);
    }
  };

  const defaultId = useMemo(
    () => me?.profiles.find((p) => p.default_for_search)?.id,
    [me],
  );

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Mon compte — Profils voyageurs</h1>

      {/* JWT input */}
      <TokenBox token={token} setToken={setToken} onSave={onSaveToken} />

      {!hasToken && (
        <div className="text-sm text-gray-600">
         56cffa17-9eec-4c85-bd5c-1db8cae0fba6
        </div>
      )}

      {error && <ErrorBox error={error} />}

      {/* Actions */}
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

      {/* Liste */}
      <div className="grid gap-3">
        {loading && <Spinner />}
        {!loading && me?.profiles?.length === 0 && (
          <div className="text-sm text-gray-600">
            Aucun profil. Crée ton premier profil !
          </div>
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
                <div className="text-xs text-gray-500 break-all">{me?.email}</div>
                {defaultId === p.id && (
                  <div className="text-xs text-emerald-600">Utilisé pour les recherches</div>
                )}
              </div>
              <div className="flex gap-2">
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

      {/* Formulaire (création/édition) */}
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
    </div>
  );
}