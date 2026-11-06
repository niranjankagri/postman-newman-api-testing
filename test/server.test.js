import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "../src/server.js";

const TOKEN = "test-token";
let server;
let baseUrl;

before(async () => {
  server = createServer({ token: TOKEN });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

const validOrder = {
  customer: { name: "Taylor Tester", email: "taylor@example.test" },
  items: [{ productId: "p-100", quantity: 2 }],
};

test("testHealthReturnsServiceStatus", async () => {
  const { response, body } = await request("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(body, { status: "ok" });
});

test("testProductCatalogListsAvailableProducts", async () => {
  const { response, body } = await request("/api/products");
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 3);
  assert.equal(body.data[0].id, "p-100");
});

test("testProductLookupReturnsNotFoundForUnknownProduct", async () => {
  const { response, body } = await request("/api/products/missing");
  assert.equal(response.status, 404);
  assert.equal(body.error, "Product not found.");
});

test("testOrderRequiresBearerToken", async () => {
  const { response, body } = await request("/api/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validOrder),
  });
  assert.equal(response.status, 401);
  assert.equal(body.error, "Bearer token is required.");
});

test("testOrderRejectsInvalidBearerToken", async () => {
  const { response, body } = await request("/api/orders", {
    method: "POST",
    headers: {
      authorization: "Bearer wrong-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(validOrder),
  });
  assert.equal(response.status, 403);
  assert.equal(body.error, "Bearer token is invalid.");
});

test("testOrderValidatesRequiredCustomerAndItems", async () => {
  const { response, body } = await request("/api/orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...validOrder, items: [] }),
  });
  assert.equal(response.status, 422);
  assert.equal(body.error, "Order must contain at least one item.");
});

test("testOrderRejectsUnavailableProduct", async () => {
  const { response, body } = await request("/api/orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...validOrder,
      items: [{ productId: "p-300", quantity: 1 }],
    }),
  });
  assert.equal(response.status, 422);
  assert.equal(body.error, "Product p-300 is unavailable.");
});

test("testOrderRejectsMalformedJson", async () => {
  const { response, body } = await request("/api/orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: "{invalid-json",
  });
  assert.equal(response.status, 400);
  assert.equal(body.error, "Request body must be valid JSON.");
});

test("testOrderCreatesAndReadsBackAcceptedOrder", async () => {
  const created = await request("/api/orders", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(validOrder),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.status, "accepted");
  assert.equal(created.body.data.totalCents, 12998);

  const readback = await request(`/api/orders/${created.body.data.id}`, {
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(readback.response.status, 200);
  assert.deepEqual(readback.body.data, created.body.data);
});
