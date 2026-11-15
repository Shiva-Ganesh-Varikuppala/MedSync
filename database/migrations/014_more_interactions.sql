-- 014: more medicines and drug interactions, so the interaction checker has realistic things to find.
-- DEMONSTRATION DATA ONLY. The descriptions are short, simplified summaries of well-known interactions found in
-- public drug-label information. This is not a clinical database and must not be used for real patient care.
-- Safe to run twice: medicines are matched by name and strength, pairs in either order.

-- 1. Four common medicines whose interactions are well documented.
INSERT INTO medicines (name, generic_name, description, dosage_form, strength)
SELECT v.name, v.generic_name, v.description, v.dosage_form, v.strength
  FROM (
        SELECT 'Warfarin' AS name, 'Warfarin' AS generic_name, 'Anticoagulant ("blood thinner") used to prevent harmful clots.' AS description, 'Tablet' AS dosage_form, '5 mg' AS strength
  UNION ALL SELECT 'Aspirin', 'Acetylsalicylic acid', 'Low-dose antiplatelet medicine used to reduce the risk of heart attack and stroke.', 'Tablet', '75 mg'
  UNION ALL SELECT 'Clarithromycin', 'Clarithromycin', 'Macrolide antibiotic used for certain bacterial infections.', 'Tablet', '500 mg'
  UNION ALL SELECT 'Simvastatin', 'Simvastatin', 'Statin medicine used to lower cholesterol.', 'Tablet', '20 mg'
       ) v
 WHERE NOT EXISTS (SELECT 1 FROM medicines m WHERE m.name = v.name AND m.strength = v.strength);

-- 2. The interactions. Each pair is stored once (lower medicine id first); the checker finds it in either order.
INSERT INTO medicine_interactions (medicine_id_1, medicine_id_2, severity, description)
SELECT LEAST(a.medicine_id, b.medicine_id), GREATEST(a.medicine_id, b.medicine_id), v.severity, v.description
  FROM (
        SELECT 'Warfarin' AS n1, 'Aspirin' AS n2, 'SEVERE' AS severity, 'Both medicines reduce clotting. Together they markedly increase the risk of serious bleeding.' AS description
  UNION ALL SELECT 'Warfarin', 'Ibuprofen', 'SEVERE', 'NSAIDs such as ibuprofen increase the risk of stomach and other serious bleeding in people taking warfarin.'
  UNION ALL SELECT 'Simvastatin', 'Clarithromycin', 'SEVERE', 'Clarithromycin greatly raises simvastatin levels and the risk of serious muscle damage (rhabdomyolysis). Combination is generally avoided.'
  UNION ALL SELECT 'Warfarin', 'Azithromycin', 'MODERATE', 'Some antibiotics raise the effect of warfarin (INR). Monitor clotting tests closely.'
  UNION ALL SELECT 'Warfarin', 'Amoxicillin', 'MODERATE', 'Antibiotics can raise the effect of warfarin (INR). Monitor clotting tests during the course.'
  UNION ALL SELECT 'Warfarin', 'Paracetamol', 'MODERATE', 'Regular use of higher paracetamol doses can raise the effect of warfarin (INR). Monitor clotting tests.'
  UNION ALL SELECT 'Aspirin', 'Ibuprofen', 'MODERATE', 'Ibuprofen can reduce the heart-protective effect of low-dose aspirin, and both increase the risk of stomach bleeding.'
  UNION ALL SELECT 'Atorvastatin', 'Clarithromycin', 'MODERATE', 'Clarithromycin raises atorvastatin levels and the risk of muscle problems. Consider a lower statin dose or a pause during the course.'
  UNION ALL SELECT 'Atorvastatin', 'Azithromycin', 'MILD', 'Rarely, azithromycin may add to the risk of muscle side effects with statins. Ask the patient to report muscle pain.'
  UNION ALL SELECT 'Amlodipine', 'Simvastatin', 'MODERATE', 'Amlodipine raises simvastatin levels. The simvastatin dose should not exceed 20 mg daily with amlodipine.'
  UNION ALL SELECT 'Amlodipine', 'Clarithromycin', 'MODERATE', 'Clarithromycin can raise amlodipine levels and cause low blood pressure and swelling.'
  UNION ALL SELECT 'Ibuprofen', 'Amlodipine', 'MODERATE', 'NSAIDs can weaken the blood-pressure-lowering effect of amlodipine and strain the kidneys.'
  UNION ALL SELECT 'Ibuprofen', 'Metformin', 'MODERATE', 'NSAIDs can reduce kidney function, which can let metformin build up in the body. Review kidney function and hydration.'
  UNION ALL SELECT 'Omeprazole', 'Pantoprazole', 'MODERATE', 'Duplicate therapy: both are acid-reducing proton pump inhibitors. Together they add side effects without added benefit.'
       ) v
  JOIN medicines a ON a.name = v.n1
  JOIN medicines b ON b.name = v.n2
 WHERE NOT EXISTS (
        SELECT 1 FROM medicine_interactions i
         WHERE (i.medicine_id_1 = a.medicine_id AND i.medicine_id_2 = b.medicine_id)
            OR (i.medicine_id_1 = b.medicine_id AND i.medicine_id_2 = a.medicine_id)
       );
