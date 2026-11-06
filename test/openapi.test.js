import assert from "node:assert/strict";
import Ajv from "ajv";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createOpenApiContract } from "../scripts/openapi-contract.js";

const spec = JSON.parse(
  await readFile(new URL("../openapi.json", import.meta.url), "utf8"),
);
const contract = createOpenApiContract(spec);

test("tc-301 accepts a valid health response", () => {
  const result = contract.validateResponse({
    method: "GET",
    url: "http://127.0.0.1:4173/health",
    responseCode: 200,
    body: { status: "ok" },
  });

  assert.equal(result.valid, true);
});

test("tc-302 resolves product schemas and rejects invalid catalog data", () => {
  const valid = contract.validateResponse({
    method: "GET",
    url: "http://127.0.0.1:4173/api/products",
    responseCode: 200,
    body: {
      data: [{ id: "p-100", name: "Trail Backpack", priceCents: 6499, inStock: true }],
    },
  });
  const invalid = contract.validateResponse({
    method: "GET",
    url: "http://127.0.0.1:4173/api/products",
    responseCode: 200,
    body: { data: [{ id: "p-100", priceCents: "6499" }] },
  });

  assert.equal(valid.valid, true);
  assert.equal(invalid.valid, false);
});

test("tc-303 validates an order response through nested schema references", () => {
  const result = contract.validateResponse({
    method: "POST",
    url: "http://127.0.0.1:4173/api/orders",
    responseCode: 201,
    body: {
      data: {
        id: "ord-0001",
        status: "accepted",
        customer: { name: "Taylor Tester", email: "taylor@example.test" },
        items: [{ productId: "p-100", quantity: 2 }],
        totalCents: 12998,
      },
    },
  });

  assert.equal(result.valid, true);
});

test("tc-304 validates error responses using the documented status", () => {
  const result = contract.validateResponse({
    method: "POST",
    url: "http://127.0.0.1:4173/api/orders",
    responseCode: 422,
    body: { error: "Each item quantity must be a positive integer." },
  });

  assert.equal(result.valid, true);
});

test("tc-306 exposes the valid order request schema from the OpenAPI document", () => {
  const validate = new Ajv({ allErrors: true }).compile(contract.getSchema("CreateOrderRequest"));
  const validOrder = {
    customer: { name: "Taylor Tester", email: "taylor@example.test" },
    items: [{ productId: "p-100", quantity: 2 }],
  };
  const invalidOrder = {
    ...validOrder,
    items: [{ productId: "p-100", quantity: 101 }],
  };

  assert.equal(validate(validOrder), true);
  assert.equal(validate(invalidOrder), false);
});

test("tc-305 rejects undocumented routes and response codes", () => {
  const unknownRoute = contract.validateResponse({
    method: "GET",
    url: "http://127.0.0.1:4173/api/unknown",
    responseCode: 404,
    body: { error: "Route not found." },
  });
  const unknownStatus = contract.validateResponse({
    method: "GET",
    url: "http://127.0.0.1:4173/health",
    responseCode: 500,
    body: { error: "Unexpected failure." },
  });

  assert.equal(unknownRoute.valid, false);
  assert.equal(unknownStatus.valid, false);
});
