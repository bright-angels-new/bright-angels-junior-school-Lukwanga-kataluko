import { json, bodyJSON, clean, notifySchool } from "../_shared.js";

function validEmail(s) {
return !s || /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(s);
}

export async function onRequestPost({ request, env }) {
const d = await bodyJSON(request);

if (!d) {
return json({ error: "Please submit a valid form." }, 400);
}

const child = clean(d.child_name, 120);
const cls = clean(d.class_applied || d.class_applying, 40);
const parent = clean(d.parent_name || d.guardian_name, 120);
const phone = clean(d.phone, 30);
const email = clean(d.email || d.guardian_email, 160);

const allowed = [
"Baby Class", "Middle Class", "Top Class",
"Primary 1", "Primary 2", "Primary 3",
"Primary 4", "Primary 5"
];

if (!child || !cls || !parent || !phone) {
return json({ error: "Please complete the required fields." }, 400);
}

if (!allowed.includes(cls)) {
return json({ error: "Please select a valid class." }, 400);
}

if (!validEmail(email)) {
return json({ error: "Please enter a valid email address." }, 400);
}

const reference =
"BAJS-" +
Date.now().toString(36).toUpperCase() +
"-" +
crypto.randomUUID().slice(0, 6).toUpperCase();

try {
await env.DB.prepare("INSERT INTO applications ( reference, child_name, dob, gender, class_applying, previous_school, guardian_name, relationship, phone, guardian_email, district, address, notes, passport_key ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
reference,
child,
clean(d.date_of_birth || d.dob, 20) || null,
clean(d.gender, 30) || null,
cls,
clean(d.previous_school, 160) || null,
parent,
clean(d.relationship, 40) || null,
phone,
email || null,
clean(d.district, 120) || "Wakiso",
clean(d.address, 240) || null,
clean(d.medical_notes || d.notes, 1000) || null,
""
).run();
} catch (error) {
console.error("Application save failed:", error);

return json({
  error: "We could not save your application. Please try again or contact the school."
}, 500);

}

let emailNotification = "not_configured";

try {
const mail = await notifySchool(
env,
"New admission application: ${child}",
`A new admission application has been received.

Reference: ${reference}
Child: ${child}
Class: ${cls}
Parent/guardian: ${parent}
Phone: ${phone}
Email: ${email || "Not provided"}

Please sign in to the school admin dashboard to review the application.`
);

if (mail && mail.sent) {
  emailNotification = "sent";
}

} catch (error) {
console.error("Admission email notification failed:", error);
}

return json({
message: "Application saved successfully. Reference: " + reference,
reference,
emailNotification
}, 201);
}
