# Pickel Lab Toolkits

Pickel Lab Toolkits is a lightweight internal web application for shared lab scheduling and coordination. It currently provides three main tools:

1. **Equipment Schedule** — reserve shared equipment and prevent overlapping reservations.
2. **Weekly Availability** — collect recurring Monday–Friday availability from group members and view aggregate availability.
3. **Meeting Schedule** — display the lab's shared Outlook calendar in week or month view, including recurring events and time-zone conversion.

The application is intentionally simple: the frontend is plain HTML, CSS, and JavaScript; Vercel hosts the site and runs the serverless API routes; Supabase stores equipment reservations and weekly availability; and the meeting calendar is read from an Outlook-published ICS feed.

This README is written as a maintenance handoff. A future lab member should be able to use it to understand where data comes from, how authentication works, what must be configured in Vercel, and which files to edit for each feature.

---

## 1. High-level architecture

```text
Browser
  |
  |-- index.html / home.js
  |      |-- shared access-code login
  |      |-- Google reCAPTCHA v2
  |      `-- receives 90-day signed session cookie
  |
  |-- equipment-schedule.html / app.js
  |      `-- /api/reservations --> Supabase reservations table
  |
  |-- availability.html / availability.js
  |      `-- /api/availability --> Supabase availability_slots table
  |
  |-- meeting-schedule.html / meeting-schedule.js
  |      `-- /api/meetings --> Outlook ICS calendar
  |
  `-- site-shell.js
         |-- shared site banner/navigation
         |-- shared footer
         `-- desktop.css loading

Vercel Functions
  |
  |-- /api/auth
  |      |-- validates Google reCAPTCHA
  |      |-- checks shared lab access code
  |      `-- creates/verifies signed session cookie
  |
  |-- /api/reservations
  |      `-- reads/writes Supabase reservations
  |
  |-- /api/availability
  |      `-- reads/writes Supabase availability_slots
  |
  `-- /api/meetings
         `-- downloads and expands Outlook ICS events
