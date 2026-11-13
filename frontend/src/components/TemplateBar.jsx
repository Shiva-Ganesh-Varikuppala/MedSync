import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { Notice } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);
// UTC arithmetic on a plain date: building it at local midnight and converting back shifted the date by a day east of UTC (e.g. India).
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

// Lets a doctor reuse a saved course (for example "fever") or save the medicines on the form as a new template.
// onApply({ diagnosis, notes, items }) fills the prescription form; dates start today.
export default function TemplateBar({ items, diagnosis, notes, onApply }) {
  const { call } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [chosen, setChosen] = useState("");
  const [name, setName] = useState("");
  const [msg, setMsg] = useState({});

  const load = useCallback(() => call("/templates").then((r) => setTemplates(r.data)).catch((e) => setMsg({ error: e.message })), [call]);
  useEffect(() => { load(); }, [load]);

  const picked = templates.find((t) => String(t.template_id) === chosen);

  function apply() {
    if (!picked) return;
    if (items.length && !window.confirm("Using a template replaces the medicines already on this form. Continue?")) return;
    const usable = picked.items.filter((i) => i.is_active);
    const skipped = picked.items.length - usable.length;
    onApply({
      diagnosis: picked.diagnosis || "",
      notes: picked.notes || "",
      items: usable.map((i) => ({
        key: Math.random(), medicine_id: i.medicine_id, label: `${i.medicine_name} ${i.strength || ""}`.trim(),
        dosage: i.dosage, frequency_per_day: i.frequency_per_day, start_date: today(), end_date: addDays(today(), i.duration_days - 1)
      }))
    });
    setMsg(skipped ? { error: `${skipped} medicine(s) in this template are no longer available and were left out.` } : { success: `Template "${picked.name}" applied. Check the dosage and dates, then create the prescription.` });
  }

  async function save(e) {
    e.preventDefault();
    if (!items.length) { setMsg({ error: "Add at least one medicine before saving a template." }); return; }
    if (items.some((i) => !i.dosage.trim())) { setMsg({ error: "Fill in the dosage of every medicine before saving a template." }); return; }
    try {
      await call("/templates", { method: "POST", body: {
        name: name.trim(), diagnosis: diagnosis.trim() || undefined, notes: notes.trim() || undefined,
        items: items.map((i) => ({ medicine_id: i.medicine_id, dosage: i.dosage.trim(), frequency_per_day: i.frequency_per_day, duration_days: daysBetween(i.start_date, i.end_date) }))
      } });
      setName(""); setMsg({ success: `Template "${name.trim()}" saved.` }); load();
    } catch (err) { setMsg({ error: err.message }); }
  }

  async function remove() {
    if (!picked || !window.confirm(`Delete the template "${picked.name}"?`)) return;
    try { await call(`/templates/${picked.template_id}`, { method: "DELETE" }); setChosen(""); setMsg({ success: "Template deleted." }); load(); }
    catch (err) { setMsg({ error: err.message }); }
  }

  return (
    <div className="card">
      <strong>Templates</strong>
      <div className="inline">
        <select aria-label="Template" value={chosen} onChange={(e) => setChosen(e.target.value)}>
          <option value="">{templates.length ? "Choose a template…" : "No templates yet"}</option>
          {templates.map((t) => <option key={t.template_id} value={t.template_id}>{t.name} ({t.items.length} medicine{t.items.length === 1 ? "" : "s"})</option>)}
        </select>
        <button type="button" disabled={!picked} onClick={apply}>Use template</button>
        <button type="button" className="secondary" disabled={!picked} onClick={remove}>Delete</button>
      </div>
      <div className="inline">
        <input aria-label="New template name" placeholder="Save the medicines below as a template…" maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) save(e); } }} />
        <button type="button" className="secondary" disabled={!name.trim()} onClick={save}>Save as template</button>
      </div>
      <Notice {...msg} />
    </div>
  );
}
