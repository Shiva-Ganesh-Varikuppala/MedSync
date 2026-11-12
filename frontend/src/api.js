// One place that talks to the backend.
//   api("/medicines", { token })            -> parsed JSON ({ success, message, data })
//   api("/auth/login", { method: "POST", body })
// A 401 on an authenticated call means the session expired: we tell the app to sign out.
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

// How many requests are in flight right now. The thin loading bar at the top of the page listens to this.
let pending = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
export const subscribePending = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getPending = () => pending;

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, options = {}) {
  pending += 1; notify();
  try { return await request(path, options); }
  finally { pending -= 1; notify(); }
}

// file: a File/Blob sent as the raw request body (uploads); blob: true returns the response as a Blob (downloads).
async function request(path, { token, method = "GET", body, file, blob } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": file ? file.type : "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(file ? { body: file } : body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }
  if (response.status === 204) return { success: true, data: null };
  if (blob && response.ok) return response.blob();
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(data.message || `Request failed (${response.status})`, response.status);
  }
  return data;
}
