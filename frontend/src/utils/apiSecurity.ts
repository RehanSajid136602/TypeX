/**
 * Helper to ensure the random session token is obtained and attached
 * to all account requests to defeat cross-origin and browser-to-localhost attacks.
 */

let cachedToken: string | null = null;

export async function getSessionToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch("/api/accounts/bootstrap");
    if (res.ok) {
      const data = await res.json();
      if (data && data.token) {
        cachedToken = data.token;
        return cachedToken as string;
      }
    }
  } catch (err) {
    console.warn("Could not retrieve session token:", err);
  }
  return "";
}

export async function authenticatedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getSessionToken();
  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set("X-TypeX-Token", token);
  }
  return fetch(input, {
    ...init,
    headers,
  });
}
