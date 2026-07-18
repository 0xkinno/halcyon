import { network } from "@/config/network";
import { authHeaders, getSession } from "@/lib/auth/session";
import { getOrActivateServerSession } from "@/lib/auth/serverSession";

/**
 * Ensures an active server session and returns auth headers.
 */
async function getAuthenticatedHeaders(): Promise<Record<string, string>> {
  if (!getSession()) {
    await getOrActivateServerSession();
  }
  return authHeaders();
}

/**
 * Authenticated REST client for TxLINE API.
 */
export async function txlineGet(path: string, params?: Record<string, string | number>): Promise<any> {
  const headers = await getAuthenticatedHeaders();
  
  let url = `${network.apiOrigin}${path}`;
  if (params) {
    const query = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v.toString())}`)
      .join("&");
    url += `?${query}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TxLINE GET failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function txlinePost(path: string, body?: any): Promise<any> {
  const authH = await getAuthenticatedHeaders();
  const headers = {
    ...authH,
    "Content-Type": "application/json",
  };

  const res = await fetch(`${network.apiOrigin}${path}`, {
    method: "POST",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TxLINE POST failed: ${res.status} ${text}`);
  }

  return res.json();
}
