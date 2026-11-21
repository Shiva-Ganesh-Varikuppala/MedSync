import React from "react";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import VerifyEmail from "./pages/VerifyEmail";
import Patient from "./pages/Patient";
import Doctor from "./pages/Doctor";
import Pharmacy from "./pages/Pharmacy";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import Brand from "./components/Brand";
import LoadingBar from "./components/LoadingBar";
import ThemeToggle from "./components/ThemeToggle";
import { NotificationBell } from "./components/Notifications";
import SearchBox from "./components/SearchBox";
import DialogHost from "./components/Dialog";
import { usePath } from "./router";
import { LanguageSwitcher, useI18n } from "./i18n";
import Tour from "./components/Tour";
import "./admin-glass.css";

const TITLES = { DOCTOR: "Doctor workspace", PATIENT: "Patient care", PHARMACY_STAFF: "Pharmacy inventory", ADMIN: "Administration" };
const ROLE_TEXT = { DOCTOR: "Doctor", PATIENT: "Patient", PHARMACY_STAFF: "Pharmacy staff", ADMIN: "Administrator" };
const SCREENS = { DOCTOR: Doctor, PATIENT: Patient, PHARMACY_STAFF: Pharmacy, ADMIN: Admin };
const initials = (name = "") => name.split(" ").filter(Boolean).map((w) => w[0]).join("").toUpperCase().slice(0, 2) || "?";

const Icon = ({ d }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICONS = {
  overview: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  profile: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  help: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17.5h.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"
};

export default function App() {
  const { user, role, signOut } = useAuth();
  const { t } = useI18n();
  // The address bar decides what is open: "/appts" is the appointments tab, "/profile" the profile page, "/" the home tab.
  const [seg, navigate] = usePath();
  const showProfile = seg === "profile";
  // The link in the verification email opens this page, whether or not someone is signed in.
  if (window.location.pathname === "/verify-email") return <><LoadingBar /><VerifyEmail /></>;
  if (!user) return <><LoadingBar /><Login /></>;
  // A search result opens the matching tab. The screen may need a moment to appear if the profile was open.
  const goTo = (tab) => navigate(tab);
  const Screen = SCREENS[role];
  return (
    <>
      <LoadingBar />
      <DialogHost />
      <Tour />
      {role === "ADMIN" && <div className="glass-bg" aria-hidden="true"><span className="g1" /><span className="g2" /><span className="g3" /><span className="g4" /></div>}
      <div className={`app role-${String(role).toLowerCase()}`}>
        <aside className="sidebar">
          <div className="brand"><Brand size={32} /></div>
          <div id="side-tabs" />
          <nav className="nav" aria-label="Main">
            <button className={showProfile ? "" : "active"} onClick={() => navigate("")}><Icon d={ICONS.overview} />{t("Overview")}</button>
            <button className={showProfile ? "active" : ""} onClick={() => navigate("profile")}><Icon d={ICONS.profile} />{t("My profile")}</button>
            <button onClick={() => window.dispatchEvent(new Event("medsync:tour"))}><Icon d={ICONS.help} />{t("Take a tour")}</button>
            <button onClick={() => { navigate(""); signOut(); }}><Icon d={ICONS.out} />{t("Sign out")}</button>
          </nav>
          <div className="promo">
            <i className="cap" aria-hidden="true"><b /></i>
            <p>{t("Update your details or change your password.")}</p>
            <button onClick={() => navigate("profile")}>{t("Settings")}</button>
          </div>
        </aside>
        <div className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">{showProfile ? t("Account") : t("Workspace")}</p>
              <h1>{showProfile ? t("My profile") : t(TITLES[role] || "MedSync")}</h1>
            </div>
            <div className="topbar-right">
              <SearchBox onPick={goTo} />
              {role === "PATIENT" && <NotificationBell onViewAll={() => navigate("notifications")} />}
              <LanguageSwitcher />
              <ThemeToggle round />
              <div className="usercard">
                <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                <span><strong>{user.name}</strong><small>{t(ROLE_TEXT[role])}</small></span>
              </div>
            </div>
          </header>
          <main className="shell">
            {showProfile ? <Profile onClose={() => navigate("")} /> : Screen ? <Screen tab={seg} setTab={navigate} /> : <p className="error">Unknown role.</p>}
          </main>
        </div>
      </div>
    </>
  );
}
