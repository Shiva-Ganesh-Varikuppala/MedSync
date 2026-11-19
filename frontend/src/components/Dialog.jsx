import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./Dialog.css";

// Replacements for window.confirm / window.prompt that match the app and work with keyboard and screen readers.
//   const ok = await confirmDialog({ title, message, confirmLabel, danger });          -> true | false
//   const text = await promptDialog({ title, message, label, initial, type, multiline,
//                                     required, minLength, validate(text) -> "problem", match })   -> string | null
// `match` makes the confirm button wait until the typed text equals it (case-insensitive), e.g. the email of an account about to be deleted.
// <DialogHost /> must be mounted once (App.jsx). Without a host the browser's own dialogs are used, so nothing breaks.
let push = null;
let counter = 0;

function open(spec) {
  if (!push) {
    return Promise.resolve(spec.kind === "prompt" ? window.prompt(`${spec.title}\n\n${[].concat(spec.message || []).join("\n")}\n${spec.label || ""}`, spec.initial || "") : window.confirm(`${spec.title}\n\n${[].concat(spec.message || []).join("\n")}`));
  }
  return new Promise((resolve) => push({ id: ++counter, spec, resolve }));
}
export const confirmDialog = (spec) => open({ ...spec, kind: "confirm" });
export const promptDialog = (spec) => open({ ...spec, kind: "prompt" });

function DialogBox({ item, onClose }) {
  const { spec } = item;
  const isPrompt = spec.kind === "prompt";
  const [value, setValue] = useState(spec.initial ?? "");
  const [touched, setTouched] = useState(false);
  const box = useRef(null);
  const field = useRef(null);
  const cancelBtn = useRef(null);
  const confirmBtn = useRef(null);
  const ids = useRef({ t: `dlg-t-${item.id}`, d: `dlg-d-${item.id}` });

  const text = value.trim();
  let problem = ""; // a message shown to the person
  let blocked = false; // disables the confirm button without nagging
  if (isPrompt) {
    if (spec.match != null) blocked = text.toLowerCase() !== String(spec.match).trim().toLowerCase();
    else if (spec.required !== false && !text) blocked = true;
    else if (spec.minLength && text.length < spec.minLength) problem = `Enter at least ${spec.minLength} characters.`;
    else if (spec.validate) problem = spec.validate(spec.type === "password" ? value : text) || "";
  }
  const canSubmit = !blocked && !problem;

  useEffect(() => {
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = isPrompt ? field.current : spec.danger ? cancelBtn.current : confirmBtn.current; // never default to the destructive button
    first?.focus();
    return () => { document.body.style.overflow = overflow; if (before && before.focus) before.focus(); };
  }, [isPrompt, spec.danger]);

  const cancel = () => onClose(isPrompt ? null : false);
  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    onClose(isPrompt ? (spec.type === "password" ? value : text) : true);
  }
  function keys(e) {
    if (e.key === "Escape") { e.stopPropagation(); cancel(); return; }
    if (e.key !== "Tab") return;
    const nodes = [...box.current.querySelectorAll("input, textarea, button:not([disabled])")];
    if (!nodes.length) return;
    const firstNode = nodes[0], lastNode = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstNode) { e.preventDefault(); lastNode.focus(); }
    else if (!e.shiftKey && document.activeElement === lastNode) { e.preventDefault(); firstNode.focus(); }
  }

  const paras = [].concat(spec.message || []).flatMap((m) => String(m).split("\n")).filter(Boolean);
  const Field = spec.multiline ? "textarea" : "input";
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <form ref={box} className={`dlg${spec.danger ? " danger" : ""}`} role={spec.danger && !isPrompt ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={ids.current.t} aria-describedby={ids.current.d} onSubmit={submit} onKeyDown={keys} noValidate>
        {spec.danger && <span className="dlg-icon" aria-hidden="true">!</span>}
        <h2 id={ids.current.t}>{spec.title}</h2>
        <div id={ids.current.d} className="dlg-body">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
        {isPrompt && (
          <label className="dlg-field">
            {spec.label}
            <Field ref={field} type={spec.multiline ? undefined : spec.type || "text"} rows={spec.multiline ? 3 : undefined} value={value} placeholder={spec.placeholder} autoComplete={spec.type === "password" ? "new-password" : "off"}
              onChange={(e) => { setValue(e.target.value); setTouched(true); }} />
          </label>
        )}
        {isPrompt && spec.match != null && <p className="dlg-hint">Type <code>{spec.match}</code> exactly to enable the button.</p>}
        {touched && problem && <p className="dlg-error" role="alert">{problem}</p>}
        <div className="dlg-actions">
          <button type="button" ref={cancelBtn} className="secondary" onClick={cancel}>{spec.cancelLabel || "Cancel"}</button>
          <button type="submit" ref={confirmBtn} className={spec.danger ? "danger" : ""} disabled={!canSubmit}>{spec.confirmLabel || "OK"}</button>
        </div>
      </form>
    </div>
  );
}

export default function DialogHost() {
  const [cur, setCur] = useState(null);
  const curRef = useRef(null);
  const waiting = useRef([]);
  useEffect(() => {
    push = (item) => { if (curRef.current) waiting.current.push(item); else { curRef.current = item; setCur(item); } };
    return () => { push = null; };
  }, []);
  function close(result) {
    const item = curRef.current;
    const next = waiting.current.shift() || null;
    curRef.current = next; setCur(next);
    if (item) item.resolve(result);
  }
  return cur ? createPortal(<DialogBox key={cur.id} item={cur} onClose={close} />, document.body) : null;
}
