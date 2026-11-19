import { MongoClient } from "mongodb";

let db;

export async function connectDB() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db();

  await db.collection("services").createIndex({ approvalStatus: 1, isAvailable: 1, createdAt: -1 });
  await db.collection("bookings").createIndex({ customerEmail: 1 });
  await db.collection("bookings").createIndex({ technicianEmail: 1 });
  await db.collection("payments").createIndex({ stripeSessionId: 1 }, { unique: true });
  await db.collection("payments").createIndex({ bookingId: 1 }, { unique: true });


  await db.collection("bookings").createIndex(
  { serviceId: 1, customerEmail: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["requested", "accepted", "in-progress"] } },
  }
);

  console.log("MongoDB connected:", db.databaseName);
}

export const col = (name) => db.collection(name);