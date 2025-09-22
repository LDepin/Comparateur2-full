export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

export type Profile = { id: string; label: string; default_for_search: boolean };
export type MeResponse = { email: string; profiles: Profile[] };

export type PetType = 'dog' | 'cat' | 'other';
export type ProfileIn = {
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

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
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

export const getMe = (token: string) => api<MeResponse>('/api/users/me', token);
export const createProfile = (token: string, payload: ProfileIn) =>
  api<Profile>('/api/profiles', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateProfile = (token: string, id: string, payload: ProfileIn) =>
  api<Profile>(`/api/profiles/${id}`, token, { method: 'PUT', body: JSON.stringify(payload) });
export const deleteProfile = (token: string, id: string) =>
  api<{ ok: true }>(`/api/profiles/${id}`, token, { method: 'DELETE' });