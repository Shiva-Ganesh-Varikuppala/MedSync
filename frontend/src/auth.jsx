import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setUnauthorizedHandler } from "./api";

const KEY = "medsync-session";
const AuthContext = createContext(null);

// sessionStorage: the login is forgotten when the tab is closed.
function readSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!saved?.token || !saved?.user?.role) return null;
    return isExpired(saved.token) ? null : saved;
  } catch { return null; }
}

// Reads the "exp" claim of the JWT (no verification - the server verifies; this only avoids using a dead token).
function isExpired(token) {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return !exp || exp * 1000 <= Date.now();
  } catch { return true; }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [sessionNote, setSessionNote] = useState("");

  const signOut = useCallback((note = "") => {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY); // older versions kept it here
    setSession(null);
    setSessionNote(note);
  }, []);

  const signIn = useCallback((data) => {
    sessionStorage.setItem(KEY, JSON.stringify(data));
    setSessionNote("");
    setSession(data);
  }, []);

  // A 401 from any call => the token expired or the account was disabled.
  useEffect(() => { setUnauthorizedHandler(() => signOut("Your session has expired. Please sign in again.")); }, [signOut]);

  // Sign out automatically when the token's own expiry time arrives.
  useEffect(() => {
    if (!session) return undefined;
    const { exp } = JSON.parse(atob(session.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const ms = exp * 1000 - Date.now();
    const timer = setTimeout(() => signOut("Your session has expired. Please sign in again."), Math.max(ms, 0));
    return () => clearTimeout(timer);
  }, [session, signOut]);

  const value = useMemo(() => ({
    token: session?.token, user: session?.user, role: session?.user?.role, sessionNote, signIn, signOut,
    call: (path, options) => api(path, { token: session?.token, ...options })
  }), [session, sessionNote, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
