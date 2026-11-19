import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  throw new Error("Missing env variable: STRIPE_SECRET_KEY (set it in .env, e.g. sk_test_...)");
}

export const stripe = new Stripe(key);
