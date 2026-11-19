// Minimal iCalendar (RFC 5545) writer for the "add to my phone calendar" export.
// Times are "floating" (no time zone), so a 08:00 dose shows at 08:00 wherever the phone is.

const escapeText = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");

// Lines longer than 75 octets must be folded: CRLF + one space. Fold on character boundaries so UTF-8 is never split.
function fold(line) {
    if (Buffer.byteLength(line) <= 75) return line;
    const parts = [];
    let cur = "";
    let bytes = 0;
    let limit = 75;
    for (const ch of line) {
        const n = Buffer.byteLength(ch);
        if (bytes + n > limit) { parts.push(cur); cur = ""; bytes = 0; limit = 74; }
        cur += ch; bytes += n;
    }
    parts.push(cur);
    return parts.join("\r\n ");
}

// "2026-11-18 08:30" -> "20261118T083000"
const stamp = (s) => `${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}T${s.slice(11, 13)}${s.slice(14, 16)}00`;

function plusMinutes(s, minutes) {
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16) + minutes));
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

const utcStamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

// events: [{ uid, start: "YYYY-MM-DD HH:MM", minutes, summary, description, alarmMinutes }]
function buildCalendar(events, { name = "MedSync", now = new Date() } = {}) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MedSync//Care Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(name)}`];
    for (const e of events) {
        lines.push("BEGIN:VEVENT", `UID:${e.uid}@medsync`, `DTSTAMP:${utcStamp(now)}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(plusMinutes(e.start, e.minutes || 15))}`, `SUMMARY:${escapeText(e.summary)}`);
        if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
        if (e.alarmMinutes != null) lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.summary)}`, `TRIGGER:-PT${e.alarmMinutes}M`, "END:VALARM");
        lines.push("END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
}

module.exports = { buildCalendar, escapeText, fold };
