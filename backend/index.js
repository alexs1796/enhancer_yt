const express = require("express");
const fs = require("fs");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const Stripe = require("stripe");
require("dotenv").config();

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Helper: load and save keys
const loadKeys = () => JSON.parse(fs.readFileSync("keys.json", "utf8"));
const saveKeys = (keys) => fs.writeFileSync("keys.json", JSON.stringify(keys, null, 2));

// --- 1️⃣ Validate key (extension calls this) ---
app.get("/validate-key", (req, res) => {
  const { key, user } = req.query;
  if (!key || !user) return res.status(400).json({ valid: false });

  const keys = loadKeys();
  const found = keys.find(k => k.key === key && k.user === user);
  const now = new Date();

  if (!found || new Date(found.expires) < now) return res.json({ valid: false });

  res.json({ valid: true, features: { speedAds: true, muteAds: true } });
});

// --- 2️⃣ Stripe webhook for subscription payments ---
app.post("/stripe-webhook", express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Payment succeeded -> create or renew key
  if (event.type === 'invoice.payment_succeeded') {
    const customerId = event.data.object.customer;

    const keys = loadKeys();
    let userKey = keys.find(k => k.user === customerId);

    if (userKey) {
      // Renew existing key: extend expires 1 month
      const newExpires = new Date();
      newExpires.setMonth(newExpires.getMonth() + 1);
      userKey.expires = newExpires.toISOString();
      console.log(`Key ${userKey.key} renewed for user ${customerId}`);
    } else {
      // Generate new key for first-time subscriber
      const newKey = "PRO-" + uuidv4().split("-")[0] + "-" + Math.floor(Math.random()*10000);
      const expireDate = new Date();
      expireDate.setMonth(expireDate.getMonth() + 1);

      keys.push({
        key: newKey,
        user: customerId,
        expires: expireDate.toISOString()
      });

      console.log(`New key generated for user ${customerId}: ${newKey}`);
    }

    saveKeys(keys);
  }

  res.json({ received: true });
});

// --- 3️⃣ Admin endpoint: optional manual key generation ---
app.get("/generate-key", (req, res) => {
  const password = req.query.pwd;
  if (password !== process.env.ADMIN_PWD) return res.status(403).send("Forbidden");

  const keys = loadKeys();
  const newKey = "PRO-" + uuidv4().split("-")[0] + "-" + Math.floor(Math.random()*10000);
  const expireDate = new Date();
  expireDate.setMonth(expireDate.getMonth() + 1);

  keys.push({ key: newKey, user: "MANUAL", expires: expireDate.toISOString() });
  saveKeys(keys);

  res.json({ key: newKey });
});

app.listen(PORT, () => console.log(`YTEnhancer backend running on port ${PORT}`));