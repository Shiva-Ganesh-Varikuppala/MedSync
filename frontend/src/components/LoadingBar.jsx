import React, { useEffect, useState, useSyncExternalStore } from "react";
import { getPending, subscribePending } from "../api";

// A thin animated bar at the top of the page while any request is running.
// It waits 150 ms before showing, so quick requests do not make it flicker.
export default function LoadingBar() {
  const busy = useSyncExternalStore(subscribePending, () => getPending() > 0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) { setVisible(false); return undefined; }
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, [busy]);
  return (
    <div className={`loading-bar${visible ? " on" : ""}`} role="progressbar" aria-hidden={!visible} aria-label="Loading">
      <span />
    </div>
  );
}
