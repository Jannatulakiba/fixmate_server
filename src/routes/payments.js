import { Router } from "express";
import { ObjectId } from "mongodb";
import { col } from "../db.js";
import { stripe } from "../stripe.js";
import { verifyToken, verifyCustomer } from "../middleware/auth.js";

const router = Router();
const isId = (id) => ObjectId.isValid(id) && String(new ObjectId(id)) === id;
const CLIENT = () => process.env.CLIENT_URL.split(",")[0].trim();

/*
  Success page verify ar webhook, duto-i ei function chalay.
  Idempotent: bar bar chalaleo payment ekbar-i save hoy.
*/
export async function savePayment(session) {
  const { bookingId, customerEmail } = session.metadata || {};
  if (session.payment_status !== "paid" || !isId(bookingId)) return null;

  const booking = await col("bookings").findOne({ _id: new ObjectId(bookingId) });
  if (!booking || booking.customerEmail !== customerEmail) return null;

  const intent = session.payment_intent;
  const doc = {
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: session.amount_total / 100,
    currency: session.currency,
    transactionId: typeof intent === "string" ? intent : intent?.id,
    stripeSessionId: session.id,
    paymentStatus: "paid",
    paidAt: new Date(),
  };

  try {
    await col("payments").insertOne(doc);
  } catch (e) {
    if (e.code !== 11000) throw e; // duplicate hole already saved, ignore
  }

  // insert ar update er majhe fail korle porer retry e booking paid hobe
  await col("bookings").updateOne(
    { _id: booking._id, paymentStatus: "unpaid" },
    { $set: { paymentStatus: "paid" } }
  );

  return col("payments").findOne({ bookingId });
}

/* ---------- Customer ---------- */

router.post("/create-checkout-session", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    if (!isId(bookingId)) return res.status(404).json({ message: "Booking not found" });

    // amount kokhono client theke na, DB theke
    const booking = await col("bookings").findOne({
      _id: new ObjectId(bookingId),
      customerEmail: req.user.email,
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Only completed jobs can be paid" });
    }
    if (booking.paymentStatus !== "unpaid") {
      return res.status(400).json({ message: "This booking is already paid" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(booking.finalAmount * 100),
            product_data: { name: booking.serviceTitle },
          },
        },
      ],
      metadata: { bookingId: String(booking._id), customerEmail: req.user.email },
      success_url: `${CLIENT()}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT()}/payment/cancel`,
    });

    res.json({ url: session.url });
  } catch (e) {
    next(e);
  }
});

router.get("/verify", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    const { session_id } = req.query;
    if (typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return res.status(400).json({ message: "Invalid session" });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.metadata?.customerEmail !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    const payment = await savePayment(session);
    if (!payment) return res.status(400).json({ message: "Could not record payment" });
    res.json(payment);
  } catch (e) {
    if (e.type === "StripeInvalidRequestError") return res.status(400).json({ message: "Invalid session" });
    next(e);
  }
});

router.get("/my", verifyToken, verifyCustomer, async (req, res, next) => {
  try {
    res.json(await col("payments").find({ customerEmail: req.user.email }).sort({ paidAt: -1 }).toArray());
  } catch (e) {
    next(e);
  }
});

/* ---------- Webhook (Challenge 4) ---------- */

export async function webhookHandler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] STRIPE_WEBHOOK_SECRET is not set");
    return res.status(503).send("STRIPE_WEBHOOK_SECRET is not configured");
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).send("Missing signature");

  // raw body Buffer hote hobe, parsed object hole signature mile na
  const payload = Buffer.isBuffer(req.body) ? req.body : req.rawBody;
  if (!payload) {
    console.error("[webhook] raw body not available, body type:", typeof req.body);
    return res.status(400).send("Raw body not available");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.error("[webhook] signature failed:", err.message);
    return res.status(400).send("Invalid signature");
  }

  console.log("[webhook] received", event.type, event.id);

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const payment = await savePayment(event.data.object);
      console.log("[webhook] payment:", payment ? `saved ${payment.transactionId}` : "skipped (not paid or no booking metadata)");
    }
    res.json({ received: true });
  } catch (e) {
    console.error("[webhook] handler error:", e);
    res.status(500).send("Webhook handler failed"); // Stripe abar retry korbe
  }
}

export default router;