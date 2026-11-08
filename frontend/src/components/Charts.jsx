import React, { useId } from "react";

// Small dependency-free SVG charts in the dashboard style. Each takes plain data and draws it.

const niceMax = (n) => { if (n <= 4) return 4; const p = 10 ** Math.floor(Math.log10(n)); return Math.ceil(n / p) * p; };

function Empty() { return <p className="muted chart-empty">Nothing to chart yet.</p>; }

// data: [{ label, value }]
export function AreaChart({ data, unit = "" }) {
  const id = useId();
  if (!data.some((d) => d.value > 0)) return <Empty />;
  const W = 600, H = 220, L = 34, R = 14, T = 34, B = 30;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const x = (i) => L + (data.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (data.length - 1));
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const pts = data.map((d, i) => [x(i), y(d.value)]);
  const line = pts.map((p, i) => {
    if (i === 0) return `M${p[0]},${p[1]}`;
    const q = pts[i - 1], mx = (q[0] + p[0]) / 2;
    return `C${mx},${q[1]} ${mx},${p[1]} ${p[0]},${p[1]}`;
  }).join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${H - B} L${pts[0][0]},${H - B} Z`;
  const top = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Area chart">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7b5cf0" stopOpacity="0.55" /><stop offset="1" stopColor="#7b5cf0" stopOpacity="0.04" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((g) => { const v = (max / 4) * g; return (<g key={g}><line className="chart-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="chart-text" x={L - 8} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>); })}
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="#7b5cf0" strokeWidth="3" strokeLinecap="round" />
      {data.map((d, i) => <text key={d.label + i} className="chart-text" x={x(i)} y={H - 8} textAnchor="middle">{d.label}</text>)}
      <circle cx={pts[top][0]} cy={pts[top][1]} r="6" fill="#fff" stroke="#7b5cf0" strokeWidth="3" />
      <g transform={`translate(${pts[top][0]},${pts[top][1] - 14})`}><rect x="-26" y="-24" width="52" height="24" rx="12" fill="#7b5cf0" /><text x="0" y="-8" textAnchor="middle" className="chart-bubble">{data[top].value}{unit}</text></g>
    </svg>
  );
}

// data: [{ label, value }]; the tallest bar is highlighted in orange.
export function BarChart({ data }) {
  const id = useId();
  if (!data.some((d) => d.value > 0)) return <Empty />;
  const W = 600, H = 220, L = 34, R = 14, T = 34, B = 30;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const slot = (W - L - R) / data.length, bw = Math.min(34, slot * 0.55);
  const y = (v) => T + (1 - v / max) * (H - T - B);
  const top = data.reduce((m, d, i) => (d.value > data[m].value ? i : m), 0);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b39bff" /><stop offset="1" stopColor="#7b5cf0" /></linearGradient>
        <linearGradient id={`${id}o`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffa56a" /><stop offset="1" stopColor="#fb7b3a" /></linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((g) => { const v = (max / 4) * g; return (<g key={g}><line className="chart-grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="chart-text" x={L - 8} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>); })}
      {data.map((d, i) => {
        const cx = L + slot * i + slot / 2, h = Math.max(d.value > 0 ? 8 : 0, H - B - y(d.value));
        return (<g key={d.label + i}>
          <rect x={cx - bw / 2} y={H - B - h} width={bw} height={h} rx={Math.min(12, bw / 2)} fill={`url(#${id}${i === top ? "o" : "p"})`} />
          <text className="chart-text" x={cx} y={H - 8} textAnchor="middle">{d.label}</text>
        </g>);
      })}
      <g transform={`translate(${L + slot * top + slot / 2},${y(data[top].value) - 8})`}><rect x="-22" y="-24" width="44" height="22" rx="11" fill="#fb7b3a" /><text x="0" y="-8" textAnchor="middle" className="chart-bubble">{data[top].value}</text></g>
    </svg>
  );
}

// parts: [{ label, value, color }]; centre shows `center` (big) and `caption` (small).
export function Donut({ parts, center, caption }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <Empty />;
  const r = 70, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 200 200" role="img" aria-label="Donut chart" className="donut-svg">
        <circle cx="100" cy="100" r={r} fill="none" className="chart-grid" strokeWidth="26" />
        {parts.filter((p) => p.value > 0).map((p) => {
          const len = (p.value / total) * c;
          const el = <circle key={p.label} cx="100" cy="100" r={r} fill="none" stroke={p.color} strokeWidth="26" strokeDasharray={`${Math.max(len - 3, 0)} ${c}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" strokeLinecap="round" />;
          offset += len; return el;
        })}
        <text x="100" y="104" textAnchor="middle" className="donut-center">{center}</text>
        {caption && <text x="100" y="126" textAnchor="middle" className="chart-text">{caption}</text>}
      </svg>
      <ul className="legend">{parts.map((p) => <li key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.value}</b></li>)}</ul>
    </div>
  );
}
