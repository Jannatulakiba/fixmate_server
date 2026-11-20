import { Router } from "express";
import { col } from "../db.js";

const router = Router();
const ACTIVE = ["requested", "accepted", "in-progress"];

router.get("/stats", async (req, res, next) => {
  try {
    const mine = { customerEmail: req.user.email };

    const [totalRequests, activeJobs, completedJobs, awaitingPayment, byStatus, recentBookings, spent] =
      await Promise.all([
        col("bookings").countDocuments(mine),
        col("bookings").countDocuments({ ...mine, status: { $in: ACTIVE } }),
        col("bookings").countDocuments({ ...mine, status: "completed" }),
        col("bookings").countDocuments({ ...mine, status: "completed", paymentStatus: "unpaid" }),
        col("bookings").aggregate([{ $match: mine }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
        col("bookings").find(mine).sort({ createdAt: -1 }).limit(5).toArray(),
        col("payments").aggregate([{ $match: mine }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
      ]);

    res.json({
      totalRequests,
      activeJobs,
      completedJobs,
      awaitingPayment,
      totalSpent: spent[0]?.total ?? 0,
      byStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
      recentBookings,
    });
  } catch (e) {
    next(e);
  }
});

export default router;