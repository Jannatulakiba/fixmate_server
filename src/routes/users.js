import { Router } from "express";
import { col } from "../db.js";
import { verifyToken } from "../middleware/auth.js";

const router = Router();

// role ar email kokhono body theke neya hoy na
router.patch("/profile", verifyToken, async (req, res, next) => {
  try {
    const name = String(req.body.name ?? "").trim();
    const phone = String(req.body.phone ?? "").trim();
    const area = String(req.body.area ?? "").trim();
    const bio = String(req.body.bio ?? "").trim();
    const image = String(req.body.image ?? "").trim();

    if (name.length < 2) return res.status(400).json({ message: "Name must be at least 2 characters" });
    if (phone && !/^\+?\d{10,14}$/.test(phone.replace(/[\s-]/g, ""))) {
      return res.status(400).json({ message: "Enter a valid phone number" });
    }
    if (area.length > 100) return res.status(400).json({ message: "Area is too long" });
    if (bio.length > 300) return res.status(400).json({ message: "Bio must be 300 characters or less" });
    if (image && !/^https?:\/\//.test(image)) return res.status(400).json({ message: "Invalid image URL" });

    const set = { name, phone, area, bio, updatedAt: new Date() };
    if (image) set.image = image;

    const updated = await col("user").findOneAndUpdate(
      { email: req.user.email },
      { $set: set },
      { returnDocument: "after", projection: { name: 1, email: 1, image: 1, role: 1, phone: 1, area: 1, bio: 1 } }
    );
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  } catch (e) {
    next(e);
  }
});

export default router;