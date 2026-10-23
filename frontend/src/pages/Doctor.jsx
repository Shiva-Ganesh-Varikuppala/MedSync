import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "../components/ui";
import MedicinePicker from "../components/MedicinePicker";
import PrescriptionDetail from "../components/PrescriptionDetail";

const FREQUENCIES = [[1, "Once daily"], [2, "Twice daily"], [3, "Three times daily"], [4, "Four times daily"]];
const PAGE_SIZE = 10;
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const newItem = (m) => ({ key: Math.random(), medicine_id: m.medicine_id, label: `${m.name} ${m.strength || ""}`.trim(), dosage: "", frequency_per_day: 1, start_date: today(), end_date: addDays(today(), 6) });

export default function Doctor() {
  const [tab, setTab] = useState("patients");
  const [patient, setPatient] = useState(null); // chosen patient, shared by the tabs
  const [flash, setFlash] = useState({});
  return (
    <>
      <nav className="tabs" role="tablist">
        {[["patients", "Patients"], ["new", "New prescription"], ["mine", "My prescriptions"], ["rxnorm", "Drug database (RxNorm)"]].map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => { setTab(k); setFlash({}); }}>{label}</button>
        ))}
      </nav>
      <Notice {...flash} />
      {patient && <p className="muted">Selected patient: <b>{patient.name}</b> (ID {patient.patient_id}) <button className="link" onClick={() => setPatient(null)}>clear</button></p>}
      {tab === "patients" && <Patients patient={patient} choose={(p) => { setPatient(p); }} startRx={() => setTab("new")} />}
      {tab === "new" && <NewPrescription patient={patient} goPatients={() => setTab("patients")} done={(msg) => { setFlash({ success: msg }); setTab("mine"); }} />}
      {tab === "mine" && <Mine setFlash={setFlash} />}
      {tab === "rxnorm" && <RxNormSearch />}
    </>
  );
}

