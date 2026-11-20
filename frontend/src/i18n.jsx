import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import hi from "./locales/hi";
import te from "./locales/te";
import "./i18n.css";

// A small translation layer with no library. The English text itself is the key:
//     const { t } = useI18n();   t("Doses to confirm")   t("Was due {day} at {time}", { day, time })
// A string that has no translation is shown in English, so a missing entry never breaks a screen.
export const LANGUAGES = [
  { code: "en", label: "English", locale: "en-IN" },
  { code: "hi", label: "हिन्दी", locale: "hi-IN" },
  { code: "te", label: "తెలుగు", locale: "te-IN" }
];
const DICTIONARIES = { en: {}, hi, te };
const KEY = "medsync-lang";

function initialLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGUAGES.some((l) => l.code === saved)) return saved;
  } catch { /* storage may be blocked */ }
  const guess = (navigator.language || "en").slice(0, 2);
  return LANGUAGES.some((l) => l.code === guess) ? guess : "en";
}

const I18nContext = createContext({ lang: "en", locale: "en-IN", setLang: () => {}, t: (s) => s });

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((code) => {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    setLangState(code);
    try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
  }, []);
  const value = useMemo(() => {
    const dict = DICTIONARIES[lang] || {};
    const t = (text, vars) => {
      const s = dict[text] ?? text;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k]))) : s;
    };
    return { lang, locale: LANGUAGES.find((l) => l.code === lang).locale, setLang, t };
  }, [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

// A small drop-down for the top bar and the sign-in page.
export function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();
  return (
    <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("Language")} title={t("Language")}>
      {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
