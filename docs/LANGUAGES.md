# Languages (English, Hindi, Telugu)

A language drop-down sits in the top bar (and on the sign-in page). The choice is remembered in the browser (`localStorage`, key `medsync-lang`). On first visit the browser's language is used if it is Hindi or Telugu. Dates use the matching locale (`hi-IN`, `te-IN`).

## How it works
- `frontend/src/i18n.jsx`: `I18nProvider`, `useI18n()` → `{ t, lang, locale, setLang }`, and `LanguageSwitcher`. No library.
- The **English text is the key**: `t("Doses to confirm")`, with values: `t("Was due {day} at {time}", { day, time })`.
- Dictionaries: `frontend/src/locales/hi.js` and `te.js`. A missing entry shows the English text, so nothing ever breaks.
- Fonts for the two scripts are set in `frontend/src/i18n.css`.

## What is translated today
App shell (menu, titles, role names), the sign-in page, the patient Overview cards, "Today & reminders" and "My prescriptions" (including tab names).

## Not yet translated (still English)
Calendar, Refills, Appointments, Notifications, prescription details, Profile; doctor, pharmacy and admin screens; error messages from the server; reminder emails and SMS.

## Adding more
1. In the component: `const { t } = useI18n();` and wrap each visible text in `t(...)`.
2. Add the English text as a key in `hi.js` and `te.js`.

## Review note
The Hindi and Telugu wording was written by an AI assistant and should be checked by a native speaker, especially medical terms, before real patients use it.
