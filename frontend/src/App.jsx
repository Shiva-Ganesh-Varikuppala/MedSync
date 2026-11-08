import React, { useState } from "react";
import { useAuth } from "./auth";
import Login from "./pages/Login";
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
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
};

export default function App() {
  const { user, role, signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [patientTab, setPatientTab] = useState("today");
  if (!user) return <><LoadingBar /><Login /></>;
  // A search result opens the matching tab. The screen may need a moment to appear if the profile was open.
  const goTo = (tab) => {
    setShowProfile(false);
    if (role === "PATIENT") setPatientTab(tab);
    else setTimeout(() => window.dispatchEvent(new CustomEvent("medsync-goto", { detail: { tab } })), 30);
  };
  const Screen = SCREENS[role];
  return (
    <>
      <LoadingBar />
      <div className="app">
        <aside className="sidebar">
          <div className="brand"><Brand size={32} /><span>MedSync</span></div>
          <nav className="nav" aria-label="Main">
            <button className={showProfile ? "" : "active"} onClick={() => setShowProfile(false)}><Icon d={ICONS.overview} />Overview</button>
            <button className={showProfile ? "active" : ""} onClick={() => setShowProfile(true)}><Icon d={ICONS.profile} />My profile</button>
            <button onClick={() => signOut()}><Icon d={ICONS.out} />Sign out</button>
          </nav>
          <div className="promo">
            <i className="cap" aria-hidden="true"><b /></i>
            <p>Update your details or change your password.</p>
            <button onClick={() => setShowProfile(true)}>Settings</button>
          </div>
        </aside>
        <div className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">{showProfile ? "Account" : "Workspace"}</p>
              <h1>{showProfile ? "My profile" : TITLES[role] || "MedSync"}</h1>
            </div>
            <div className="topbar-right">
              <SearchBox onPick={goTo} />
              {role === "PATIENT" && <NotificationBell onViewAll={() => { setShowProfile(false); setPatientTab("notifications"); }} />}
              <ThemeToggle round />
              <div className="usercard">
                <span className="avatar" aria-hidden="true">{initials(user.name)}</span>
                <span><strong>{user.name}</strong><small>{ROLE_TEXT[role]}</small></span>
              </div>
            </div>
          </header>
          <main className="shell">
            {showProfile ? <Profile onClose={() => setShowProfile(false)} /> : Screen ? <Screen tab={patientTab} setTab={setPatientTab} /> : <p className="error">Unknown role.</p>}
          </main>
        </div>
      </div>
    </>
  );
}
