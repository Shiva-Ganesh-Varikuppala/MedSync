const pool = require("../config/database");
const { badRequest } = require("../utils/httpError");
const { likeEscape, pagination, toText } = require("../utils/validate");

const perCategory = async (sql, params) => (await pool.execute(sql, params))[0];
async function search(user, query) {
  const q = toText(query.q, "q", { min: 2, max: 100 });
  const { limit, page } = pagination(query, { defaultLimit: 8, maxLimit: 20 });
  const like = `%${likeEscape(q)}%`; const results = [];
  const add = (category, rows) => rows.forEach(row => results.push({ category, ...row }));
  if (user.role === "DOCTOR") {
    add("patients", await perCategory("SELECT p.patient_id AS id,u.name AS title,CONCAT('Patient #',p.patient_id,' · ',u.email) AS subtitle FROM patients p JOIN users u ON u.user_id=p.user_id WHERE u.name LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' OR u.phone LIKE ? ESCAPE '\\\\' OR CAST(p.patient_id AS CHAR) LIKE ? LIMIT ?", [like,like,like,like,limit]));
    add("prescriptions", await perCategory("SELECT pr.prescription_id AS id,pr.diagnosis AS title,CONCAT(pu.name,' · ',pr.prescription_date) AS subtitle FROM prescriptions pr JOIN patients p ON p.patient_id=pr.patient_id JOIN users pu ON pu.user_id=p.user_id WHERE pr.doctor_id=? AND (pu.name LIKE ? ESCAPE '\\\\' OR pr.diagnosis LIKE ? ESCAPE '\\\\' OR CAST(pr.prescription_id AS CHAR) LIKE ?) LIMIT ?", [user.doctorId,like,like,like,limit]));
  }
  if (user.role === "PATIENT") add("prescriptions", await perCategory("SELECT prescription_id AS id,diagnosis AS title,CONCAT('Date: ',prescription_date) AS subtitle FROM prescriptions WHERE patient_id=? AND (diagnosis LIKE ? ESCAPE '\\\\' OR CAST(prescription_id AS CHAR) LIKE ?) LIMIT ?", [user.patientId,like,like,limit]));
  if (user.role !== "PATIENT") add("doctors", await perCategory("SELECT d.doctor_id AS id,CONCAT('Dr. ',u.name) AS title,d.specialization AS subtitle FROM doctors d JOIN users u ON u.user_id=d.user_id WHERE u.name LIKE ? ESCAPE '\\\\' OR d.specialization LIKE ? ESCAPE '\\\\' OR u.email LIKE ? ESCAPE '\\\\' LIMIT ?", [like,like,like,limit]));
  add("medicines", await perCategory("SELECT medicine_id AS id,name AS title,CONCAT(generic_name,' · ',strength) AS subtitle FROM medicines WHERE is_active=1 AND (name LIKE ? ESCAPE '\\\\' OR generic_name LIKE ? ESCAPE '\\\\' OR CAST(medicine_id AS CHAR) LIKE ?) LIMIT ?", [like,like,like,limit]));
  if (user.role === "PHARMACY_STAFF") add("inventory", await perCategory("SELECT b.batch_id AS id,m.name AS title,CONCAT(b.batch_number,' · ',b.quantity,' units') AS subtitle FROM medicine_batches b JOIN medicines m ON m.medicine_id=b.medicine_id WHERE b.pharmacy_id=? AND (m.name LIKE ? ESCAPE '\\\\' OR b.batch_number LIKE ? ESCAPE '\\\\') LIMIT ?", [user.pharmacyId,like,like,limit]));
  if (user.role === "ADMIN") add("users", await perCategory("SELECT user_id AS id,name AS title,CONCAT(email,' · ',role) AS subtitle FROM users WHERE name LIKE ? ESCAPE '\\\\' OR email LIKE ? ESCAPE '\\\\' OR phone LIKE ? ESCAPE '\\\\' OR CAST(user_id AS CHAR) LIKE ? LIMIT ?", [like,like,like,like,limit]));
  const labels = { patients: "Patients", doctors: "Doctors", medicines: "Medicines", prescriptions: "Prescriptions", inventory: "Inventory", users: "Users" };
  const tabs = { patients: "patients", doctors: "patients", medicines: user.role === "PHARMACY_STAFF" ? "catalog" : "medicines", prescriptions: "prescriptions", inventory: "inventory", users: "users" };
  const grouped = Object.entries(results.reduce((all, item) => { (all[item.category] ||= []).push({ type: item.category, id: item.id, title: item.title, subtitle: item.subtitle, tab: tabs[item.category] }); return all; }, {})).map(([category, items]) => ({ group: labels[category], items }));
  grouped.meta = { query: q, page, limit, total: results.length };
  return grouped;
}
module.exports = { search };