function Patients({ patient, choose, startRx }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");

  async function search(e) {
    e.preventDefault();
    try { setRows((await call(`/doctors/patients?q=${encodeURIComponent(q.trim())}`)).data); setError(""); }
    catch (err) { setError(err.message); }
  }
  useEffect(() => {
    if (!patient) { setHistory([]); return; }
    call(`/doctors/patients/${patient.patient_id}/prescriptions`).then((r) => setHistory(r.data)).catch((e) => setError(e.message));
  }, [patient, call]);

  // Compute simple adherence: what % of prescriptions are ACTIVE or DISPENSED (not CANCELLED)
  const rxTotal = history.length;
  const rxActive = history.filter((h) => h.status === "ACTIVE" || h.status === "DISPENSED").length;
  const rxCancelled = history.filter((h) => h.status === "CANCELLED").length;
  const rxCompleted = history.filter((h) => h.status === "COMPLETED").length;

  return (
    <section className="grid">
      <Panel title="Patient registry">
        <form className="inline" onSubmit={search}>
          <input required placeholder="Name (2+ letters)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients by name" />
          <button>Search</button>
        </form>
        <Notice error={error} />
        {rows && <List rows={rows} empty="No patients match." render={(p) => (
          <>
            <strong>{p.name}</strong>
            <span>DOB {p.date_of_birth} · {p.gender || "unspecified"}</span>
            <button className={patient?.patient_id === p.patient_id ? "" : "secondary"} onClick={() => choose(p)}>
              {patient?.patient_id === p.patient_id ? "Selected" : "Select patient"}
            </button>
          </>
        )} />}
      </Panel>
      <Panel title={patient ? `History: ${patient.name}` : "Patient history"}>
        {!patient ? <p className="muted">Select a patient on the left to see their prior prescriptions.</p> : (
          <>
            {rxTotal > 0 && (
              <div style={{ marginBottom: "1rem", padding: "0.8rem", background: "#f8fbfc", borderRadius: "10px", border: "1px solid #dbe7eb" }}>
                <p className="eyebrow" style={{ marginBottom: "0.4rem" }}>Prescription Summary</p>
                <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
                  <span>📋 <b>{rxTotal}</b> total</span>
                  <span style={{ color: "#16743c" }}>✅ <b>{rxActive}</b> active/dispensed</span>
                  {rxCompleted > 0 && <span style={{ color: "#627d98" }}>🏁 <b>{rxCompleted}</b> completed</span>}
                  {rxCancelled > 0 && <span style={{ color: "#a61b1b" }}>❌ <b>{rxCancelled}</b> cancelled</span>}
                </div>
              </div>
            )}
            <div className="inline" style={{ marginBottom: "0.8rem" }}>
              <button onClick={startRx}>Write new prescription</button>
            </div>
            <List rows={history} empty="No prescriptions recorded for this patient yet." render={(h) => (
              <>
                <strong>{h.diagnosis}</strong><span>{h.prescription_date} · {h.status}</span>
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
  // Live interaction check including cross-prescription check against patient's active meds
  useEffect(() => {
    const distinct = [...new Set(ids.split(",").filter(Boolean))];
    if (!distinct.length) { setWarnings([]); return; }
    const pParam = patient?.patient_id ? `&patientId=${patient.patient_id}` : "";
    if (distinct.length < 2 && !pParam) { setWarnings([]); return; }
    call(`/interactions/check?medicineIds=${distinct.join(",")}${pParam}`)
      .then((r) => setWarnings(r.data))
      .catch(() => setWarnings([]));
  }, [ids, patient?.patient_id, call]);

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
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Panel title={`New prescription for ${patient.name}`}>
      <form className="form" onSubmit={submit}>
        <label>Diagnosis<input required value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></label>
        <label>Notes (optional)<textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

        <h3>Medicines</h3>
        <MedicinePicker onPick={(m) => setItems([...items, newItem(m)])} />
        {items.map((x) => (
          <div key={x.key} className="item card">
            <strong>{x.label}</strong>
            <label>Dosage<input required placeholder="e.g. 500 mg, 1 tablet" value={x.dosage} onChange={(e) => set(x.key, "dosage", e.target.value)} /></label>
            <label>Frequency<select value={x.frequency_per_day} onChange={(e) => set(x.key, "frequency_per_day", Number(e.target.value))}>
              {FREQUENCIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select></label>
            <label>Start<input required type="date" value={x.start_date} min={today()} onChange={(e) => set(x.key, "start_date", e.target.value)} /></label>
            <label>End<input required type="date" value={x.end_date} min={x.start_date} onChange={(e) => set(x.key, "end_date", e.target.value)} /></label>
            <button type="button" className="secondary" onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))}>Remove</button>
          </div>
        ))}
        {warnings.map((w) => (
          <p key={w.interaction_id} className="warning">
            <b>{w.severity}</b> {w.is_cross_prescription ? "⚠️ (Cross-Prescription Alert) " : "— "}
            {w.medicine_1} + {w.medicine_2}: {w.description}
            {w.is_cross_prescription && w.existing_medication && (
              <span style={{ display: "block", fontSize: "0.85rem", marginTop: "0.2rem" }}>
                Patient is actively taking {w.existing_medication.medicine_name} (prescribed by Dr. {w.existing_medication.doctor_name} until {w.existing_medication.end_date})
              </span>
            )}
          </p>
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
  const [page, setPage] = useState(0);
  const [error, setError] = useState("");
  const load = useCallback(() => call("/doctors/me/prescriptions").then((r) => setRows(r.data)).catch((e) => setError(e.message)), [call]);
  useEffect(() => { load(); }, [load]);

  async function cancel(rx) {
    if (!window.confirm(`Cancel prescription #${rx.prescription_id}? Pending reminders will stop.`)) return;
    try { await call(`/prescriptions/${rx.prescription_id}/cancel`, { method: "POST" }); setFlash({ success: `Prescription #${rx.prescription_id} cancelled.` }); setOpen(null); load(); }
    catch (e) { setError(e.message); }
  }

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Panel title="My prescriptions">
      <Notice error={error} />
      <List rows={pageRows} empty="You have not written any prescriptions yet." render={(r) => (
        <>
          <strong>{r.patient_name} — {r.diagnosis}</strong>
          <span>#{r.prescription_id} · {r.prescription_date} · {r.item_count} medicine(s) · {r.status}</span>
          <button className="link" onClick={() => setOpen(open === r.prescription_id ? null : r.prescription_id)}>{open === r.prescription_id ? "Hide" : "Details"}</button>
          {open === r.prescription_id && <PrescriptionDetail id={r.prescription_id} onCancel={cancel} />}
        </>
      )} />
      {totalPages > 1 && (
        <div className="pagination" role="navigation" aria-label="Prescription pages">
          <button className="secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">← Prev</button>
          <span className="muted" style={{ padding: "0 0.6rem", lineHeight: "2.4" }}>Page {page + 1} of {totalPages}</span>
          <button className="secondary" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} aria-label="Next page">Next →</button>
        </div>
      )}
    </Panel>
  );
}

function RxNormSearch() {
  const { call } = useAuth();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (term.trim().length < 2) return;
    setLoading(true);
    setError("");
    setSelected(null);
    try {
      const res = await call(`/medicines/external/search?q=${encodeURIComponent(term.trim())}`);
      setResults(res.data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function viewForms(cui, name) {
    setSelected({ cui, name });
    try {
      const res = await call(`/medicines/external/forms?name=${encodeURIComponent(name)}`);
      setForms(res.data.forms || []);
    } catch (e) {
      setForms([]);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.2rem" }}>
      <Panel title="NIH RxNorm Clinical Drug Database Explorer">
        <p className="muted" style={{ fontSize: "0.88rem", marginTop: "-0.3rem" }}>
          Explore clinical concepts, brand formulations, and standard strengths from the US National Library of Medicine.
        </p>
        <form className="inline" onSubmit={handleSearch}>
          <input
            placeholder="Search drug or brand (e.g. Amoxicillin, Lisinopril, Metformin, Lipitor)"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Search NIH RxNorm drug database"
          />
          <button>{loading ? "Searching..." : "Search RxNorm"}</button>
        </form>
        <Notice error={error} />
      </Panel>

      <section className="grid">
        <Panel title="Matching Clinical Concepts">
          <List
            rows={results}
            empty={term ? "No concepts found." : "Enter a search term above to look up drugs in the NIH registry."}
            render={(c) => (
              <>
                <strong>{c.name} <span className="badge">RxCUI {c.rxcui}</span></strong>
                <span>Source: {c.source}</span>
                <button className="link" onClick={() => viewForms(c.rxcui, c.name)}>View clinical forms</button>
              </>
            )}
          />
        </Panel>

        <Panel title={selected ? `Clinical Forms for ${selected.name}` : "Clinical Dosage Forms"}>
          {!selected ? (
            <p className="muted">Select a drug on the left to inspect official dosage forms and strengths.</p>
          ) : (
            <List
              rows={forms}
              empty="No specific dosage forms listed."
              render={(f) => (
                <>
                  <strong>{f.name}</strong>
                  <span>Form: {f.form_type} {f.synonym ? `· Brand: ${f.synonym}` : ""}</span>
                </>
              )}
            />
          )}
        </Panel>
      </section>
    </div>
  );
}
