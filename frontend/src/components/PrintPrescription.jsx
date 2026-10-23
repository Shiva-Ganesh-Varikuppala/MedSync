import React from "react";

export default function PrintPrescription({ rx, onClose }) {
  if (!rx) return null;

  return (
    <div className="print-modal-overlay">
      <div className="print-modal card">
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <div>
            <button onClick={() => window.print()} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              🖨️ Print / Save as PDF
            </button>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>

        <div className="rx-slip">
          {/* Header */}
          <div className="rx-header">
            <div>
              <p className="eyebrow" style={{ margin: 0, fontSize: "0.85rem" }}>MEDSYNC CLINICAL NETWORK</p>
              <h2 style={{ margin: "0.2rem 0" }}>Medical Prescription</h2>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Official Digital Health Record</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <h3 style={{ margin: 0, color: "#087e8b" }}>Rx #{rx.prescription_id}</h3>
              <p style={{ margin: "0.2rem 0", fontSize: "0.85rem" }}><b>Date:</b> {rx.prescription_date}</p>
              <span className={`badge ${rx.status === "CANCELLED" ? "EXPIRED" : ""}`}>
                {rx.status}
              </span>
            </div>
          </div>

          <hr style={{ border: 0, borderTop: "1px solid #dbe7eb", margin: "1rem 0" }} />

          {/* Parties */}
          <div className="grid" style={{ gap: "1rem", marginBottom: "1rem" }}>
            <div style={{ background: "#f8fbfc", padding: "0.8rem", borderRadius: "8px", border: "1px solid #e7eef0" }}>
              <p className="eyebrow" style={{ margin: 0, fontSize: "0.75rem" }}>PRESCRIBING PHYSICIAN</p>
              <strong style={{ fontSize: "1.05rem", display: "block", marginTop: "0.2rem" }}>{rx.doctor_name}</strong>
              <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#627d98" }}>
                License: {rx.license_number || "REG-MEDSYNC"} · {rx.specialization || "Physician"}
              </p>
            </div>
            <div style={{ background: "#f8fbfc", padding: "0.8rem", borderRadius: "8px", border: "1px solid #e7eef0" }}>
              <p className="eyebrow" style={{ margin: 0, fontSize: "0.75rem" }}>PATIENT INFORMATION</p>
              <strong style={{ fontSize: "1.05rem", display: "block", marginTop: "0.2rem" }}>{rx.patient_name}</strong>
              <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#627d98" }}>
                Patient ID: #{rx.patient_id} {rx.gender ? `· ${rx.gender}` : ""} {rx.date_of_birth ? `· DOB: ${rx.date_of_birth}` : ""}
              </p>
            </div>
          </div>

          {rx.diagnosis && (
            <div style={{ margin: "0.8rem 0", padding: "0.6rem 0.8rem", background: "#f0f7f9", borderRadius: "6px" }}>
              <b>Clinical Diagnosis / Indications:</b> {rx.diagnosis}
            </div>
          )}

          {/* Medications Table */}
          <h4 style={{ margin: "1rem 0 0.4rem" }}>Prescribed Medications (Rx)</h4>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "#eef6f8", textAlign: "left" }}>
                <th style={{ padding: "0.5rem" }}>#</th>
                <th style={{ padding: "0.5rem" }}>Medicine & Generic</th>
                <th style={{ padding: "0.5rem" }}>Dosage</th>
                <th style={{ padding: "0.5rem" }}>Frequency</th>
                <th style={{ padding: "0.5rem" }}>Duration</th>
                <th style={{ padding: "0.5rem" }}>Instructions</th>
              </tr>
            </thead>
            <tbody>
              {rx.items?.map((item, idx) => (
                <tr key={item.prescription_item_id || idx} style={{ borderBottom: "1px solid #e7eef0" }}>
                  <td style={{ padding: "0.5rem", color: "#627d98" }}>{idx + 1}</td>
                  <td style={{ padding: "0.5rem" }}>
                    <b>{item.medicine_name}</b>
                    {item.generic_name && <span style={{ display: "block", fontSize: "0.8rem", color: "#627d98" }}>({item.generic_name})</span>}
                  </td>
                  <td style={{ padding: "0.5rem" }}>{item.dosage}</td>
                  <td style={{ padding: "0.5rem" }}>{item.frequency}</td>
                  <td style={{ padding: "0.5rem" }}>{item.start_date} → {item.end_date}</td>
                  <td style={{ padding: "0.5rem", fontStyle: item.instructions ? "italic" : "normal", color: item.instructions ? "#102a43" : "#627d98" }}>
                    {item.instructions || "As directed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rx.notes && (
            <div style={{ marginTop: "1rem", fontSize: "0.88rem" }}>
              <b>Doctor's Clinical Notes:</b> <span style={{ color: "#486581" }}>{rx.notes}</span>
            </div>
          )}

          {/* Pharmacy Fulfillment Status */}
          {rx.status === "DISPENSED" && (
            <div style={{ marginTop: "1.2rem", padding: "0.8rem", background: "#e8f6ed", borderRadius: "8px", border: "1px solid #b7eb8f" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ color: "#16743c" }}>✓ Dispensed & Fulfilled</strong>
                  <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#1b4d3e" }}>
                    Fulfilled by {rx.dispensed_pharmacy_name || "Assigned Pharmacy"} ({rx.dispensed_by_name || "Pharmacist"}) on {rx.dispensed_at?.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
              </div>
              {rx.dispensed_items?.length > 0 && (
                <div style={{ marginTop: "0.4rem", fontSize: "0.82rem", color: "#2d6a4f" }}>
                  <b>Dispensed Batches: </b>
                  {rx.dispensed_items.map((b) => `Batch ${b.batch_number} (${b.quantity} units, exp: ${b.expiry_date})`).join(" · ")}
                </div>
              )}
            </div>
          )}

          {/* Signoff / Security footer */}
          <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px dashed #c9d9de", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ fontSize: "0.75rem", color: "#829ab1" }}>
              <p style={{ margin: "0.1rem 0" }}>MedSync Healthcare Information System</p>
              <p style={{ margin: "0.1rem 0" }}>Tamper-Evident Digital Prescription Record</p>
              <p style={{ margin: "0.1rem 0" }}>Verified electronically with database audit log #{rx.prescription_id}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "cursive", fontSize: "1.1rem", color: "#087e8b" }}>
                Dr. {rx.doctor_name}
              </div>
              <p style={{ margin: 0, fontSize: "0.78rem", borderTop: "1px solid #627d98", paddingTop: "0.2rem", color: "#627d98" }}>
                Authorized Medical Signature
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
