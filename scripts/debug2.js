import "dotenv/config";
import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

const seed = ["rahim@fixmate.com", "karim@fixmate.com"];

console.log("\nNew technician services (seed baad):");
const svc = await db.collection("services").find({ technicianEmail: { $nin: seed } }).toArray();
console.table(svc.map((s) => ({
  id: String(s._id).slice(-6),
  title: s.title,
  technicianEmail: s.technicianEmail,
  approval: s.approvalStatus,
  available: s.isAvailable,
})));

console.log("\nLatest 8 bookings:");
const b = await db.collection("bookings").find().sort({ createdAt: -1 }).limit(8).toArray();
console.table(b.map((x) => ({
  service: x.serviceTitle,
  serviceId: String(x.serviceId).slice(-6),
  customer: x.customerEmail,
  technicianEmail: x.technicianEmail,
  status: x.status,
})));

await client.close();