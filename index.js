import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./src/db.js";
import { verifyToken, verifyAdmin, verifyTechnician, verifyCustomer } from "./src/middleware/auth.js";
import servicesRouter from "./src/routes/services.js";
import adminRouter from "./src/routes/admin.js";
import bookingsRouter from "./src/routes/bookings.js";
import paymentsRouter, { webhookHandler } from "./src/routes/payments.js";
import technicianRouter from "./src/routes/technician.js";
import customerRouter from "./src/routes/customer.js";
import publicRouter from "./src/routes/public.js";
import usersRouter from "./src/routes/users.js";

// Missing env hole crash na kore log kore
const required = ["MONGODB_URI", "CLIENT_URL", "STRIPE_SECRET_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env variables:", missing.join(", "));
  if (!process.env.VERCEL) process.exit(1);
}

const app = express();

const allowedOrigins = [
  ...(process.env.CLIENT_URL ?? "").split(","),
"https://fixmate-client-seven.vercel.app",
  "http://localhost:3000",
]
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Prottek request e DB ready kora (ekbar connect, tarpor reuse)
let dbReady;
app.use(async (req, res, next) => {
  try {
    dbReady ??= connectDB();
    await dbReady;
    next();
  } catch (e) {
    dbReady = undefined;
    console.error("MongoDB connection failed:", e?.message ?? e);
    res.status(500).json({ message: "Database connection failed" });
  }
});

// Stripe webhook express.json() er AGE
app.post("/api/payments/webhook", express.raw({ type: "*/*" }), webhookHandler);

app.use(express.json());

app.get("/", (req, res) => res.json({ name: "FixMate API", status: "ok", build: "clientBase-fix" }));
app.get("/api/me", verifyToken, (req, res) => res.json(req.user));

app.use("/api/public", publicRouter);
app.use("/api/services", servicesRouter);
app.use("/api/users", usersRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/technician", verifyToken, verifyTechnician, technicianRouter);
app.use("/api/customer", verifyToken, verifyCustomer, customerRouter);
app.use("/api/admin", verifyToken, verifyAdmin, adminRouter);

// Purono Stripe session server domain e ferot pathale client e redirect kore dey
const CLIENT_HOME = "https://fixmate-client-seven.vercel.app";
app.get("/payment/success", (req, res) => {
  const q = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  res.redirect(302, `${CLIENT_HOME}/payment/success${q}`);
});
app.get("/payment/cancel", (req, res) => res.redirect(302, `${CLIENT_HOME}/payment/cancel`));

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// Sudhu local e listen
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  try {
    dbReady = connectDB();
    await dbReady;
  } catch (e) {
    console.error("MongoDB connection failed:", e?.message ?? e);
    process.exit(1);
  }
  app.listen(port, () => console.log("Server running on port", port));
}

export default app;