import { useCallback, useEffect, useState } from "react";

// Tiny address-bar routing, no library: the first path segment is the open tab ("/appts", "/profile"; "/" is the home tab).
// Back/Forward, reload and shared links all work because the address is the single source of truth.
// The server must send index.html for every path (the Vite dev server and the existing /verify-email link already rely on that).
const read = () => window.location.pathname.split("/").filter(Boolean)[0] || "";

export function usePath() {
  const [seg, setSeg] = useState(read);
  useEffect(() => {
    const on = () => setSeg(read());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const navigate = useCallback((tab) => {
    const path = tab ? `/${tab}` : "/";
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setSeg(tab || "");
  }, []);
  return [seg, navigate];
}

// An unknown or empty segment (e.g. a link meant for another role) falls back to the home tab.
export const pickTab = (shown, keys, fallback) => (keys.includes(shown) ? shown : fallback);
