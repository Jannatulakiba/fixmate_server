import { Router } from "express";
import { col } from "../db.js";

const router = Router();

router.get("/stats", async (req, res, next) => {
  try {
    const email = req.user.email;
    const mine = { technicianEmail: email };

    const [
      totalServices,
      approvedServices,
      pendingServices,
      pendingRequests,
      byStatus,
      newRequests,
      earnings,
      recentEarnings,
    ] = await Promise.all([
      col("services").countDocuments(mine),
      col("services").countDocuments({ ...mine, approvalStatus: "approved" }),
      col("services").countDocuments({ ...mine, approvalStatus: "pending" }),
      col("bookings").countDocuments({ ...mine, status: "requested" }),
      col("bookings").aggregate([{ $match: mine }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
      col("bookings").find({ ...mine, status: "requested" }).sort({ createdAt: -1 }).limit(5).toArray(),
      col("payments").aggregate([{ $match: mine }, { $group: { _id: null, total: { $sum: "$amount" } } }]).toArray(),
      col("payments").find(mine).sort({ paidAt: -1 }).limit(5).toArray(),
    ]);

    res.json({
      totalServices,
      approvedServices,
      pendingServices,
      pendingRequests,
      totalEarnings: earnings[0]?.total ?? 0,
      jobsByStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
      newRequests,
      recentEarnings,
    });
  } catch (e) {
    next(e);
  }
});

export default router;