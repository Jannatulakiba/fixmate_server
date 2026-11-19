import { Router } from "express";
import { ObjectId } from "mongodb";
import { col } from "../db.js";

const router = Router();

const ROLES = ["customer", "technician", "admin"];
const APPROVALS = ["pending", "approved", "rejected"];
const STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"];
const isId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

// Overview stats
router.get("/stats", async (req, res, next) => {
  try {
    const [totalUsers, totalTechnicians, pendingServices, byStatus] = await Promise.all([
      col("user").countDocuments(),
      col("user").countDocuments({ role: "technician" }),
      col("services").countDocuments({ approvalStatus: "pending" }),
      col("services").aggregate([{ $group: { _id: "$approvalStatus", count: { $sum: 1 } } }]).toArray(),
    ]);
    const servicesByStatus = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
    res.json({ totalUsers, totalTechnicians, pendingServices, servicesByStatus });
  } catch (e) {
    next(e);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const users = await col("user")
      .find({}, { projection: { name: 1, email: 1, image: 1, role: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(users.map((u) => ({ ...u, role: u.role || "customer" })));
  } catch (e) {
    next(e);
  }
});

// Admin nijer role change korte parbe na
router.patch("/users/:id/role", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!isId(id)) return res.status(404).json({ message: "User not found" });
    if (!ROLES.includes(role)) return res.status(400).json({ message: "Invalid role" });
    if (id === req.user.id) return res.status(400).json({ message: "You cannot change your own role" });

    const r = await col("user").updateOne({ _id: new ObjectId(id) }, { $set: { role } });
    if (!r.matchedCount) return res.status(404).json({ message: "User not found" });
    res.json({ role });
  } catch (e) {
    next(e);
  }
});

router.get("/services", async (req, res, next) => {
  try {
    const filter = APPROVALS.includes(req.query.status) ? { approvalStatus: req.query.status } : {};
    res.json(await col("services").find(filter).sort({ createdAt: -1 }).toArray());
  } catch (e) {
    next(e);
  }
});

router.patch("/services/:id/approval", async (req, res, next) => {
  try {
    const { approvalStatus } = req.body;
    if (!isId(req.params.id)) return res.status(404).json({ message: "Service not found" });
    if (!["approved", "rejected"].includes(approvalStatus)) {
      return res.status(400).json({ message: "approvalStatus must be approved or rejected" });
    }
    const r = await col("services").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { approvalStatus } }
    );
    if (!r.matchedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ approvalStatus });
  } catch (e) {
    next(e);
  }
});

router.get("/bookings", async (req, res, next) => {
  try {
    const filter = STATUSES.includes(req.query.status) ? { status: req.query.status } : {};
    res.json(await col("bookings").find(filter).sort({ createdAt: -1 }).toArray());
  } catch (e) {
    next(e);
  }
});

router.get("/payments", async (req, res, next) => {
  try {
    const payments = await col("payments").find().sort({ paidAt: -1 }).toArray();
    const totalRevenue = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    res.json({ payments, totalRevenue });
  } catch (e) {
    next(e);
  }
});

export default router;