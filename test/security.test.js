// Security regressions for authentication boundaries and safe HTTP responses.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { startApi, TOKEN } from "./support/api.js";

let api;

before(async () => {
  api = await startApi();
});

after(() => api.stop());

describe("API security", () => {
  test("TC-161 rejects non-Bearer credentials without reflecting them", async () => {
    const credential = "qa-secret-not-for-response";
    const response = await fetch(api.client.baseUrl + "/api/orders/ord-0001", {
      headers: { authorization: "Basic " + credential },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.deepEqual(body, { error: "Bearer token is invalid." });
    assert.equal(JSON.stringify(body).includes(credential), false);
  });

  test("TC-162 does not accept an access token from the URL", async () => {
    const response = await fetch(
      api.client.baseUrl + "/api/orders/ord-0001?access_token=" + encodeURIComponent(TOKEN),
    );
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.deepEqual(body, { error: "Bearer token is required." });
    assert.equal(JSON.stringify(body).includes(TOKEN), false);
  });

  test("TC-163 sends safe JSON headers on successful and error responses", async () => {
    const responses = await Promise.all([
      fetch(api.client.baseUrl + "/health"),
      fetch(api.client.baseUrl + "/api/unknown"),
    ]);

    for (const response of responses) {
      assert.match(response.headers.get("content-type"), /^application\/json/);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    }

    assert.deepEqual(await responses[0].json(), { status: "ok" });
    assert.deepEqual(await responses[1].json(), { error: "Route not found." });
  });
});
