import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./src/db.js";
import { verifyToken, verifyAdmin } from "./src/middleware/auth.js";
import servicesRouter from "./src/routes/services.js";
import adminRouter from "./src/routes/admin.js";
import bookingsRouter from "./src/routes/bookings.js";

const required = ["MONGODB_URI", "BETTER_AUTH_URL", "NEXT_PUBLIC_API_URL"];
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
app.use(express.json());

app.use("/api/services", servicesRouter);
app.use("/api/admin", verifyToken, verifyAdmin, adminRouter);

app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);

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

await connectDB();
app.listen(process.env.PORT || 5000, () => console.log("Server running on port", process.env.PORT || 5000));