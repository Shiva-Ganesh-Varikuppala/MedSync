const { addDays } = require("./validate");

// Dose times (hour of day) for each "times per day" value.
const SLOT_HOURS = {
    1: [8],
    2: [8, 20],
    3: [8, 14, 20],
    4: [8, 12, 16, 20],
    5: [8, 11, 14, 17, 20],
    6: [8, 10, 12, 14, 16, 20]
};

const FREQUENCY_LABELS = {
    1: "Once daily",
    2: "Twice daily",
    3: "Three times daily",
    4: "Four times daily",
    5: "Five times daily",
    6: "Six times daily"
};

// Returns ["YYYY-MM-DD HH:00:00", ...] for every dose of a course.
function generateSchedule(startDate, frequencyPerDay, durationDays) {
    const hours = SLOT_HOURS[frequencyPerDay];
    if (!hours) throw new Error("frequencyPerDay must be 1-6");
    const out = [];
    for (let day = 0; day < durationDays; day++) {
        const date = addDays(startDate, day);
        for (const h of hours) out.push(`${date} ${String(h).padStart(2, "0")}:00:00`);
    }
    return out;
}

module.exports = { generateSchedule, FREQUENCY_LABELS, SLOT_HOURS };
