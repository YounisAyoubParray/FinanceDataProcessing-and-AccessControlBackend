# Finance Assignment App

A role-based finance tracking web app built with Node.js, Express, PostgreSQL, JWT auth, and EJS.

## Features

- User registration and login
- Password hashing with bcrypt
- JWT-based authentication
- Role-based access control (`viewer`, `analyst`, `admin`)
- Create and list financial records
- Dashboard totals (income, expense, net)
- Admin-only user listing and delete operations
- Basic API rate limiting

## Tech Stack

- Backend: Node.js, Express
- Database: PostgreSQL (`pg`)
- Authentication: `jsonwebtoken`, `bcrypt`, cookie + Bearer token support
- Templating: EJS
- Frontend: Plain HTML + client-side JavaScript

## Project Structure

- `server.js`: Main backend server, middleware, auth, and API routes
- `public/index.html`: Landing page
- `public/register.html`: User registration page
- `public/login.html`: Login page
- `public/main.js`: Frontend logic for auth, records, dashboard, admin actions
- `views/dashboard.ejs`: Dashboard page rendered after login

## How the Code Works

### 1) Server setup

`server.js` initializes Express, JSON/form parsing, static files, cookies, and request rate limiting.

### 2) Database connection

A PostgreSQL connection pool is created from environment variables:

- `PG_USER`
- `PG_HOST`
- `PG_DATABASE`
- `PG_PASSWORD`
- `PG_PORT`

### 3) Authentication and authorization

- `authenticateJWT` middleware:
  - reads token from `Authorization: Bearer <token>` or `token` cookie
  - verifies token with `JWT_SECRET`
  - attaches user payload to `req.user`
- `authorizeAdmin` middleware:
  - allows access only when `req.user.role === "admin"`

### 4) Main routes

- `POST /auth/register`: create new user with hashed password
- `POST /auth/login`: validate credentials, return JWT, set cookie
- `POST /records`: create record for authenticated user
- `GET /dashboard`: render EJS dashboard
- `GET /api/dashboard`: return records + summary totals
- `GET /admin/users`: admin-only list of users
- `DELETE /admin/records/:id`: admin-only delete record
- `DELETE /admin/users/:id`: admin-only delete user (also deletes their records)

### 5) Frontend flow

`public/main.js`:

- handles register/login form submission
- loads dashboard data from `/api/dashboard`
- submits record creation form
- supports admin controls (load users, delete record, delete user)

## User Roles

- `viewer`:
  - can log in
  - can create and view only personal records
  - dashboard totals are personal
- `analyst`:
  - can log in
  - can view overall dashboard records/totals
  - no admin delete/list users endpoints
- `admin`:
  - full analyst access
  - can view all users
  - can delete any record
  - can delete users (cannot delete own account)

## Database Schema

Below is a suggested schema matching the queries used in `server.js`.

### `users` table

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('viewer', 'analyst', 'admin'))
);
```

### `records` table

```sql
CREATE TABLE records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
  category VARCHAR(100),
  notes TEXT,
  date TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
PG_USER=your_pg_user
PG_HOST=localhost
PG_DATABASE=your_database_name
PG_PASSWORD=your_pg_password
PG_PORT=5432
JWT_SECRET=your_strong_secret
NODE_ENV=development
```

## Run the Project

Install dependencies:

```
npm install
```

Run in development:

```
npm run dev
```

Run in production mode:

```
npm start
```

Open:

- `http://localhost:3000`

