import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";

const MAX_MB = 5;
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Files on one prescription (scans, lab reports). Everyone who can see the prescription can download; only its doctor can add or remove.
export default function Attachments({ prescriptionId, canEdit }) {
  const { call } = useAuth();
  const [files, setFiles] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const load = useCallback(() => call(`/prescriptions/${prescriptionId}/attachments`).then((r) => setFiles(r.data)).catch((e) => setError(e.message)), [call, prescriptionId]);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) return setError("Choose a PDF, PNG or JPEG file.");
    if (file.size > MAX_MB * 1048576) return setError(`The file is larger than ${MAX_MB} MB.`);
    setBusy(true);
    try { await call(`/prescriptions/${prescriptionId}/attachments?name=${encodeURIComponent(file.name)}`, { method: "POST", file }); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function open(f) {
    setError("");
    try {
      const blob = await call(`/attachments/${f.attachment_id}/download`, { blob: true });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = f.file_name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { setError(err.message); }
  }

  async function remove(f) {
    if (!window.confirm(`Delete ${f.file_name}?`)) return;
    setError("");
    try { await call(`/attachments/${f.attachment_id}`, { method: "DELETE" }); await load(); } catch (err) { setError(err.message); }
  }

  if (files && !files.length && !canEdit) return null;
  return (
    <div className="attachments">
      <p><b>Files</b></p>
      {error && <p className="error">{error}</p>}
      {files && files.map((f) => (
        <div className="row" key={f.attachment_id}>
          <div><b>{f.file_name}</b> <span className="muted small">{kb(f.size_bytes)} · added by {f.uploaded_by_name}</span></div>
          <div className="actions">
            <button className="secondary" onClick={() => open(f)}>Download</button>
            {canEdit && <button className="secondary" onClick={() => remove(f)}>Delete</button>}
          </div>
        </div>
      ))}
      {files && !files.length && <p className="muted small">No files yet.</p>}
      {canEdit && (
        <>
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" onChange={add} hidden />
          <button className="secondary" disabled={busy} onClick={() => input.current.click()}>{busy ? "Uploading…" : "Add a file (PDF, PNG, JPEG, up to 5 MB)"}</button>
        </>
      )}
    </div>
  );
}
