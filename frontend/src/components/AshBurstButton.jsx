import React, { useEffect, useRef, useState } from "react";

// A delete button that turns to ash. `action` runs first (it asks for confirmation and calls the API) and
// must resolve to true only when the deletion really happened; only then do the particles fly.
// `onBurned` runs when the animation ends, e.g. to reload the list.
// Skipped for people who asked their system for reduced motion.
const DEFAULT_COLORS = ["#171717", "#404040", "#737373", "#f97316"];

export default function AshBurstButton({ label = "Delete", action, onBurned, colors = DEFAULT_COLORS, particleCount = 120, duration = 1100, className = "", style }) {
  const btn = useRef(null);
  const raf = useRef(0);
  const canvas = useRef(null);
  const [state, setState] = useState("idle"); // idle | working | burning

  useEffect(() => () => { cancelAnimationFrame(raf.current); canvas.current?.remove(); }, []);

  function burst() {
    return new Promise((resolve) => {
      const rect = btn.current.getBoundingClientRect();
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) { resolve(); return; }
      const dpr = window.devicePixelRatio || 1;
      const c = document.createElement("canvas");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999";
      c.width = Math.round(window.innerWidth * dpr); c.height = Math.round(window.innerHeight * dpr);
      document.body.appendChild(c); canvas.current = c;
      const g = c.getContext("2d"); g.scale(dpr, dpr);
      const parts = Array.from({ length: particleCount }, () => ({
        x: rect.left + Math.random() * rect.width, y: rect.top + Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 3.2, vy: -(0.6 + Math.random() * 2.6),
        r: 1 + Math.random() * 3, color: colors[Math.floor(Math.random() * colors.length)],
        life: 0.55 + Math.random() * 0.45, spin: (Math.random() - 0.5) * 0.2, a: Math.random() * 6.28,
      }));
      const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min((now - t0) / duration, 1);
        g.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const p of parts) {
          const k = t / p.life;
          if (k >= 1) continue;
          p.vx += Math.sin(now / 300 + p.a) * 0.02; // lazy sideways drift, like ash
          p.vy += 0.015; p.x += p.vx; p.y += p.vy; p.a += p.spin;
          g.globalAlpha = 1 - k; g.fillStyle = p.color;
          g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2); g.restore();
        }
        if (t < 1) raf.current = requestAnimationFrame(frame);
        else { c.remove(); canvas.current = null; resolve(); }
      };
      raf.current = requestAnimationFrame(frame);
    });
  }

  async function click() {
    if (state !== "idle") return;
    setState("working");
    let ok = false;
    try { ok = await action(); } catch (_) { ok = false; }
    if (!ok) { setState("idle"); return; }
    setState("burning");
    const row = btn.current.closest("li");
    if (row) { row.style.transition = `opacity ${duration}ms ease`; row.style.opacity = "0.15"; }
    await burst();
    onBurned && onBurned();
  }

  return (
    <button ref={btn} className={className} style={{ ...style, transition: "opacity 250ms", opacity: state === "burning" ? 0 : 1 }} disabled={state !== "idle"} onClick={click}>
      {state === "working" ? "Deleting…" : label}
    </button>
  );
}
