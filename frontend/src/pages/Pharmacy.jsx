import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth";
import { List, Notice, Panel } from "../components/ui";
import MedicinePicker from "../components/MedicinePicker";

const today = () => new Date().toISOString().slice(0, 10);
const PAGE_SIZE = 8;
const STATUS_TEXT = { VALID: "In date", EXPIRING_SOON: "Expiring soon", EXPIRED: "Expired" };
const TABS = [
  ["inventory", "Inventory"],
  ["dispense", "Dispense prescription"],
  ["receive", "Receive stock"],
  ["alerts", "Alerts"],
  ["catalog", "Medicine catalog"]
];

export default function Pharmacy() {
  const { user } = useAuth();
  const [tab, setTab] = useState("inventory");
  const [flash, setFlash] = useState({});
  if (!user.pharmacy_id) return <p className="error">Your account is not linked to a pharmacy. Ask an administrator.</p>;
  const go = (k) => { setTab(k); setFlash({}); };
  return (
    <>
      <nav className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "" : "secondary"} onClick={() => go(k)}>{l}</button>)}
      </nav>
      <Notice {...flash} />
      {tab === "inventory" && <Inventory pid={user.pharmacy_id} setFlash={setFlash} />}
      {tab === "dispense" && <Dispense pid={user.pharmacy_id} setFlash={setFlash} />}
      {tab === "receive" && <Receive pid={user.pharmacy_id} done={(m) => { setFlash({ success: m }); setTab("inventory"); }} />}
      {tab === "alerts" && <Alerts pid={user.pharmacy_id} />}
      {tab === "catalog" && <Catalog setFlash={setFlash} />}
    </>
  );
}