```

There is no frontend framework and no build step for the client-side code. Vercel serves the static files directly and treats files under `api/` as serverless functions.

---

## 2. Technology stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Hosting / serverless backend:** Vercel
- **Database:** Supabase
- **Authentication:** shared access code + Google reCAPTCHA v2 + signed HttpOnly cookie
- **Meeting calendar source:** Outlook / Microsoft 365 published ICS feed
- **ICS recurrence expansion:** `ical-expander`
- **Supabase client:** `@supabase/supabase-js`

Node dependencies are defined in `package.json`.

---

## 3. Repository structure

```text
/
├── api/
│   ├── auth.js                  # Login, reCAPTCHA verification, session cookie
│   ├── reservations.js          # Equipment reservation API
│   ├── availability.js          # Weekly availability API
│   └── meetings.js              # Outlook ICS calendar API
│
├── index.html                   # Login page + authenticated home page
├── home.js                      # Login/session/reCAPTCHA frontend logic
├── auth-guard.js                # Protects authenticated pages
│
├── equipment-schedule.html      # Equipment Schedule page
├── app.js                       # Equipment Schedule frontend logic
│
├── availability.html            # Weekly Availability page
├── availability.js              # Weekly Availability frontend logic
├── availability-timezone-labels.js
│                                 # Presentation layer for availability TZ labels
│
├── meeting-schedule.html        # Meeting Schedule page
├── meeting-schedule.js          # Week/month calendar, event details, time zones
│
├── site.css                     # Main shared stylesheet
├── site-shell.css               # Shared banner/footer + meeting shell styles
├── desktop.css                  # Larger desktop typography / reduced whitespace
├── recaptcha.css                # reCAPTCHA login layout
├── site-shell.js                # Shared navigation + footer web components
│
├── package.json                 # Server dependencies
└── README.md                    # This document
```

### Shared shell

`site-shell.js` defines two custom elements used across the authenticated site:

```html
<pickel-site-banner></pickel-site-banner>
<pickel-site-footer></pickel-site-footer>
```

The banner contains the site name, navigation between tools, active-page highlighting, and the **Forget device** button. The footer contains the developer credit and displayed version.

If the site name, navigation labels, or displayed version need to change, start with `site-shell.js`.

---

## 4. Required Vercel environment variables

The production deployment depends on the following environment variables.

| Variable | Purpose | Secret? |
|---|---|---|
| `SUPABASE_URL` | Supabase project URL used by reservation and availability APIs | No, but keep server-side for consistency |
| `SUPABASE_SECRET_KEY` | Server-side Supabase key with permission to read/write required tables | **Yes** |
| `LAB_ACCESS_CODE` | Shared access code entered by lab members | **Yes** |
| `SESSION_SECRET` | HMAC secret used to sign authentication cookies | **Yes** |
| `MEETING_ICS_URL` | Published Outlook/Microsoft 365 ICS calendar URL | Treat as private |
| `RECAPTCHA_SITE_KEY` | Google reCAPTCHA v2 site key | No |
| `RECAPTCHA_SECRET_KEY` | Google reCAPTCHA v2 server verification key | **Yes** |

Configure these in:

**Vercel Project → Settings → Environment Variables**

After changing an environment variable, redeploy the production deployment so the serverless functions receive the new value.

### Important secret-handling rule

Never place `SUPABASE_SECRET_KEY`, `LAB_ACCESS_CODE`, `SESSION_SECRET`, `MEETING_ICS_URL`, or `RECAPTCHA_SECRET_KEY` directly in browser JavaScript or commit them to GitHub.

---

## 5. Authentication and session flow

Authentication is handled by `api/auth.js`, while `home.js` controls the login UI.

### Login sequence

1. The user opens `/`.
2. `home.js` calls `GET /api/auth` to check for an existing session.
3. If no valid session exists, the login page is shown.
4. Google reCAPTCHA v2 is loaded and rendered.
5. The user enters the shared lab access code and completes reCAPTCHA.
6. `home.js` sends:

```json
{
  "accessCode": "...",
  "recaptchaToken": "..."
}
```

   to `POST /api/auth`.
7. The server verifies the reCAPTCHA token with Google.
8. The server compares the submitted access code with `LAB_ACCESS_CODE` using a timing-safe comparison.
9. On success, the server issues the `pickel_lab_session` cookie.

### Session cookie

The session cookie is:

- signed with HMAC-SHA256 using `SESSION_SECRET`
- valid for **90 days**
- `HttpOnly`
- `Secure`
- `SameSite=None`
- available for the full site (`Path=/`)

`SameSite=None` is intentional because the site may be used inside Microsoft Teams or another embedded browser context.

### Protected pages

`equipment-schedule.html`, `availability.html`, and `meeting-schedule.html` load `auth-guard.js`.

`auth-guard.js` calls `GET /api/auth`. If the session is invalid, the user is redirected to the home page with a `return` query parameter so the original page can be reopened after login.

### Forget device

The shared banner's **Forget device** button sends `DELETE /api/auth`, which expires the session cookie and returns the browser to `/`.

---

## 6. Google reCAPTCHA

The login page uses **Google reCAPTCHA v2 Checkbox**.

The Google reCAPTCHA project must contain the production hostname(s) used by this application. If a new custom domain is added later, add that domain in the Google reCAPTCHA Admin Console as well.

The frontend dynamically loads Google's reCAPTCHA JavaScript. If the primary Google host cannot initialize, the loader also attempts the `recaptcha.net` endpoint.

### Common reCAPTCHA failure causes

If the login page says that human verification could not load:

1. Check that both `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` exist in Vercel.
2. Redeploy after adding/changing the keys.
3. Confirm the deployed hostname is allowed in the reCAPTCHA configuration.
4. Check the browser developer console and Network tab for blocked Google requests.
5. Test without an ad blocker, privacy extension, or restrictive institutional network.
6. Confirm that the site key is for reCAPTCHA v2 Checkbox, not a different reCAPTCHA product/configuration.

Existing valid 90-day sessions do not need to complete reCAPTCHA again until the session expires or the user chooses **Forget device**.

---

## 7. Equipment Schedule

### User-facing behavior

The Equipment Schedule allows users to reserve three shared resources:

- ETC 1.204D
- ETC 1.204E
- ETC 1.204F

The schedule covers **7:00 AM–11:00 PM** using **15-minute increments**.

Users can create, edit, and delete reservations. The server prevents overlapping reservations for the same resource.

### Frontend files

- `equipment-schedule.html`
- `app.js`

### Backend

- `api/reservations.js`

Supported methods:

- `GET` — retrieve reservations for a date range
- `POST` — create reservation
- `PUT` — update reservation
- `DELETE` — delete reservation

All methods require a valid authentication cookie.

### Supabase table: `reservations`

The API expects at least the following columns:

| Column | Purpose |
|---|---|
| `id` | Reservation primary key |
| `resource_id` | Resource identifier; currently 1, 2, or 3 |
| `person_name` | Name entered by the user |
| `title` | Reservation description/title |
| `start_time` | ISO timestamp |
| `end_time` | ISO timestamp |
| `created_at` | Creation timestamp |

The API validates resource IDs, time boundaries, minimum reservation duration, text lengths, and overlap conflicts.

### Changing equipment names

The user-visible equipment names live in the frontend configuration in `app.js`. If equipment is added or removed, also update `VALID_RESOURCE_IDS` in `api/reservations.js` so the server accepts the new IDs.

Do not only change the frontend; server-side validation must stay in sync.

---

## 8. Weekly Availability

### User-facing behavior

Weekly Availability collects recurring group availability for:

- Monday–Friday
- 9:00 AM–5:00 PM Central Time as the stored base schedule
- 30-minute intervals

Statuses are:

- **Green** — Fully available
- **Yellow** — Prefer not
- **Red** — Conflict
- **Empty** — No response

A user selects or adds their name, paints availability by dragging across cells, and saves the result. The **All members** view combines submissions and shows how many people are available in each slot. Clicking an aggregate slot opens member-level details.

### Frontend files

- `availability.html`
- `availability.js`
- `availability-timezone-labels.js`

### Backend

- `api/availability.js`

Supported methods:

- `GET` — return all stored availability rows, member names, and last-updated timestamps
- `POST` — replace one member's complete availability submission

### Supabase table: `availability_slots`

The API expects at least:

| Column | Purpose |
|---|---|
| `person_name` | Member name |
| `weekday` | 1–5 for Monday–Friday |
| `slot_index` | 0–15 for the sixteen 30-minute intervals |
| `status` | `green`, `yellow`, or `red` |
| `updated_at` | Timestamp of last save |

When a member saves, the API deletes that member's existing rows and inserts the current selection. Consequently, clearing all cells and saving removes that member's stored rows entirely.

### Time-zone behavior

The underlying schedule remains Central Time. The frontend converts displayed times for the selected zone using browser `Intl.DateTimeFormat`, so daylight-saving offsets are handled by the browser.

The interface currently presents the U.S. zones as:

- US Eastern Time
- US Central Time
- US Mountain Time
- US Pacific Time

`availability-timezone-labels.js` keeps the presentation consistent with the Meeting Schedule and removes short labels such as `CDT` and `EDT` from user-facing text.

If the stored schedule itself must change from 9:00 AM–5:00 PM or from Central Time, update both the frontend constants and the server validation logic. This is different from merely adding another display time zone.

---

## 9. Meeting Schedule

### Data source

Meeting Schedule does not store meetings in Supabase. It reads the ICS URL stored in `MEETING_ICS_URL`.

The typical source is a published Outlook/Microsoft 365 shared calendar.

### Request flow

1. `meeting-schedule.js` calculates the required visible date range.
2. It calls `GET /api/meetings?start=...&end=...`.
3. `api/meetings.js` downloads the ICS feed server-side.
4. `ical-expander` expands recurring events for the requested range.
5. The API normalizes the events and returns JSON to the browser.
6. The frontend groups events by the currently selected display time zone.

The browser never needs direct access to the Outlook ICS URL.

### Views

- **Week view** — Sunday through Saturday
- **Month view** — Sunday-first calendar grid, including adjacent-month filler days

Calendar refresh is **manual** rather than periodic. Data is loaded when the page opens, when the user navigates to another week/month, when the view changes, or when **Refresh** is clicked.

### Meeting details

Meeting cards and month-view event chips are clickable. The details dialog can display:

- title
- date/time
- selected display time zone
- location
- recurrence status
- description, when available in the ICS feed

### Supported time-zone references

The Meeting Schedule currently includes:

**United States**

- US Eastern Time
- US Central Time
- US Mountain Time
- US Pacific Time

**Global city references**

- London
- Paris
- Dubai
- New Delhi
- Singapore
- Shanghai
- Tokyo
- Sydney

The code uses IANA time-zone identifiers such as `America/Chicago`, `Europe/London`, and `Asia/Tokyo`, allowing the browser to apply daylight-saving rules where applicable.

### Important filename

The Vercel function must be named:

```text
api/meetings.js
```

Vercel maps the filename directly to `/api/meetings`. Renaming it to `meeting.js` changes the route and causes `/api/meetings` requests to return 404.

---

## 10. Styling and responsive layout

The styling is split across several files:

- `site.css` — original/shared application styles and tool layouts
- `site-shell.css` — site-wide banner/footer and Meeting Schedule shell styles
- `desktop.css` — desktop-only typography and spacing overrides
- `recaptcha.css` — reCAPTCHA layout on the login card

`site-shell.js` automatically adds `desktop.css` to pages that use the shared shell.

The desktop overrides intentionally:

- increase font sizes for readability
- reduce excessive outside whitespace
- allow wider use of large monitors

Mobile-specific rules remain in the shared styles. Any large layout change should be tested both in a normal desktop browser and inside Microsoft Teams, because Teams can provide a narrower embedded viewport than a standalone browser.

---

## 11. Deployment workflow

The normal production workflow is:

```text
Edit code
  ↓
