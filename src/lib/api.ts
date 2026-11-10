
export interface Profile {
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

export interface MeResponse {
  user: AuthenticatedUser;
  profile: Profile | null;
  profile_status: "available" | "missing";
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "")
  .replace(/\/+$/, "");

export async function fetchMe(
  accessToken: string,
  signal?: AbortSignal,
): Promise<MeResponse> {
  if (!API_BASE_URL) {
    throw new Error("URL-ul API nu este configurat.");
  }

  const response = await fetch(`${API_BASE_URL}/api/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal,
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || `Eroare API: ${response.status}`,
    );
  }

  return result as MeResponse;
}
