const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const KEYS_FILE = "./keys.json";

let keys = [];
if (fs.existsSync(KEYS_FILE)) {
  keys = JSON.parse(fs.readFileSync(KEYS_FILE));
}

function saveKeys() {
  fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
}

function generateKey() {
  return "PRO-" + uuidv4().split("-").slice(0, 2).join("-");
}

app.post("/webhook", (req, res) => {
  const event = req.body;

  if (event.type === "checkout.session.completed") {
    const customerEmail = event.data.object.customer_email || "unknown";
    const newKey = generateKey();

    keys.push({
      key: newKey,
      email: customerEmail,
      created: new Date().toISOString(),
      valid: true
    });

    saveKeys();

    console.log(`Generated key for ${customerEmail}: ${newKey}`);
  }

  res.send({ received: true });
});

app.get("/validate-key", (req, res) => {
  const key = req.query.key;
  const found = keys.find(k => k.key === key && k.valid);

  if (found) {
    res.json({ valid: true, features: { speedAds: true, muteAds: true } });
  } else {
    res.json({ valid: false });
  }
});

app.get("/keys", (req, res) => {
  res.json(keys);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
