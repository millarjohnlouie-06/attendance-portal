# Attendance Management Portal

Static HTML/CSS/JS frontend + Vercel serverless API (`/api`) + MongoDB Atlas.

## Structure

```
index.html, style.css, app.js     frontend (fetch() calls to /api)
api/attendance/index.js           GET (list), POST (create)
api/attendance/[id].js            PUT / PATCH (update), DELETE
api/attendance/bulk.js            POST (save a whole class sheet)
api/users/index.js                GET (list accounts), POST (create account), admin only
api/users/[id].js                 DELETE (remove an account), admin only
lib/db.js                         cached MongoDB connection (reads MONGODB_URI)
lib/validate.js                   input validation
lib/duplicates.js                 duplicate-record check
lib/users.js                      accounts: bcrypt hashing, validation, first-run admin setup
lib/auth.js                       login session (signed cookie) and role checks
api/session.js                    login (POST), session check (GET), logout (DELETE)
.env.example                      environment variable template
```

Records are stored in the `attendance_records` collection of `LabAttendanceDB_Millar`
(created automatically on the first insert). Each record:
`{ date, studentName, subjectName, section, status, createdAt, createdBy }`
(`updatedAt` and `updatedBy` are added when a record is edited).

Accounts are stored in the `users` collection:
`{ username, passwordHash, role, createdAt }`. Passwords are hashed with bcrypt and
never sent to the browser.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/attendance` | List records |
| POST | `/api/attendance` | Create a record |
| PUT / PATCH | `/api/attendance/:id` | Update a record |
| DELETE | `/api/attendance/:id` | Delete a record (admin only) |
| POST | `/api/attendance/bulk` | Save a class sheet (one date, subject and section, many students) |
| GET / POST / DELETE | `/api/session` | Check login, log in with `{ username, password }`, log out |
| GET / POST | `/api/users` | List accounts, create an account (admin only) |
| DELETE | `/api/users/:id` | Delete an account (admin only) |

All `/api/attendance` routes require login (a signed, HttpOnly session cookie).
Without `SESSION_SECRET` set, login is refused and no data is served.

## Accounts and roles

Every person logs in with their own username and password.

| Role | Can do |
|---|---|
| `teacher` | Add, edit and view records, save class sheets, view reports |
| `admin` | Everything a teacher can, plus delete records and manage accounts (Users tab) |

The role is read from the database on every request (not from the cookie), so deleting an
account or changing its role takes effect immediately. The server enforces the roles; the
buttons hidden in the browser are only a convenience.

**First run:** while no accounts exist, logging in as `admin` with the `ADMIN_PASSWORD`
environment variable creates the first admin account. After that, `ADMIN_PASSWORD` is no
longer used. Then open the **Users** tab to create accounts for teachers.

## Class sheet

The **Class sheet** tab marks a whole class at once. Choose a section, subject and date, then
**Load class list**: the roster is every student already recorded in that section. Set each
student's status, add new names (one per line), and press **Save sheet**.

Saving matches students by name, subject and date (ignoring capitals and extra spaces), so
saving the same sheet again updates the existing records instead of creating duplicates.

## Run locally (optional)

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `MONGODB_URI`
3. `npx vercel dev`

## Deploy

1. `git init`, commit, and push this folder to a GitHub repository.
   Make sure `.env` is not committed (it is listed in `.gitignore`).
2. In MongoDB Atlas, go to Network Access and allow `0.0.0.0/0`
   (Vercel uses changing IPs). Use a database user with `readWrite` on
   `LabAttendanceDB_Millar` only.
3. In Vercel, choose Add New > Project and import the GitHub repository.
4. Before deploying, open Environment Variables and add `MONGODB_URI`
   (your Atlas connection string, with the real username and password).
   Also add `SESSION_SECRET` (a random string of 32+ characters used to sign login
   sessions) and `ADMIN_PASSWORD` (used once, to create the first `admin` account).
5. Deploy. If you add or change a variable later, redeploy.
6. Log in as `admin` with `ADMIN_PASSWORD`, then test add, edit and delete on the
   production URL, and create a teacher account on the Users tab.

## Submission

Create a `.txt` file with the live URL on the first line and the GitHub
repository URL on the second line, then attach it in MS Teams.
