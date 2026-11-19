

import { Router } from "express";
import { ObjectId } from "mongodb";
import { col } from "../db.js";
import { verifyToken, verifyTechnician } from "../middleware/auth.js";

const router = Router();

const CATEGORIES = ["Smartphone", "Laptop & PC", "AC", "Refrigerator", "TV", "Washing Machine", "Electrical"];
const MODES = ["Home Visit", "Shop Drop-off"];

const isId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;

function cleanService(b = {}) {
  const title = String(b.title ?? "").trim();
  const description = String(b.description ?? "").trim();
  const estimatedDuration = String(b.estimatedDuration ?? "").trim();
  const serviceArea = String(b.serviceArea ?? "").trim();
  const image = String(b.image ?? "").trim();
  const basePrice = Number(b.basePrice);

  if (title.length < 3) return { error: "Title must be at least 3 characters" };
  if (!CATEGORIES.includes(b.category)) return { error: "Invalid category" };
  if (description.length < 20) return { error: "Description must be at least 20 characters" };
  if (!(basePrice > 0)) return { error: "Base price must be a positive number" };
  if (!estimatedDuration) return { error: "Estimated duration is required" };
  if (!MODES.includes(b.serviceMode)) return { error: "Invalid service mode" };
  if (!serviceArea) return { error: "Service area is required" };
  if (!/^https?:\/\//.test(image)) return { error: "Valid image URL is required" };

  return {
    data: { title, category: b.category, description, image, basePrice, estimatedDuration, serviceMode: b.serviceMode, serviceArea },
  };
}

/* ---------- Public ---------- */

// Search, filter, sort shob MongoDB te
router.get("/", async (req, res, next) => {
  try {
    const { search, category, mode, sort, limit } = req.query;
    const filter = { approvalStatus: "approved", isAvailable: true };

    if (typeof category === "string" && category) filter.category = category;
    if (typeof mode === "string" && mode) filter.serviceMode = mode;
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ title: rx }, { category: rx }];
    }

    const sortMap = { "price-asc": { basePrice: 1 }, "price-desc": { basePrice: -1 } };
    const cursor = col("services").find(filter).sort(sortMap[sort] ?? { createdAt: -1 });

    const n = Number(limit);
    if (n > 0) cursor.limit(Math.min(n, 50));

    res.json(await cursor.toArray());
  } catch (e) {
    next(e);
  }
});

/* ---------- Technician (/my agey, nahole :id er sathe conflict hobe) ---------- */

router.get("/my", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const list = await col("services")
      .find({ technicianEmail: req.user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/* ---------- Public details ---------- */

router.get("/:id", async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Service not found" });

    const s = await col("services").findOne({
      _id: new ObjectId(req.params.id),
      approvalStatus: "approved",
      isAvailable: true,
    });
    if (!s) return res.status(404).json({ message: "Service not found" });

    const t = await col("user").findOne({ email: s.technicianEmail });
    res.json({
      ...s,
      technician: { image: t?.image ?? "", area: t?.area ?? s.serviceArea, bio: t?.bio ?? "" },
    });
  } catch (e) {
    next(e);
  }
});

/* ---------- Technician CRUD ---------- */

router.post("/", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const { error, data } = cleanService(req.body);
    if (error) return res.status(400).json({ message: error });

    // name/email client theke na, token user theke
    const doc = {
      ...data,
      technicianName: req.user.name,
      technicianEmail: req.user.email,
      approvalStatus: "pending",
      isAvailable: true,
      createdAt: new Date(),
    };
    const r = await col("services").insertOne(doc);
    res.status(201).json({ ...doc, _id: r.insertedId });
  } catch (e) {
    next(e);
  }
});

// Edit korle abar pending
router.patch("/:id", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Service not found" });
    const { error, data } = cleanService(req.body);
    if (error) return res.status(400).json({ message: error });

    const updated = await col("services").findOneAndUpdate(
      { _id: new ObjectId(req.params.id), technicianEmail: req.user.email },
      { $set: { ...data, approvalStatus: "pending" } },
      { returnDocument: "after" }
    );
    if (!updated) return res.status(404).json({ message: "Service not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

// Availability toggle e approval reset hoy na
router.patch("/:id/availability", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Service not found" });
    if (typeof req.body.isAvailable !== "boolean") {
      return res.status(400).json({ message: "isAvailable must be true or false" });
    }
    const r = await col("services").updateOne(
      { _id: new ObjectId(req.params.id), technicianEmail: req.user.email },
      { $set: { isAvailable: req.body.isAvailable } }
    );
    if (!r.matchedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ isAvailable: req.body.isAvailable });
  } catch (e) {
    next(e);
  }
});

router.delete("/:id", verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: "Service not found" });
    const r = await col("services").deleteOne({
      _id: new ObjectId(req.params.id),
      technicianEmail: req.user.email,
    });
    if (!r.deletedCount) return res.status(404).json({ message: "Service not found" });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

export default router;