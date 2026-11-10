# Attendance Management Portal

Static HTML/CSS/JS frontend + Vercel serverless API (`/api`) + MongoDB Atlas.

## Structure

```
index.html, style.css, app.js     frontend (fetch() calls to /api)
api/attendance/index.js           GET (list), POST (create)
api/attendance/[id].js            PUT / PATCH (update), DELETE
lib/db.js                         cached MongoDB connection (reads MONGODB_URI)
lib/validate.js                   input validation
.env.example                      environment variable template
```

Records are stored in the `attendance_records` collection of `LabAttendanceDB_Millar`
(created automatically on the first insert). Each record:
`{ date, studentName, subjectName, section, status, createdAt }`.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/attendance` | List records |
| POST | `/api/attendance` | Create a record |
| PUT / PATCH | `/api/attendance/:id` | Update a record |
| DELETE | `/api/attendance/:id` | Delete a record |

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
5. Deploy. If you add or change a variable later, redeploy.
6. Test add, edit and delete on the production URL.

## Submission

Create a `.txt` file with the live URL on the first line and the GitHub
repository URL on the second line, then attach it in MS Teams.
