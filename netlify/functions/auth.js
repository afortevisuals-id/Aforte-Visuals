const crypto = require("crypto");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function getCookie(event, name) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
  const parts = cookieHeader.split(";").map(v => v.trim());
  const item = parts.find(v => v.startsWith(name + "="));
  return item ? decodeURIComponent(item.substring(name.length + 1)) : "";
}

function validSession(event) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return false;

  const token = getCookie(event, "aforte_session");
  const pieces = token.split(".");
  if (pieces.length !== 2) return false;

  const [payload, signature] = pieces;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return !!data.email &&
      data.email === String(process.env.OWNER_EMAIL || "").trim().toLowerCase() &&
      Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Cache-Control": "no-store" }, body: "" };
  }

  // Semua permintaan API harus berasal dari sesi pemilik yang valid.
  if (!validSession(event)) {
    return json(401, { ok: false, message: "Silakan login terlebih dahulu" });
  }

  if (!["GET", "POST"].includes(event.httpMethod)) {
    return json(405, { ok: false, message: "Method tidak diizinkan" });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  const token = process.env.GAS_API_TOKEN;
  if (!gasUrl || !token) {
    return json(500, { ok: false, message: "Konfigurasi backend belum lengkap" });
  }

  try {
    let response;

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const url = new URL(gasUrl);
      url.searchParams.set("token", token);
      url.searchParams.set("action", params.action || "ping");
      if (params.sheet) url.searchParams.set("sheet", params.sheet);
      response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    } else {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { ok: false, message: "Format JSON tidak valid" });
      }

      payload.token = token;
      response = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json(502, {
        ok: false,
        message: "Respons Google Apps Script bukan JSON",
        upstreamStatus: response.status
      });
    }

    return json(response.ok ? 200 : response.status, data);
  } catch (error) {
    return json(502, { ok: false, message: "Gagal menghubungi Google Apps Script" });
  }
};
