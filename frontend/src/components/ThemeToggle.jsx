import React, { useEffect, useState } from "react";

const KEY = "medsync-theme";
const SUN = "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4";
const MOON = "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z";

// Light/dark switch. The first choice follows the system setting; after that the person's choice is remembered.
export default function ThemeToggle({ floating = false, round = false }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try { localStorage.setItem(KEY, dark ? "dark" : "light"); } catch { /* storage may be blocked */ }
  }, [dark]);
  const label = dark ? "Light mode" : "Dark mode";
  return (
    <button type="button" className={floating ? "theme-fab" : round ? "theme-round" : ""} onClick={() => setDark(!dark)} aria-label={`Switch to ${label.toLowerCase()}`} title={label}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={dark ? SUN : MOON} /></svg>
      {!floating && !round && label}
    </button>
  );
}
