const crypto = require("crypto");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function makeSession(email, secret) {
  const payload = Buffer.from(JSON.stringify({
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
  })).toString("base64url");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

exports.handler = async function (event) {
  const method = event.httpMethod;
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
  }
  if (method !== "POST") return json(405, { ok: false, message: "Method tidak diizinkan" });

  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const secret = process.env.SESSION_SECRET;

  if (!ownerEmail || !ownerPassword || !secret || secret.length < 32) {
    return json(500, { ok: false, message: "Pengaturan login belum lengkap di Netlify" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, message: "Format permintaan tidak valid" });
  }

  const action = String(body.action || "login").toLowerCase();

  if (action === "logout") {
    return json(200, { ok: true, message: "Berhasil keluar" }, {
      "Set-Cookie": "aforte_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
    });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!safeEqual(email, ownerEmail.trim().toLowerCase()) ||
      !safeEqual(password, ownerPassword)) {
    return json(401, { ok: false, message: "Email atau password salah" });
  }

  const session = makeSession(email, secret);
  return json(200, { ok: true, message: "Login berhasil" }, {
    "Set-Cookie": `aforte_session=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`
  });
};
