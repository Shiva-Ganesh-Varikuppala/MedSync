// A small PDF writer with no dependencies: A4 pages, the two standard Helvetica fonts, text and lines.
// Enough for a printed prescription. Text is written in the WinAnsi (Latin-1) range; any other character becomes "?".
//
//   const pdf = new Pdf({ title: "Prescription #7" });
//   pdf.text("Heading", { size: 18, bold: true });
//   pdf.row([{ text: "Medicine", width: 200 }, { text: "Dosage", width: 100 }], { bold: true });
//   const buffer = pdf.toBuffer();
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const FOOTER = 30; // space kept free at the bottom for the page number

// Helvetica glyph widths (1/1000 em) for ASCII 32..126; used to wrap text. Bold is a little wider, so it is padded.
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

// Keep only what the standard fonts can show.
const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/\t/g, " ").replace(/[^\u0000-ÿ]/g, "?");
const escapeText = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const widthOf = (s, size, bold) => {
    let total = 0;
    for (const ch of s) { const c = ch.charCodeAt(0); total += c >= 32 && c <= 126 ? W[c - 32] : 556; }
    return (total / 1000) * size * (bold ? 1.07 : 1);
};

// Breaks text into lines no wider than maxWidth. Explicit newlines are kept; a single word that is too long is cut.
function wrap(text, maxWidth, size, bold) {
    const lines = [];
    for (const paragraph of clean(text).split("\n")) {
        let line = "";
        for (const word of paragraph.split(/ +/).filter(Boolean)) {
            const candidate = line ? `${line} ${word}` : word;
            if (widthOf(candidate, size, bold) <= maxWidth) { line = candidate; continue; }
            if (line) lines.push(line);
            let rest = word;
            while (widthOf(rest, size, bold) > maxWidth) {
                let n = rest.length;
                while (n > 1 && widthOf(rest.slice(0, n), size, bold) > maxWidth) n -= 1;
                lines.push(rest.slice(0, n));
                rest = rest.slice(n);
            }
            line = rest;
        }
        lines.push(line);
    }
    return lines;
}

const pdfDate = (d) => `D:${d.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;

class Pdf {
    constructor({ title = "", author = "MedSync" } = {}) {
        this.title = clean(title);
        this.author = clean(author);
        this.pages = [];
        this.y = MARGIN; // distance from the top of the page
        this.newPage();
    }

    newPage() { this.pages.push([]); this.y = MARGIN; }
    get contentWidth() { return PAGE_W - 2 * MARGIN; }
    space(points = 8) { this.y += points; }

    ensure(height) { if (this.y + height > PAGE_H - MARGIN - FOOTER) this.newPage(); }

    draw(x, y, text, size, bold) {
        if (!text) return;
        this.pages[this.pages.length - 1].push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${(PAGE_H - y - size).toFixed(2)} Td (${escapeText(text)}) Tj ET`);
    }

    // A paragraph that wraps and flows onto the next page when needed.
    text(text, { size = 11, bold = false, indent = 0, gap = 2 } = {}) {
        const lead = size * 1.35;
        for (const line of wrap(text, this.contentWidth - indent, size, bold)) {
            this.ensure(lead);
            this.draw(MARGIN + indent, this.y, line, size, bold);
            this.y += lead;
        }
        this.y += gap;
    }

    rule() {
        this.ensure(6);
        const y = (PAGE_H - this.y - 2).toFixed(2);
        this.pages[this.pages.length - 1].push(`0.6 w ${MARGIN} ${y} m ${(PAGE_W - MARGIN).toFixed(2)} ${y} l S`);
        this.y += 8;
    }

    // One table row. Each cell wraps inside its own width; the row is as tall as its tallest cell and is never split across pages.
    row(cells, { size = 10, bold = false } = {}) {
        const lead = size * 1.35;
        let x = MARGIN;
        const laid = cells.map((c) => { const lines = wrap(c.text, c.width - 6, size, bold); const out = { x, lines }; x += c.width; return out; });
        const height = Math.max(...laid.map((c) => c.lines.length)) * lead;
        this.ensure(height);
        for (const c of laid) c.lines.forEach((line, i) => this.draw(c.x, this.y + i * lead, line, size, bold));
        this.y += height + 3;
    }

    toBuffer() {
        const total = this.pages.length;
        const pageBodies = this.pages.map((ops, i) => {
            const label = `Page ${i + 1} of ${total}`;
            const footer = `BT /F1 8 Tf ${((PAGE_W - widthOf(label, 8, false)) / 2).toFixed(2)} 28 Td (${label}) Tj ET`;
            return [...ops, footer].join("\n");
        });

        // Objects: 1 catalog, 2 page tree, 3 and 4 fonts, 5 info, then a page object and a content stream per page.
        const objects = [];
        const kids = pageBodies.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
        objects.push("<< /Type /Catalog /Pages 2 0 R >>");
        objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${total} >>`);
        objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
        objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
        objects.push(`<< /Title (${escapeText(this.title)}) /Author (${escapeText(this.author)}) /Producer (MedSync) /CreationDate (${pdfDate(new Date())}) >>`);
        pageBodies.forEach((body, i) => {
            const content = 7 + i * 2;
            objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${content} 0 R >>`);
            objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
        });

        // Every character is in the Latin-1 range, so one character is one byte and offsets can be counted as string lengths.
        let out = "%PDF-1.4\n";
        const offsets = [];
        objects.forEach((obj, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
        const xref = out.length;
        out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
        out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
        return Buffer.from(out, "latin1");
    }
}

module.exports = { Pdf, wrap };
