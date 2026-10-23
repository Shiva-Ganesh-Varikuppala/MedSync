const { badRequest } = require("../utils/httpError");

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

/**
 * Searches the US National Library of Medicine (NIH RxNorm) database
 * for clinical drug concepts and active RxCUI numbers.
 */
async function searchRxNorm(term, maxEntries = 8) {
    if (!term || typeof term !== "string" || term.trim().length < 2) {
        throw badRequest("Search term must be at least 2 characters");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const url = `${RXNAV_BASE}/approximateTerm.json?term=${encodeURIComponent(term.trim())}&maxEntries=${maxEntries}`;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`RxNorm returned HTTP ${res.status}`);
        const data = await res.json();
        const candidates = data?.approximateGroup?.candidate || [];

        const seen = new Set();
        const results = [];
        for (const c of candidates) {
            if (!c.name || seen.has(c.name.toLowerCase())) continue;
            seen.add(c.name.toLowerCase());
            results.push({
                rxcui: c.rxcui,
                name: c.name,
                rank: c.rank,
                source: c.source || "RXNORM"
            });
        }
        return {
            source: "NIH_RxNorm",
            term: term.trim(),
            results
        };
    } catch (err) {
        return {
            source: "local_fallback",
            term: term.trim(),
            error: err.name === "AbortError" ? "RxNorm API timed out" : err.message,
            results: []
        };
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetches clinical properties of an RxNorm concept.
 */
async function getDrugProperties(rxcui) {
    if (!rxcui) throw badRequest("rxcui is required");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/properties.json`;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`RxNorm returned HTTP ${res.status}`);
        const data = await res.json();
        return {
            source: "NIH_RxNorm",
            properties: data?.properties || null
        };
    } catch (err) {
        return {
            source: "local_fallback",
            error: err.message,
            properties: null
        };
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Fetches clinical dosage forms and brand packs for a drug from RxNorm.
 */
async function getClinicalForms(drugName) {
    if (!drugName) throw badRequest("drugName is required");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
        const url = `${RXNAV_BASE}/drugs.json?name=${encodeURIComponent(drugName.trim())}`;
        const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`RxNorm returned HTTP ${res.status}`);
        const data = await res.json();
        const groups = data?.drugGroup?.conceptGroup || [];

        const forms = [];
        for (const g of groups) {
            for (const p of g.conceptProperties || []) {
                forms.push({
                    rxcui: p.rxcui,
                    name: p.name,
                    synonym: p.synonym,
                    form_type: p.tty
                });
            }
        }

        return {
            source: "NIH_RxNorm",
            drug: drugName.trim(),
            forms: forms.slice(0, 20)
        };
    } catch (err) {
        return {
            source: "local_fallback",
            drug: drugName.trim(),
            error: err.message,
            forms: []
        };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = {
    getClinicalForms,
    getDrugProperties,
    searchRxNorm
};
