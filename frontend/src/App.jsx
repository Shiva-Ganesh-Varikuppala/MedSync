import React, { useState } from "react";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Patient from "./pages/Patient";
import Doctor from "./pages/Doctor";
import Pharmacy from "./pages/Pharmacy";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";

const TITLES = { DOCTOR: "Doctor workspace", PATIENT: "Patient care", PHARMACY_STAFF: "Pharmacy inventory", ADMIN: "Administration" };
const SCREENS = { DOCTOR: Doctor, PATIENT: Patient, PHARMACY_STAFF: Pharmacy, ADMIN: Admin };

export default function App() {
  const { user, role, signOut } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  if (!user) return <Login />;
  const Screen = SCREENS[role];
  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">MEDSYNC</p>
          <h1>{TITLES[role] || "MedSync"}</h1>
          <p className="muted">Welcome, {user.name}</p>
        </div>
        <div className="actions">
          <button className="secondary" onClick={() => setShowProfile(!showProfile)}>{showProfile ? "Close profile" : "My profile"}</button>
          <button className="secondary" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>
      {showProfile ? <Profile onClose={() => setShowProfile(false)} /> : Screen ? <Screen /> : <p className="error">Unknown role.</p>}
    </main>
  );
}
