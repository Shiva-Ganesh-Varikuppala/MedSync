// CSV for spreadsheets (RFC 4180): quotes around values that need them, CRLF line ends, and a UTF-8 byte-order mark so
// Excel shows accented names correctly.
//
// Spreadsheet formula injection: a text cell that starts with = + - @ (or a tab/return) is run as a formula by Excel
// and Google Sheets. Names and notes come from users, so such cells get a leading apostrophe and stay plain text.
// Real numbers are written as they are.
function cell(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    let text = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// columns: [{ key, label }]; rows: objects.
function toCsv(columns, rows) {
    const lines = [columns.map((c) => cell(c.label)).join(",")];
    for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(","));
    return `﻿${lines.join("\r\n")}\r\n`;
}

module.exports = { cell, toCsv };
