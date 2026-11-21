import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// A screen's section tabs (Users, Patients, Inventory, ...) are drawn in the left sidebar, under the logo, as a vertical list.
// The screen still owns the buttons and their state; this only moves them. App.jsx provides the <div id="side-tabs"> they land in.
export default function SideTabs({ label = "Sections", children }) {
  const [host, setHost] = useState(null);
  useEffect(() => { setHost(document.getElementById("side-tabs")); }, []);
  if (!host) return null;
  return createPortal(<nav className="nav side-tabs" role="tablist" aria-label={label} aria-orientation="vertical">{children}</nav>, host);
}
