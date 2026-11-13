import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel, Tiles, rxStatus, useGoto } from "../components/ui";
import MedicinePicker from "../components/MedicinePicker";
import PrescriptionDetail from "../components/PrescriptionDetail";
import { AreaChart } from "../components/Charts";
import Appointments from "../components/Appointments";
import TemplateBar from "../components/TemplateBar";

const FREQUENCIES = [[1, "Once daily"], [2, "Twice daily"], [3, "Three times daily"], [4, "Four times daily"]];
// Count of prescriptions per month for the last six months, oldest first.
const perMonth = (rows) => Array.from({ length: 6 }, (_, i) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (5 - i));
  const key = d.toLocaleDateString("en-CA").slice(0, 7);
  return { label: d.toLocaleDateString(undefined, { month: "short" }), value: rows.filter((r) => String(r.prescription_date).slice(0, 7) === key).length };
});
const today = () => new Date().toISOString().slice(0, 10);
// UTC arithmetic on a plain date: building it at local midnight and converting back shifted the date by a day east of UTC (e.g. India).
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const newItem = (m) => ({ key: Math.random(), medicine_id: m.medicine_id, label: `${m.name} ${m.strength || ""}`.trim(), dosage: "", frequency_per_day: 1, start_date: today(), end_date: addDays(today(), 6) });

export default function Doctor() {
  const [tab, setTab] = useState("patients");
  const [patient, setPatient] = useState(null); // chosen patient, shared by the tabs
  const [flash, setFlash] = useState({});
  useGoto(setTab);
  return (
    <>
      <nav className="tabs" role="tablist">
        {[["patients", "Patients"], ["new", "New prescription"], ["mine", "My prescriptions"], ["appts", "Appointments"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => { setTab(k); setFlash({}); }}>{label}</button>
        ))}
      </nav>
      <Notice {...flash} />
      {patient && <p className="muted">Selected patient: <b>{patient.name}</b> (ID {patient.patient_id}) <button className="link" onClick={() => setPatient(null)}>clear</button></p>}
      {tab === "patients" && <Patients patient={patient} choose={(p) => { setPatient(p); }} startRx={() => setTab("new")} />}
      {tab === "new" && <NewPrescription patient={patient} goPatients={() => setTab("patients")} done={(msg) => { setFlash({ success: msg }); setTab("mine"); }} />}
      {tab === "mine" && <Mine setFlash={setFlash} />}
      {tab === "appts" && <Appointments role="DOCTOR" />}
    </>
  );
}

