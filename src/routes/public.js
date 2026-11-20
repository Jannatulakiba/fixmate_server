import { Router } from "express";
import { col } from "../db.js";

const router = Router();

// Marketing page er counters — shob live count, kono hardcoded number na
// (kono auth lagena: home page public)
router.get("/stats", async (req, res, next) => {
  try {
    const [verifiedTechnicians, customers, servicesListed, jobsTotal, jobsCompleted] = await Promise.all([
      col("user").countDocuments({ role: "technician" }),
      col("user").countDocuments({ role: "customer" }),
      col("services").countDocuments({ approvalStatus: "approved" }),
      col("bookings").countDocuments(),
      col("bookings").countDocuments({ status: "completed" }),
    ]);

    res.json({ verifiedTechnicians, customers, servicesListed, jobsTotal, jobsCompleted });
  } catch (e) {
    next(e);
  }
});

export default router;
