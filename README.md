# FixMate: Device and Home Appliance Repair Service Platform (Server)

REST API for FixMate, built with Node.js, Express and MongoDB. It verifies BetterAuth JWT tokens, enforces role-based access, runs the booking status pipeline and handles Stripe payments.

The Next.js client lives in the client repository.

## Purpose

FixMate connects customers with verified repair technicians. Every job has a clear status and the customer pays online only after the work is completed. This API enforces all business rules on the server so they cannot be bypassed from the client.

## Live Links

| | URL |
|---|---|
| Server API | https://fixmate-server-tawny.vercel.app |
| Live site | https://fixmate-client-seven.vercel.app |
| Client repository | https://github.com/YOUR_USERNAME/YOUR_CLIENT_REPO |
| Server repository | https://github.com/YOUR_USERNAME/YOUR_SERVER_REPO |

## Test Accounts

| Role | Email | Password |
|---|---|---|
| Admin | admin@fixmate.com | Admin123 |
| Technician | rahim@fixmate.com | Tech1234 |
| Technician | karim@fixmate.com | Tech1234 |
| Customer | customer@fixmate.com | Customer123 |

## Key Features

- **JWT verification**: the client sends the BetterAuth JWT as `Authorization: Bearer <token>`. The server verifies it against the BetterAuth JWKS endpoint, then loads the user and the current role from the database, so a role change takes effect immediately
- **Role middlewares**: `verifyToken`, `verifyCustomer`, `verifyTechnician`, `verifyAdmin`. A missing or invalid token returns `401`, a valid user with the wrong role returns `403`
- **Data isolation**: customer and technician queries always use the email from the verified token, never from the URL or body
- **Server-side search, filter and sort** on services with MongoDB queries
- **Booking pipeline enforced on the server**: only the owning technician can update a job, only valid transitions are allowed, and `finalAmount` must be greater than 0 on completion
- **Business rules**: no duplicate active request for the same service (also guarded by a partial unique index), technicians and admins cannot book, a technician cannot book their own service
- **Stripe payments**: the checkout amount is read from the booking in the database. Payment is allowed only for a completed and unpaid booking owned by the logged-in customer
- **Idempotent payment saving**: success page verification and the webhook use the same function, and unique indexes on `stripeSessionId` and `bookingId` make sure a payment is never saved twice
- **Stripe webhook** with signature verification on the raw request body
- Admin API for users, roles, service approval, bookings and transactions
- Technician and customer stats endpoints for the dashboards

## Collections

`users` (BetterAuth `user` collection), `services`, `bookings`, `payments`. BetterAuth also creates `session`, `account`, `verification` and `jwks` automatically.

## API Overview

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/services` (search, category, mode, sort, limit) | Public |
| GET | `/api/services/:id` | Public |
| GET | `/api/services/my` | Technician |
| POST | `/api/services` | Technician |
| PATCH | `/api/services/:id` | Technician (owner), resets approval to pending |
| PATCH | `/api/services/:id/availability` | Technician (owner) |
| DELETE | `/api/services/:id` | Technician (owner) |
| POST | `/api/bookings` | Customer |
| GET | `/api/bookings/my` | Customer |
| PATCH | `/api/bookings/:id/cancel` | Customer (owner, only while requested) |
| GET | `/api/bookings/technician` | Technician |
| PATCH | `/api/bookings/:id/status` | Technician (owner) |
| POST | `/api/payments/create-checkout-session` | Customer |
| GET | `/api/payments/verify?session_id=` | Customer |
| GET | `/api/payments/my` | Customer |
| POST | `/api/payments/webhook` | Stripe (signature verified) |
| GET | `/api/customer/stats` | Customer |
| GET | `/api/technician/stats` | Technician |
| GET | `/api/admin/stats`, `/users`, `/services`, `/bookings`, `/payments` | Admin |
| PATCH | `/api/admin/users/:id/role` | Admin (cannot change own role) |
| PATCH | `/api/admin/services/:id/approval` | Admin |
| PATCH | `/api/users/profile` | Any logged-in user |
| GET | `/api/me` | Any logged-in user |

## Job Status Rules

| Current status | Next status | Who |
|---|---|---|
| requested | accepted or rejected | Technician (owner) |
| requested | cancelled | Customer (owner) |
| accepted | in-progress | Technician (owner) |
| in-progress | completed (with `finalAmount` > 0) | Technician (owner) |
| completed and unpaid | paid | Stripe, after the customer pays |

Any other change is rejected with `400`.

## Tech Stack

Node.js, Express, MongoDB (Atlas), Stripe (test mode), BetterAuth JWT verification with `jose`.

## npm Packages Used

`express`, `cors`, `dotenv`, `mongodb`, `jose`, `stripe`

## Environment Variables

Create a `.env` file in the project root. Do not commit it.

```env
PORT=5000
MONGODB_URI=
CLIENT_URL=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

- `MONGODB_URI` must use the same database as the client
- `CLIENT_URL` accepts a comma separated list of allowed origins (CORS)
- `BETTER_AUTH_URL` must be exactly the same value as the client's `BETTER_AUTH_URL`

## Run Locally

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_SERVER_REPO.git
cd YOUR_SERVER_REPO
npm install
npm run dev
```

The API runs on http://localhost:5000.

### Stripe webhook (local)

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Put the printed `whsec_...` value in `STRIPE_WEBHOOK_SECRET`.

## Deployment

- Deployed on Vercel with `vercel.json`
- Production client domain is included in the CORS allowed origins
- Stripe webhook endpoint (test mode): `https://fixmate-server-tawny.vercel.app/api/payments/webhook`, event `checkout.session.completed`
- Use Stripe test card `4242 4242 4242 4242` with any future expiry date and any CVC