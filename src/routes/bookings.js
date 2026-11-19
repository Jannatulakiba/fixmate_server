import { Router } from "express";
import { ObjectId } from "mongodb";
import { col } from "../db.js";
import { verifyToken, verifyCustomer, verifyTechnician } from "../middleware/auth.js";

const router = Router();

const ACTIVE = ["requested", "accepted", "in-progress"];
const STATUSES = ["requested", "accepted", "rejected", "in-progress", "completed", "cancelled"];
const DUP_MSG = "You already have an active request for this service";

// target status -> kon status theke ashte parbe
const FROM = {
  accepted: "requested",
  rejected: "requested",
  "in-progress": "accepted",
  completed: "in-progress",
};

const isId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;
const entry = (status) => ({ status, changedAt: new Date() });

/* ---------- Customer ---------- */

router.post("/", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    const { serviceId } = req.body;
    const phone = String(req.body.phone ?? "").replace(/[\s-]/g, "");
    const address = String(req.body.address ?? "").trim();
    const dateStr = String(req.body.preferredDate ?? "");
    const problem = String(req.body.problemDescription ?? "").trim();

    if (!isId(serviceId)) return res.status(400).json({ message: "Invalid service" });
    if (!/^\+?\d{10,14}$/.test(phone)) return res.status(400).json({ message: "Enter a valid phone number" });
    if (!address) return res.status(400).json({ message: "Address is required" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || Number.isNaN(Date.parse(dateStr))) {
      return res.status(400).json({ message: "Valid preferred date is required" });
    }
    // timezone er jonno 1 din tolerance
    const minDate = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (dateStr < minDate) return res.status(400).json({ message: "Preferred date cannot be in the past" });
    if (problem.length < 20) {
      return res.status(400).json({ message: "Problem description must be at least 20 characters" });
    }

    const service = await col("services").findOne({
      _id: new ObjectId(serviceId),
      approvalStatus: "approved",
      isAvailable: true,
    });
    if (!service) return res.status(404).json({ message: "Service not found" });

    if (service.technicianEmail === req.user.email) {
      return res.status(403).json({ message: "You cannot request your own service" });
    }

    const dup = await col("bookings").findOne({
      serviceId,
      customerEmail: req.user.email,
      status: { $in: ACTIVE },
    });
    if (dup) return res.status(409).json({ message: DUP_MSG });

    const now = new Date();
    const doc = {
      serviceId,
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: phone,
      address,
      preferredDate: new Date(`${dateStr}T00:00:00.000Z`),
      problemDescription: problem,
      status: "requested",
      finalAmount: service.basePrice,
      paymentStatus: "unpaid",
      statusHistory: [entry("requested")],
      createdAt: now,
    };
    const r = await col("bookings").insertOne(doc);
    res.status(201).json({ ...doc, _id: r.insertedId });
  } catch (e) {
    // duita request ek shathe ashle unique index eikhane atkabe
    if (e.code === 11000) return res.status(409).json({ message: DUP_MSG });
    next(e);
  }
});

// email URL e nai, tai onner data dekhar upay nai
router.get("/my", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    res.json(await col("bookings").find({ customerEmail: req.user.email }).sort({ createdAt: -1 }).toArray());
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/cancel", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Booking not found" });
    const _id = new ObjectId(req.params.id);

    const updated = await col("bookings").findOneAndUpdate(
      { _id, customerEmail: req.user.email, status: "requested" },
      { $set: { status: "cancelled" }, $push: { statusHistory: entry("cancelled") } },
      { returnDocument: "after" }
    );
    if (updated) return res.json(updated);

    const exists = await col("bookings").findOne({ _id, customerEmail: req.user.email });
    if (!exists) return res.status(404).json({ message: "Booking not found" });
    res.status(400).json({ message: "Only requested bookings can be cancelled" });
  } catch (e) {
    next(e);
  }
});

/* ---------- Technician ---------- */

router.get("/technician", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const filter = { technicianEmail: req.user.email };
    if (STATUSES.includes(req.query.status)) filter.status = req.query.status;
    res.json(await col("bookings").find(filter).sort({ createdAt: -1 }).toArray());
  } catch (e) {
    next(e);
  }
});

router.patch("/:id/status", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Booking not found" });
    const _id = new ObjectId(req.params.id);
    const { status, finalAmount } = req.body;

    if (!FROM[status]) {
      return res.status(400).json({ message: "Status must be accepted, rejected, in-progress or completed" });
    }

    const set = { status };
    if (status === "completed") {
      const amount = Number(finalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Final amount must be a number greater than 0" });
      }
      set.finalAmount = Math.round(amount * 100) / 100;
    }

    // owner + current status check ek query te (race condition nai)
    const updated = await col("bookings").findOneAndUpdate(
      { _id, technicianEmail: req.user.email, status: FROM[status] },
      { $set: set, $push: { statusHistory: entry(status) } },
      { returnDocument: "after" }
    );
    if (updated) return res.json(updated);

    const b = await col("bookings").findOne({ _id, technicianEmail: req.user.email });
    if (!b) return res.status(404).json({ message: "Booking not found" });
    res.status(400).json({ message: `Cannot change status from ${b.status} to ${status}` });
  } catch (e) {
    next(e);
  }
});

export default router;