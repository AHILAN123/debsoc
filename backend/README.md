# DebSoc Backend — Setup Guide

Backend for the Debating Society of IIEST Shibpur website.
Provides admin authentication, gallery management, tribunal management, and events management.

---

## Tech Stack
- **Node.js + Express** — server
- **SQLite (better-sqlite3)** — database (zero config, single file)
- **JWT** — admin authentication
- **Multer** — file uploads
- **bcryptjs** — password hashing

---

## Quick Start

### 1. Install dependencies

```bash
cd debsoc-backend
npm install
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=3001
JWT_SECRET=some_very_long_random_secret_at_least_32_characters
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://debsociiests.in
```

### 3. Set admin credentials

Edit `scripts/setup-admins.js` — change the `ADMINS` array:

```js
const ADMINS = [
  { userId: 'admin_anurag',   password: 'StrongPassword1!', name: 'Anurag Singh' },
  { userId: 'admin_karan',    password: 'StrongPassword2!', name: 'Karan Mandal' },
  // ... up to 5 admins
];
```

Then run the setup:
```bash
npm run setup
```

This creates the SQLite database and seeds the 5 admin accounts.
**You only need to run this once.**

### 4. Start the server

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Server runs at `http://localhost:3001`
Admin dashboard at `http://localhost:3001/admin`

---

## Admin Dashboard

Open `http://localhost:3001/admin` in your browser.

Log in with any of the 5 admin User IDs and passwords you set above.

From the dashboard you can:
- **Gallery** — upload photos (9 per page, automatic pagination), delete photos
- **Tribunals** — upload new issues (PDF + cover image), delete old ones
- **Events** — add/edit/delete event blocks (name, date, time, venue, photo, PDF)

---

## Connecting your frontend

### 1. Copy `api-client.js` to your website root

```bash
cp public/api-client.js /path/to/your/website/api-client.js
```

### 2. Update the API_BASE URL in `api-client.js`

```js
const API_BASE = 'https://your-backend-url.com'; // Change this!
```

### 3. Update your HTML pages

#### `gallery.html`
- Add `id="gallery-grid"` to the gallery grid div
- Add `id="gallery-pagination"` where you want page links
- Add `<script src="api-client.js"></script>` before `</body>`
- Remove the hardcoded `<img>` tags inside the grid

```html
<!-- Replace your hardcoded grid with: -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8" id="gallery-grid">
  <!-- Photos load dynamically -->
</div>
<div id="gallery-pagination"></div>
```

#### `tribunal.html`
- Add `id="tribunals-grid"` to the grid container
- Remove hardcoded tribunal cards

```html
<!-- Replace your hardcoded grid with: -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-12 text-center" id="tribunals-grid">
  <!-- Tribunals load dynamically -->
</div>
```

#### `events.html`
- Replace the maintenance section with an events container:

```html
<section class="relative px-6 py-20 bg-[#FAF7F2]">
  <div class="max-w-5xl mx-auto">
    <h1 class="font-display text-5xl text-[#800020] mb-12 text-center">Events</h1>
    <div id="events-blocks">
      <!-- Events load dynamically -->
    </div>
  </div>
</section>
```

---

## API Endpoints

### Public (no auth required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gallery?page=1` | Get 9 gallery photos for page |
| GET | `/api/gallery/all-pages` | Get total pages count |
| GET | `/api/tribunals` | Get all tribunal issues |
| GET | `/api/events` | Get all event blocks |

### Admin (JWT required — Authorization: Bearer <token>)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/auth/me` | Verify token |
| POST | `/api/gallery` | Upload photos (multipart) |
| DELETE | `/api/gallery/:id` | Delete a photo |
| POST | `/api/tribunals` | Upload tribunal issue |
| PUT | `/api/tribunals/:id` | Update tribunal metadata |
| DELETE | `/api/tribunals/:id` | Delete tribunal |
| POST | `/api/events` | Create event block |
| PUT | `/api/events/:id` | Update event block |
| DELETE | `/api/events/:id` | Delete event block |

---

## Deployment

### Option A: Railway / Render / Fly.io (Recommended)
These platforms support Node.js apps with persistent storage.

1. Push this backend folder to a separate GitHub repo
2. Connect to Railway/Render
3. Set environment variables (PORT, JWT_SECRET, FRONTEND_URL)
4. Run `npm run setup` once via the platform's shell

### Option B: VPS (DigitalOcean, AWS EC2, etc.)
```bash
npm install -g pm2
pm2 start server.js --name debsoc-backend
pm2 save
pm2 startup
```

### Important: File persistence
Uploaded files are stored in `uploads/`. On cloud platforms, ensure you have a persistent disk or migrate to a storage service like Cloudinary or AWS S3 for production.

---

## File Structure

```
debsoc-backend/
├── server.js              # Main Express app
├── .env.example           # Environment variables template
├── package.json
├── db/
│   └── database.js        # SQLite schema + connection
├── middleware/
│   ├── auth.js            # JWT middleware
│   └── upload.js          # Multer config
├── routes/
│   ├── auth.js            # Login, /me
│   ├── gallery.js         # Gallery CRUD
│   ├── tribunals.js       # Tribunal CRUD
│   └── events.js          # Events CRUD
├── scripts/
│   └── setup-admins.js    # Seed admin accounts
├── uploads/               # Uploaded files (auto-created)
│   ├── gallery/
│   ├── tribunals/
│   └── events/
└── public/
    ├── admin/
    │   └── index.html     # Admin dashboard UI
    └── api-client.js      # Frontend integration script
```