function Inventory({ pid, setFlash }) {
  const { call } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [delta, setDelta] = useState({});
  const [error, setError] = useState("");
  const load = useCallback(() => call(`/pharmacies/${pid}/inventory`).then((r) => setRows(r.data)).catch((e) => setError(e.message)), [call, pid]);
  useEffect(() => { load(); }, [load]);

  async function adjust(b) {
    const change = Number(delta[b.batch_id]);
    if (!Number.isInteger(change) || change === 0) { setError("Enter a whole number such as 10 or -5."); return; }
    try {
      await call(`/batches/${b.batch_id}/quantity`, { method: "PATCH", body: { quantity_change: change } });
      setDelta({ ...delta, [b.batch_id]: "" }); setError(""); setFlash({ success: `${b.name} batch ${b.batch_number}: stock changed by ${change}.` }); load();
    } catch (e) { setError(e.message); }
  }
  async function remove(b) {
    if (!window.confirm(`Permanently remove batch ${b.batch_number} of ${b.name}?`)) return;
    try { await call(`/batches/${b.batch_id}`, { method: "DELETE" }); setFlash({ success: "Batch removed." }); load(); }
    catch (e) { setError(e.message); }
  }
  const shown = rows.filter((r) => `${r.name} ${r.generic_name} ${r.batch_number}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <Panel title="Inventory">
      <input className="filter" placeholder="Filter by medicine or batch number" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter inventory" />
      <Notice error={error} />
      <List rows={shown} empty="No batches match." render={(b) => (
        <>
          <strong>{b.name} <span className={`badge ${b.inventory_status}`}>{STATUS_TEXT[b.inventory_status]}</span></strong>
          <span>Batch {b.batch_number} · {b.quantity} units · expires {b.expiry_date}</span>
          <div className="actions">
            <input type="number" className="qty" placeholder="+/- qty" value={delta[b.batch_id] ?? ""} onChange={(e) => setDelta({ ...delta, [b.batch_id]: e.target.value })} aria-label={`Quantity change for batch ${b.batch_number}`} />
            <button onClick={() => adjust(b)}>Apply</button>
            {b.inventory_status === "EXPIRED" && <button className="secondary" onClick={() => remove(b)}>Remove</button>}
          </div>
        </>
      )} />
    </Panel>
  );
}

function Dispense({ pid, setFlash }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [pending, setPending] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [stockInfo, setStockInfo] = useState(null);
  const [dispensations, setDispensations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dispensing, setDispensing] = useState(false);
  const [error, setError] = useState("");
  const [dispPage, setDispPage] = useState(0);

  const loadPending = useCallback(() => {
    call(`/pharmacies/${pid}/prescriptions/pending${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => setPending(r.data))
      .catch((e) => setError(e.message));
  }, [call, pid, q]);

  const loadDispensations = useCallback(() => {
    call(`/pharmacies/${pid}/dispensations`)
      .then((r) => setDispensations(r.data))
      .catch(() => {});
  }, [call, pid]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { loadDispensations(); }, [loadDispensations]);

  useEffect(() => {
    if (!selectedId) { setStockInfo(null); return; }
    setLoading(true);
    setError("");
    call(`/pharmacies/${pid}/prescriptions/${selectedId}/stock`)
      .then((r) => { setStockInfo(r.data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [selectedId, call, pid]);

  async function handleDispense() {
    if (!stockInfo?.can_dispense) return;
    setDispensing(true);
    setError("");
    try {
      await call(`/pharmacies/${pid}/prescriptions/${selectedId}/dispense`, { method: "POST", body: {} });
      setFlash({ success: `Prescription #${selectedId} dispensed successfully! Stock has been deducted.` });
      setSelectedId(null);
      setStockInfo(null);
      loadPending();
      loadDispensations();
    } catch (e) {
      setError(e.message);
    } finally {
      setDispensing(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.2rem" }}>
      <Notice error={error} />

      {selectedId && stockInfo && (
        <Panel title={`Prescription #${selectedId} Stock Inspection & Dispense`}>
          <div style={{ marginBottom: "0.8rem", borderBottom: "1px solid #e7eef0", paddingBottom: "0.6rem" }}>
            <p style={{ margin: "0.2rem 0" }}>
              <b>Patient:</b> {stockInfo.prescription.patient_name} · <b>Doctor:</b> {stockInfo.prescription.doctor_name} · <b>Date:</b> {stockInfo.prescription.prescription_date}
            </p>
            {stockInfo.prescription.diagnosis && <p style={{ margin: "0.2rem 0" }}><b>Diagnosis:</b> {stockInfo.prescription.diagnosis}</p>}
          </div>

          <h3>Required Medicines & Inventory Check</h3>
          <div className="list">
            {stockInfo.items.map((item) => (
              <div key={item.prescription_item_id} className="row" style={{ padding: "0.8rem 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong>{item.medicine_name} {item.strength || ""}</strong>
                    <p style={{ margin: "0.2rem 0", color: "#627d98", fontSize: "0.85rem" }}>
                      Dosage: {item.dosage} · Frequency: {item.frequency} ({item.course_days} days)
                    </p>
                  </div>
                  <span className={`badge ${item.is_sufficient ? "" : "EXPIRED"}`}>
                    {item.is_sufficient ? "Stock available" : "Insufficient stock"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "1.2rem", fontSize: "0.88rem", marginTop: "0.3rem" }}>
                  <span>Required: <b>{item.required_quantity}</b> units</span>
                  <span>In-date available: <b>{item.available_stock}</b> units</span>
                </div>
                {item.suggested_batches?.length > 0 && (
                  <div style={{ background: "#f8fbfc", border: "1px solid #e7eef0", borderRadius: "6px", padding: "0.4rem 0.6rem", marginTop: "0.4rem", fontSize: "0.82rem" }}>
                    <b>FEFO Batch Allocation:</b>
                    <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.2rem" }}>
                      {item.suggested_batches.map((b) => (
                        <li key={b.batch_id}>
                          Batch {b.batch_number} → deduct {b.take} unit(s) (expires {b.expiry_date}, {b.days_until_expiry} days left)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "1rem", display: "flex", gap: "0.8rem", alignItems: "center" }}>
            <button disabled={!stockInfo.can_dispense || dispensing} onClick={handleDispense}>
              {dispensing ? "Processing..." : stockInfo.can_dispense ? "Confirm & Dispense" : "Insufficient Stock to Dispense"}
            </button>
            <button className="secondary" onClick={() => setSelectedId(null)}>Close</button>
          </div>
        </Panel>
      )}

      <section className="grid">
        <Panel title="Pending Prescriptions">
          <input
            className="filter"
            placeholder="Search by Rx # or patient name..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search pending prescriptions"
          />
          <List
            rows={pending}
            empty={loading ? "Checking prescriptions..." : "No pending prescriptions waiting for fulfillment."}
            render={(rx) => (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>#{rx.prescription_id} · {rx.patient_name}</strong>
                  <button className="secondary" style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem" }} onClick={() => setSelectedId(rx.prescription_id)}>
                    {selectedId === rx.prescription_id ? "Inspecting" : "Check & Dispense"}
                  </button>
                </div>
                <span>Dr. {rx.doctor_name} · {rx.prescription_date} · {rx.item_count} medicine(s)</span>
                {rx.diagnosis && <span style={{ fontStyle: "italic" }}>"{rx.diagnosis}"</span>}
              </>
            )}
          />
        </Panel>

        <Panel title="Dispensation history">
          {dispensations.length === 0 ? <p className="muted">No dispensations recorded yet.</p> : (
            <>
              <List
                rows={dispensations.slice(dispPage * PAGE_SIZE, (dispPage + 1) * PAGE_SIZE)}
                empty="No dispensations recorded yet."
                render={(d) => (
                  <>
                    <strong>{d.patient_name} — {d.diagnosis}</strong>
                    <span>Rx #{d.prescription_id} · dispensed {d.dispensed_at?.slice(0, 16).replace("T", " ")} by {d.dispensed_by_name}</span>
                    <span className="muted" style={{ fontSize: "0.82rem" }}>{d.items?.map((i) => `${i.medicine_name} ×${i.quantity_dispensed}`).join(", ")}</span>
                  </>
                )}
              />
              {Math.ceil(dispensations.length / PAGE_SIZE) > 1 && (
                <div className="pagination" role="navigation" aria-label="Dispensation pages">
                  <button className="secondary" onClick={() => setDispPage((p) => Math.max(0, p - 1))} disabled={dispPage === 0} aria-label="Previous page">← Prev</button>
                  <span className="muted" style={{ padding: "0 0.6rem", lineHeight: "2.4" }}>Page {dispPage + 1} of {Math.ceil(dispensations.length / PAGE_SIZE)}</span>
                  <button className="secondary" onClick={() => setDispPage((p) => Math.min(Math.ceil(dispensations.length / PAGE_SIZE) - 1, p + 1))} disabled={dispPage === Math.ceil(dispensations.length / PAGE_SIZE) - 1} aria-label="Next page">Next →</button>
                </div>
              )}
            </>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Receive({ pid, done }) {
  const { call } = useAuth();
  const [medicine, setMedicine] = useState(null);
  const [f, setF] = useState({ batch_number: "", quantity: "", expiry_date: "" });
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!medicine) { setError("Choose a medicine first."); return; }
    try {
      await call(`/pharmacies/${pid}/batches`, { method: "POST", body: { medicine_id: medicine.medicine_id, batch_number: f.batch_number.trim(), quantity: Number(f.quantity), expiry_date: f.expiry_date } });
      done(`Batch ${f.batch_number} of ${medicine.name} received.`);
    } catch (err) { setError(err.message); }
  }
  return (
    <Panel title="Receive a new batch">
      <form className="form" onSubmit={submit}>
        {medicine ? <p>Medicine: <b>{medicine.name} {medicine.strength}</b> <button type="button" className="link" onClick={() => setMedicine(null)}>change</button></p> : <MedicinePicker onPick={setMedicine} />}
        <label>Batch number<input required maxLength={50} value={f.batch_number} onChange={(e) => setF({ ...f, batch_number: e.target.value })} /></label>
        <label>Quantity<input required type="number" min="0" step="1" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
        <label>Expiry date<input required type="date" min={today()} value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} /></label>
        <Notice error={error} />
        <button>Save batch</button>
      </form>
    </Panel>
  );
}

function Alerts({ pid }) {
  const { call } = useAuth();
  const [low, setLow] = useState([]);
  const [exp, setExp] = useState([]);
  const [days, setDays] = useState(60);
  const [error, setError] = useState("");
  useEffect(() => { call(`/pharmacies/${pid}/low-stock`).then((r) => setLow(r.data)).catch((e) => setError(e.message)); }, [call, pid]);
  useEffect(() => { call(`/pharmacies/${pid}/expiring?days=${days}`).then((r) => setExp(r.data.batches)).catch((e) => setError(e.message)); }, [call, pid, days]);
  return (
    <>
      <Notice error={error} />
      <section className="grid">
        <Panel title="Low stock">
          <List rows={low} empty="Nothing is below its reorder level." render={(m) => (
            <><strong>{m.name} {m.strength}</strong><span>{m.total_on_hand} in date · reorder level {m.reorder_level}</span></>
          )} />
        </Panel>
        <Panel title="Expiring soon">
          <label className="inline-label">Within <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[30, 60, 90, 180].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <List rows={exp} empty="No batches expire in this window." render={(b) => (
            <><strong>{b.name}</strong><span>Batch {b.batch_number} · {b.quantity} units · {b.days_left < 0 ? "expired" : `${b.days_left} days left`} ({b.expiry_date})</span></>
          )} />
        </Panel>
      </section>
    </>
  );
}

function Catalog({ setFlash }) {
  const { call } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [f, setF] = useState({ name: "", generic_name: "", dosage_form: "Tablet", strength: "", reorder_level: 20 });
  const [error, setError] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    let stale = false;
    const t = setTimeout(() => call(`/medicines/search?q=${encodeURIComponent(q.trim())}`).then((r) => !stale && setResults(r.data)).catch((e) => !stale && setError(e.message)), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, call]);

  async function add(e) {
    e.preventDefault();
    try { await call("/medicines", { method: "POST", body: { ...f, reorder_level: Number(f.reorder_level) } }); setFlash({ success: `${f.name} added to the catalog.` }); setF({ ...f, name: "", generic_name: "", strength: "" }); setError(""); }
    catch (err) { setError(err.message); }
  }
  return (
    <section className="grid">
      <Panel title="Look up a medicine">
        <input className="filter" placeholder="Name or generic name (2+ letters)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Catalog search" />
        <List rows={results} empty={q.trim().length < 2 ? "Type to search the catalog." : "No medicines found."} render={(m) => (
          <><strong>{m.name} {m.strength}</strong><span>{m.generic_name} · {m.dosage_form}</span></>
        )} />
      </Panel>
      <Panel title="Add a medicine to the catalog">
        <form className="form" onSubmit={add}>
          <label>Brand name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Generic name<input required value={f.generic_name} onChange={(e) => setF({ ...f, generic_name: e.target.value })} /></label>
          <label>Dosage form<input required value={f.dosage_form} onChange={(e) => setF({ ...f, dosage_form: e.target.value })} /></label>
          <label>Strength<input required placeholder="e.g. 500 mg" value={f.strength} onChange={(e) => setF({ ...f, strength: e.target.value })} /></label>
          <label>Reorder level<input required type="number" min="0" value={f.reorder_level} onChange={(e) => setF({ ...f, reorder_level: e.target.value })} /></label>
          <Notice error={error} />
          <button>Add medicine</button>
        </form>
      </Panel>
    </section>
  );
}
