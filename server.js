import express from "express";
import path from "path";
import bodyParser from "body-parser";
import pg from "pg";
import cookieParser from 'cookie-parser';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";

dotenv.config();



const app = express();
const port = process.env.PORT;
const saltRounds = 10;
const JWT_SECRET = process.env.JWT_SECRET;
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	limit: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes).
	standardHeaders: 'draft-8', // draft-6: `RateLimit-*` headers; draft-7 & draft-8: combined `RateLimit` header
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
	ipv6Subnet: 56, // Set to 60 or 64 to be less aggressive, or 52 or 48 to be more aggressive
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));
app.use(cookieParser());
app.use(limiter);

const { Pool } = pg;
const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});


const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  return req.cookies?.token;
};


const authenticateJWT = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Forbidden" });
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };
    next();
  });
};

const authorizeAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ message: "Admin access required" });
    return;
  }
  next();
};



app.post("/auth/register", async (req, res) => {
  const { email, password, role } = req.body;
  try {
    const exists = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0) return res.json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, saltRounds);
    const result = await pool.query(
      "INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING id,email,role",
      [email, hashed, role]
    );
    res.json({ message: "User registered successfully", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (result.rows.length === 0) return res.json({ message: "User not found" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "1h" });
    
    res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: 'lax'
  });

  return res.json({ message: "Login successful", token, role: user.role });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/records", authenticateJWT, async (req, res) => {
  const { amount, type, category, notes, netBalance } = req.body;
  if(netBalance < amount && type === "expense") {
      return res.status(400).json({ message: "Invalid net balance value" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO records (user_id, amount, type, category, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [req.user.id, amount, type, category, notes]
    );
    res.json({ message: "Record created successfully", record: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});



app.get("/dashboard", authenticateJWT, async (req, res) => {
  try {
    const userRole = req.user.role;
    const canViewOverallTotals = userRole === "admin" || userRole === "analyst";
    const recordsRes = canViewOverallTotals ? await pool.query("SELECT * FROM records ORDER BY date DESC LIMIT 50")
      : await pool.query(
          "SELECT * FROM records WHERE user_id=$1 ORDER BY date DESC LIMIT 50",
          [req.user.id]
        );

    const totalsRes = canViewOverallTotals
      ? await pool.query(
          `SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
           FROM records`
        )
      : await pool.query(
          `SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
           FROM records
           WHERE user_id=$1`,
          [req.user.id]
        );

    const records = recordsRes.rows;
    const totalsRow = totalsRes.rows[0];
    const totalIncome = Number(totalsRow.total_income);
    const totalExpense = Number(totalsRow.total_expense);

    let personalTotals = null;
    if (canViewOverallTotals) {
      const personalRes = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
         FROM records
         WHERE user_id=$1`,
        [req.user.id]
      );
      const personalRow = personalRes.rows[0];
      personalTotals = {
        totalIncome: Number(personalRow.total_income),
        totalExpense: Number(personalRow.total_expense),
        net: Number(personalRow.total_income) - Number(personalRow.total_expense)
      };
    }

    res.render("dashboard.ejs", {
      records,
      role: userRole,
      totals: {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        scope: canViewOverallTotals ? "overall" : "personal"
      },
      personalTotals
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/dashboard", authenticateJWT, async (req, res) => {
  try {
    const userRole = req.user.role;
    const canViewOverallTotals = userRole === "admin" || userRole === "analyst";

    let recordsRes;
    let totalsRes;
    if (canViewOverallTotals) {
      recordsRes = await pool.query("SELECT * FROM records ORDER BY date DESC LIMIT 50");
      totalsRes = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
         FROM records`
      );
    } else {
      recordsRes = await pool.query(
        "SELECT * FROM records WHERE user_id=$1 ORDER BY date DESC LIMIT 50",
        [req.user.id]
      );
      totalsRes = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
         FROM records
         WHERE user_id=$1`,
        [req.user.id]
      );
    }

    const records = recordsRes.rows;
    const totalsRow = totalsRes.rows[0];
    const totalIncome = Number(totalsRow.total_income);
    const totalExpense = Number(totalsRow.total_expense);

    let personalTotals = null;
    if (canViewOverallTotals) {
      const personalRes = await pool.query(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense
         FROM records
         WHERE user_id=$1`,
        [req.user.id]
      );
      const personalRow = personalRes.rows[0];
      personalTotals = {
        totalIncome: Number(personalRow.total_income),
        totalExpense: Number(personalRow.total_expense),
        net: Number(personalRow.total_income) - Number(personalRow.total_expense)
      };
    }

    res.json({
      records,
      role: userRole,
      totals: {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        scope: canViewOverallTotals ? "overall" : "personal"
      },
      personalTotals
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/admin/users", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const users = await pool.query(
      "SELECT id, email, role FROM users ORDER BY id ASC"
    );
    res.json({ users: users.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.delete("/admin/records/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const recordId = Number(req.params.id);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return res.status(400).json({ message: "Invalid record ID" });
    }

    const result = await pool.query("DELETE FROM records WHERE id=$1 RETURNING id", [recordId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Record not found" });
    }

    return res.json({ message: "Record deleted successfully", id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

app.delete("/admin/users/:id", authenticateJWT, authorizeAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (userId === req.user.id) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    await pool.query("BEGIN");
    await pool.query("DELETE FROM records WHERE user_id=$1", [userId]);
    const result = await pool.query("DELETE FROM users WHERE id=$1 RETURNING id", [userId]);

    if (result.rowCount === 0) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ message: "User not found" });
    }

    await pool.query("COMMIT");
    return res.json({ message: "User deleted successfully", id: result.rows[0].id });
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});










app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});


app.use((req, res, next) => {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
});


app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  console.error(err);

  const status = Number(err.status) || 500;
  const isProduction = process.env.NODE_ENV === "production";
  const message = status === 500 ? "Server error" : err.message;

  return res.status(status).json({
    message,
    ...(status === 500 && !isProduction && err.message ? { error: err.message } : {}),
  });
});


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});