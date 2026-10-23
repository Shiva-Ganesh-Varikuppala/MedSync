// One place that talks to the backend.
//   api("/medicines", { token })            -> parsed JSON ({ success, message, data })
//   api("/auth/login", { method: "POST", body })
// A 401 on an authenticated call means the session expired: we tell the app to sign out.
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function api(path, { token, method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    throw new ApiError("Cannot reach the server. Is the backend running?", 0);
  }
  if (response.status === 204) return { success: true, data: null };
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(data.message || `Request failed (${response.status})`, response.status);
  }
  return data;
}