function Patients({ patient, choose, startRx }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [asked, setAsked] = useState("");   // the text the shown results are for
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  async function fetchPage(text, p) {
    const r = await call(`/doctors/patients?q=${encodeURIComponent(text)}&limit=20&page=${p}`);
    return { items: r.data, more: Boolean(r.meta && r.meta.has_more) };
  }
  async function search(e) {
    e.preventDefault();
    try { const text = q.trim(); const r = await fetchPage(text, 1); setRows(r.items); setMore(r.more); setPage(1); setAsked(text); setError(""); }
    catch (err) { setError(err.message); }
  }
  async function loadMore() {
    try { const r = await fetchPage(asked, page + 1); setRows((cur) => cur.concat(r.items)); setMore(r.more); setPage(page + 1); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => {
    if (!patient) { setHistory([]); return; }
    call(`/doctors/patients/${patient.patient_id}/prescriptions`).then((r) => setHistory(r.data)).catch((e) => setError(e.message));
  }, [patient, call]);

  return (
    <section className="grid">
      <Panel title="Find a patient">
        <form className="inline" onSubmit={search}>
          <input placeholder="Name or patient ID (2+ characters)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Patient search" />
          <button disabled={q.trim().length < 2}>Search</button>
        </form>
        <Notice error={error} />
        {rows && <List rows={rows} empty="No patients match." render={(p) => (
          <>
            <strong>{p.name}</strong><span>ID {p.patient_id} · born {p.date_of_birth} · {p.gender}</span>
            <button className="secondary" onClick={() => choose(p)}>Select</button>
          </>
        )} />}
        {rows && more && <button className="secondary" onClick={loadMore}>Load more</button>}
      </Panel>
      <Panel title={patient ? `Your prescriptions for ${patient.name}` : "Patient history"}>
        {!patient ? <p className="muted">Select a patient to see the prescriptions you wrote for them.</p> : (
          <>
            <button onClick={startRx}>Write new prescription</button>
            <List rows={history} empty="You have not prescribed anything for this patient yet." render={(h) => (
              <>
                <strong>{h.diagnosis}</strong><span>{h.prescription_date} · {rxStatus(h.status)}</span>
                <button className="link" onClick={() => setOpen(open === h.prescription_id ? null : h.prescription_id)}>{open === h.prescription_id ? "Hide" : "Details"}</button>
                {open === h.prescription_id && <PrescriptionDetail id={h.prescription_id} />}
              </>
            )} />
          </>
        )}
      </Panel>
    </section>
  );
}

function NewPrescription({ patient, goPatients, done }) {
  const { call } = useAuth();
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ids = items.map((i) => i.medicine_id).join(",");
  // Live interaction check as soon as two or more different medicines are chosen.
  useEffect(() => {
    const distinct = [...new Set(ids.split(",").filter(Boolean))];
    if (distinct.length < 2) { setWarnings([]); return; }
    call(`/interactions/check?medicineIds=${distinct.join(",")}`).then((r) => setWarnings(r.data)).catch(() => setWarnings([]));
  }, [ids, call]);

  if (!patient) return <Panel title="New prescription"><p className="muted">Choose a patient first.</p><button onClick={goPatients}>Find a patient</button></Panel>;

  const set = (key, field, value) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  const hasSevere = warnings.some((w) => w.severity === "SEVERE" || w.severity === "CONTRAINDICATED");

  async function submit(e) {
    e.preventDefault();
    if (!items.length) { setError("Add at least one medicine."); return; }
    if (warnings.length && !window.confirm(`${warnings.length} interaction warning(s) found. Create the prescription anyway?`)) return;
    setBusy(true);
    try {
      const { data } = await call("/prescriptions", { method: "POST", body: {
        patient_id: patient.patient_id, prescription_date: today(), diagnosis: diagnosis.trim(), notes: notes.trim() || undefined,
        items: items.map(({ medicine_id, dosage, frequency_per_day, start_date, end_date }) => ({ medicine_id, dosage: dosage.trim(), frequency_per_day, start_date, end_date }))
      } });
      done(`Prescription #${data.prescription_id} created for ${patient.name}. Reminders were scheduled automatically.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <Panel title={`New prescription for ${patient.name}`}>
      <form className="form" onSubmit={submit}>
        <label>Diagnosis<input required maxLength={255} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></label>
        <label>Notes (optional)<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <TemplateBar items={items} diagnosis={diagnosis} notes={notes} onApply={(t) => { setDiagnosis(t.diagnosis); setNotes(t.notes); setItems(t.items); setError(""); }} />
        <h3>Medicines</h3>
        <MedicinePicker onPick={(m) => setItems((xs) => [...xs, newItem(m)])} />
        {items.map((x) => (
          <div className="card item" key={x.key}>
            <strong>{x.label}</strong>
            <label>Dosage<input required placeholder="e.g. 1 tablet" value={x.dosage} onChange={(e) => set(x.key, "dosage", e.target.value)} /></label>
            <label>How often
              <select value={x.frequency_per_day} onChange={(e) => set(x.key, "frequency_per_day", Number(e.target.value))}>
                {FREQUENCIES.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
              </select>
            </label>
            <label>Start<input required type="date" value={x.start_date} min={today()} onChange={(e) => set(x.key, "start_date", e.target.value)} /></label>
            <label>End<input required type="date" value={x.end_date} min={x.start_date} onChange={(e) => set(x.key, "end_date", e.target.value)} /></label>
            <button type="button" className="secondary" onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))}>Remove</button>
          </div>
        ))}
        {warnings.map((w) => (
          <p key={w.interaction_id} className="warning"><b>{w.severity}</b> — {w.medicine_1} + {w.medicine_2}: {w.description}</p>
        ))}
        {hasSevere && <p className="warning">A severe interaction is present. Review before prescribing.</p>}
        <Notice error={error} />
        <button disabled={busy}>{busy ? "Saving…" : "Create prescription"}</button>
      </form>
    </Panel>
  );
}

function Mine({ setFlash }) {
  const { call } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => call("/doctors/me/prescriptions").then((r) => setRows(r.data)).catch((e) => setError(e.message)), [call]);
  useEffect(() => { load(); }, [load]);

  async function cancel(rx) {
    if (!window.confirm(`Cancel prescription #${rx.prescription_id}? Pending reminders will stop.`)) return;
    try { await call(`/prescriptions/${rx.prescription_id}/cancel`, { method: "POST" }); setFlash({ success: `Prescription #${rx.prescription_id} cancelled.` }); setOpen(null); load(); }
    catch (e) { setError(e.message); }
  }
  return (
    <>
    <Tiles items={[[rows.length, "Prescriptions written", "purple"], [rows.filter((r) => r.status === "ACTIVE").length, "Waiting for the pharmacy", "orange"], [rows.filter((r) => r.status === "DISPENSED").length, "Dispensed", "yellow"]]} />
    <Panel title="Prescriptions written, last 6 months"><AreaChart data={perMonth(rows)} /></Panel>
    <Panel title="My prescriptions">
      <Notice error={error} />
      <List rows={rows} empty="You have not written any prescriptions yet." render={(r) => (
        <>
          <strong>{r.patient_name} — {r.diagnosis}</strong>
          <span>#{r.prescription_id} · {r.prescription_date} · {r.item_count} medicine(s) · {rxStatus(r.status)}</span>
          <button className="link" onClick={() => setOpen(open === r.prescription_id ? null : r.prescription_id)}>{open === r.prescription_id ? "Hide" : "Details"}</button>
          {open === r.prescription_id && <PrescriptionDetail id={r.prescription_id} onCancel={cancel} canAttach />}
        </>
      )} />
    </Panel>
    </>
  );
}