Commit / push to main
  ↓
Vercel detects the GitHub commit
  ↓
Vercel builds/deploys automatically
  ↓
Test the newest Production deployment
```

If multiple commits are pushed in quick succession, Vercel may create several deployments. Test the most recent deployment associated with the latest `main` commit.

### Cache-busting

Static CSS and JavaScript references use query strings such as:

```text
/site.css?v=1.1
/home.js?v=1.1-recaptcha
```

When a user appears to be loading stale JavaScript/CSS after a deployment, increment the query-string version or perform a hard refresh (`Ctrl+Shift+R`).

---

## 12. Local development

Because this project relies on Vercel Functions, the easiest local environment is the Vercel CLI rather than opening the HTML files directly.

Typical workflow:

```bash
npm install
npx vercel dev
```

The required environment variables must also be available locally. Do not create a committed `.env` containing production secrets.

A direct static-file server can display the frontend, but API-dependent features will not work correctly without the `/api/*` functions.

---

## 13. Maintenance checklist

When taking ownership of this project, verify access to:

- this GitHub repository
- the Vercel project
- the Supabase project
- the Outlook/Microsoft 365 calendar that publishes the ICS feed
- the Google reCAPTCHA configuration

Then verify that the current production deployment has all required Vercel environment variables.

Before making a major change:

1. Confirm the current `main` branch is deployed successfully.
2. Do not expose server environment variables in frontend JavaScript.
3. Keep frontend and backend validation consistent.
4. Test authentication in a clean/private browser session.
5. Test Equipment Schedule create/edit/delete and overlap rejection.
6. Test Weekly Availability both as an individual and in **All members** mode.
7. Test Meeting Schedule week/month views, several time zones, and event details.
8. Test both desktop and a narrow/Teams-like viewport.

---

## 14. Troubleshooting guide

### Login works on one device but not another

The working device may still have a valid 90-day session cookie. Test in a private/incognito window to exercise the complete login flow.

### `Human verification is not configured.`

One or both of these Vercel variables are missing:

```text
RECAPTCHA_SITE_KEY
RECAPTCHA_SECRET_KEY
```

Add them and redeploy.

### `Could not load human verification.`

The keys may exist, but the browser could not initialize Google's reCAPTCHA script. Check hostname configuration, network requests, browser extensions, content blockers, and the Google reCAPTCHA project type.

### A protected API returns `401 Authentication required.`

The session cookie is absent, expired, rejected by the browser, or was signed using a different `SESSION_SECRET`.

If `SESSION_SECRET` is changed, all existing sessions become invalid and everyone must log in again.

### Reservation API returns a configuration error

Check:

```text
SUPABASE_URL
SUPABASE_SECRET_KEY
SESSION_SECRET
```

Also confirm the `reservations` table still has the columns expected by `api/reservations.js`.

### Weekly Availability cannot load or save

Check the same Supabase variables and verify the `availability_slots` schema.

### Meeting Schedule returns 404

Confirm the file is exactly `api/meetings.js` and the frontend calls `/api/meetings`.

### Meeting Schedule says the calendar is not configured

`MEETING_ICS_URL` is missing in Vercel.

### Meeting Schedule returns an invalid calendar/upstream error

Open the published Outlook ICS URL separately and confirm it still exists and returns a calendar. Publishing settings or calendar ownership changes can invalidate the URL.

### Styling appears outdated after deployment

Perform a hard browser refresh and check the static-file version query strings.

---

## 15. Security notes

This application is an internal coordination tool, not an identity-management system.

The current security model is based on a shared lab access code plus reCAPTCHA, followed by a signed 90-day session cookie. Individual actions are not tied to authenticated user identities; for example, names in Equipment Schedule and Weekly Availability are user-entered values.

If the application eventually stores sensitive information or requires individual accountability, replace the shared access-code model with institutional SSO or another per-user authentication system.

Other important rules:

- Never expose the Supabase server secret to the browser.
- Never commit the shared access code or `SESSION_SECRET`.
- Keep the Outlook ICS URL server-side.
- Use a strong, random `SESSION_SECRET`.
- ReCAPTCHA reduces automated login abuse but is not a substitute for proper authorization.

---

## 16. Versioning

The displayed site version is currently maintained in `site-shell.js`:

```js
const PICKEL_SITE_VERSION = "v1.1";
```

The npm package version is maintained separately in `package.json`.

When releasing a meaningful update, it is good practice to update both if the version is intended to represent the overall application release.

---

## 17. Current ownership handoff

This project was developed for Pickel Lab as an internal utility. Future maintainers should treat this repository, Vercel configuration, Supabase data, Outlook calendar publication settings, and Google reCAPTCHA account/configuration as one system: losing access to any one of those services may break part of the website even if the GitHub code itself is unchanged.

When ownership changes, transfer administrative access to those external services before the previous maintainer leaves the group.
