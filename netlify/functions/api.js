// Aforte Visuals Manager - Netlify Function
// Simpan GAS_WEB_APP_URL dan GAS_API_TOKEN di Netlify Environment Variables.
// Jangan pernah menaruh token di frontend.

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (!["GET", "POST"].includes(event.httpMethod)) {
    return json(405, { ok: false, error: "Metode tidak diizinkan." }, headers);
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  const token = process.env.GAS_API_TOKEN;

  if (!gasUrl || !token) {
    return json(500, {
      ok: false,
      error: "Konfigurasi backend belum lengkap di Netlify."
    }, headers);
  }

  try {
    let response;

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const url = new URL(gasUrl);

      url.searchParams.set("token", token);
      url.searchParams.set("action", params.action || "ping");

      if (params.sheet) {
        url.searchParams.set("sheet", params.sheet);
      }

      response = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow"
      });
    } else {
      let payload = {};
      try {
        payload = event.body ? JSON.parse(event.body) : {};
      } catch (_) {
        return json(400, { ok: false, error: "Format JSON tidak valid." }, headers);
      }

      // Token selalu ditambahkan di server, bukan dari browser.
      payload.token = token;

      response = await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
    }

    const responseText = await response.text();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      result = {
        ok: false,
        error: "Respons backend bukan JSON yang valid.",
        detail: responseText.slice(0, 500)
      };
    }

    return {
      statusCode: response.ok ? 200 : response.status,
      headers,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return json(502, {
      ok: false,
      error: "Tidak dapat menghubungi Google Apps Script.",
      detail: error.message
    }, headers);
  }
};

function json(statusCode, data, headers) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data)
  };
}
