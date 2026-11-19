import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./src/db.js";
import { verifyToken, verifyAdmin } from "./src/middleware/auth.js";
import servicesRouter from "./src/routes/services.js";
import adminRouter from "./src/routes/admin.js";
import bookingsRouter from "./src/routes/bookings.js";
import paymentsRouter, { webhookHandler } from "./src/routes/payments.js";

const required = ["MONGODB_URI", "BETTER_AUTH_URL", "NEXT_PUBLIC_API_URL", "CLIENT_URL", "STRIPE_SECRET_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing env variables:", missing.join(", "));
  process.exit(1);
}





const app = express();

const corsOptions = {};
const clientUrls = (process.env.CLIENT_URL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
if (clientUrls.length) corsOptions.origin = clientUrls;
corsOptions.credentials = true;
app.use(cors(corsOptions));

// Stripe webhook er AGE: signature check raw body chay, tai express.json() er age
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), webhookHandler);

app.use(express.json());

app.use("/api/bookings", bookingsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/services", servicesRouter);
app.use("/api/admin", verifyToken, verifyAdmin, adminRouter);

app.get("/", (req, res) => res.json({ name: "FixMate API", status: "ok" }));
app.get("/api/me", verifyToken, (req, res) => res.json(req.user));

app.use((req, res) => res.status(404).json({ message: "Route not found" }));

app.use((err, req, res, next) => {
  // vul JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON body" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

try {
  await connectDB();
} catch (e) {
  if (e?.code === 8000 || /bad auth/i.test(e?.message ?? "")) {
    console.error(
      "MongoDB auth failed: MONGODB_URI credentials rejected by Atlas.\n" +
        "→ MongoDB Atlas > Database Access: check username/password (and IP Access List)."
    );
  } else {
    console.error("MongoDB connection failed:", e?.message ?? e);
  }
  process.exit(1);
}
app.listen(process.env.PORT || 5000, () => console.log("Server running on port", process.env.PORT || 5000));
