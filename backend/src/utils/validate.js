const { badRequest } = require("./httpError");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
    if (typeof value !== "string" || !DATE_RE.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function todayString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function toInt(value, field, { min = 1, max = 2147483647 } = {}) {
    const n = typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : value;
    if (!Number.isInteger(n) || n < min || n > max) {
        throw badRequest(`${field} must be a whole number between ${min} and ${max}`);
    }
    return n;
}

function toText(value, field, { min = 1, max = 255, required = true } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) throw badRequest(`${field} is required`);
        return null;
    }
    if (typeof value !== "string") throw badRequest(`${field} must be text`);
    const s = value.trim();
    if (s.length < min || s.length > max) {
        throw badRequest(`${field} must be ${min}-${max} characters`);
    }
    return s;
}

function toDate(value, field, { required = true } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) throw badRequest(`${field} is required`);
        return null;
    }
    if (!isValidDate(value)) throw badRequest(`${field} must be a real date in YYYY-MM-DD format`);
    return value;
}

function toEnum(value, field, allowed) {
    if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(", ")}`);
    return value;
}

function pagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
    const limit = Math.min(query.limit ? toInt(query.limit, "limit", { max: maxLimit }) : defaultLimit, maxLimit);
    const page = query.page ? toInt(query.page, "page", { max: 100000 }) : 1;
    return { limit, offset: (page - 1) * limit, page };
}

// Escapes % and _ so a user search cannot act as a wildcard pattern.
const likeEscape = (s) => s.replace(/[\\%_]/g, "\\$&");

module.exports = { isValidDate, todayString, addDays, toInt, toText, toDate, toEnum, pagination, likeEscape };
