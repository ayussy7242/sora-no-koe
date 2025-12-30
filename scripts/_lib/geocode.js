"use strict";

async function geocodePlace(place, apiKey) {
  if (!apiKey) return { ok: false, status: "NO_API_KEY" };
  const q = String(place || "").trim();
  if (!q) return { ok: false, status: "EMPTY_PLACE" };

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}` +
    `&key=${apiKey}&language=ja`;

  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.length) {
    return { ok: false, status: json.status, candidates: json.results?.slice(0, 3) ?? [] };
  }

  const top = json.results[0];
  return {
    ok: true,
    lat: top.geometry.location.lat,
    lon: top.geometry.location.lng,
    formatted: top.formatted_address,
    place_id: top.place_id,
  };
}

module.exports = { geocodePlace };
