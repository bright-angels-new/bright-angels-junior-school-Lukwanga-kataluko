# Bright Angels Junior School website

## What is included
- Responsive public website using the school's red, royal-blue and white badge colours.
- Online admission application form with a passport-photo upload (JPEG/PNG/WebP, max 1 MB).
- D1 database storage for applications, messages, editable site content and announcements.
- Private administrator dashboard with secure signed session cookie.
- Contact/feedback form.
- Optional email notifications through Resend.

## Important setup before launch
1. In Cloudflare, open the D1 database named `bright-angels-junior-school-db`, select **Console**, and run the entire `schema.sql` file.
2. In Cloudflare Pages, connect the GitHub repository `bright-angels-new/bright-angels-junior-school-lukwanga` (or the repository you choose).
3. Set the build output directory to `public`. There is no build command required. Keep the `functions` folder at the repository root.
4. In Pages project **Settings → Variables and Secrets**, add these secrets:
   - `ADMIN_EMAIL` = `brightangels26@gmail.com`
   - `ADMIN_PASSWORD` = a new, unique password chosen by the school. Do not use the password shared in the chat.
   - `SESSION_SECRET` = a long random secret (at least 32 characters).
   - `RESEND_API_KEY` = API key from Resend (needed for email notifications).
   - `EMAIL_FROM` = a verified sender address/domain in Resend, for example `Bright Angels <website@your-verified-domain.example>`. Replace this example with a sender Resend has verified.
5. Confirm the D1 binding is named `DB` and points to `bright-angels-junior-school-db`.
6. Deploy, then test a sample admission, feedback message, admin login, content edit and announcement.
7. In Resend, verify the sender domain/address. Until the email API key and verified sender are configured, submissions are saved to D1 but email notifications cannot be delivered.

## Admin
Open `/admin.html`. Login with the school email and the `ADMIN_PASSWORD` secret configured in Cloudflare.

## Privacy and security notes
- The password is never embedded in browser code.
- Admin sessions are signed using `SESSION_SECRET`, expire after 8 hours and use HttpOnly cookies.
- The application form limits uploaded photo size to 1 MB and stores the image in D1 to avoid requiring a paid R2 bucket. Keep backups and review storage limits as submissions grow.
- Add a school privacy notice and retention policy before collecting children's personal information. Limit dashboard access to authorized school staff.
- This is a deployable starter implementation, but no cloud deployment can be completed or verified from this package alone. Run the test checklist after connecting the Cloudflare and email settings.
