import { createRemoteJWKSet, jwtVerify } from "jose";
import { col } from "../db.js";

const AUTH_URL = process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL;
if (!AUTH_URL) throw new Error("AUTH_URL (or BETTER_AUTH_URL) is not set");

const JWKS = createRemoteJWKSet(new URL(`${AUTH_URL}/api/auth/jwks`));

// 401: token nai ba invalid
export async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  try {
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });

    // role DB theke ashe, token er upor vorosha kora hoy na
    const user = await col("user").findOne({ email: payload.email });
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role || "customer",
    };
    next();
  } catch (err) {
    console.error("JWT error:", err.code || err.message);
    res.status(401).json({ message: "Unauthorized" });
  }
}

// 403: token valid, kintu role mile na
const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : res.status(403).json({ message: "Forbidden" });

export const verifyCustomer = requireRole("customer");
export const verifyTechnician = requireRole("technician");
export const verifyAdmin = requireRole("admin");