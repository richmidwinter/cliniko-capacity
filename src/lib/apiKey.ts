/**
 * The Cliniko API key is provided by the user and kept only in localStorage on
 * their machine. It is sent to our proxy (which relays to Cliniko) on each
 * request; it is never stored on the server.
 */
const STORAGE_KEY = "cliniko-api-key";

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setApiKey(key: string) {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}
