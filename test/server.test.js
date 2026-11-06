// The API's behaviour, tested over real HTTP. The test names start with their case ID from
// docs/manual-test-cases.md.

import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { anOrder, startApi, TOKEN } from "./support/api.js";

let api;
let client;

before(async () => {
  api = await startApi();
  client = api.client;
});

after(() => api.stop());

describe("Health and catalog", () => {
  test("TC-101 health answers ok", async () => {
    const { status, body } = await client.get("/health");

    assert.equal(status, 200);
    assert.deepEqual(body, { status: "ok" });
  });

  test("TC-102 the catalog lists all products", async () => {
    const { status, body } = await client.get("/api/products");

    assert.equal(status, 200);
    assert.deepEqual(
      body.data.map((product) => product.id),
      ["p-100", "p-200", "p-300"],
    );
  });

  test("TC-103 a product is found by its ID", async () => {
    const { status, body } = await client.get("/api/products/p-200");

    assert.equal(status, 200);
    assert.equal(body.data.name, "Insulated Bottle");
  });

  test("TC-104 an unknown product is 404", async () => {
    const { status, body } = await client.get("/api/products/missing");

    assert.equal(status, 404);
    assert.equal(body.error, "Product not found.");
  });
});

describe("Access", () => {
  test("TC-111 an order without a token is 401", async () => {
    const { status, body } = await client.postOrder(anOrder(), { token: null });

    assert.equal(status, 401);
    assert.equal(body.error, "Bearer token is required.");
  });

  test("TC-112 an order with a wrong token is 403", async () => {
    const { status, body } = await client.postOrder(anOrder(), { token: "wrong-token" });

    assert.equal(status, 403);
    assert.equal(body.error, "Bearer token is invalid.");
  });

  test("TC-113 reading an order needs a token too", async () => {
    const { status } = await client.get("/api/orders/ord-0001");

    assert.equal(status, 401);
  });

  test("TC-114 the token is checked before the body", async () => {
    // A bad body with no token must say 401, not reveal the validation rules
    const { status } = await client.postOrder("{invalid-json", { token: null });

    assert.equal(status, 401);
  });
});

describe("Orders", () => {
  test("TC-121 an order is created and can be read back", async () => {
    const created = await client.postOrder(anOrder());

    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, "accepted");

    const readBack = await client.get(`/api/orders/${created.body.data.id}`, { token: TOKEN });

    assert.equal(readBack.status, 200);
    assert.deepEqual(readBack.body.data, created.body.data);
  });

  test("TC-122 the total adds up every item", async () => {
    const order = anOrder({
      items: [
        { productId: "p-100", quantity: 2 },
        { productId: "p-200", quantity: 3 },
      ],
    });

    const { body } = await client.postOrder(order);

    assert.equal(body.data.totalCents, 2 * 6499 + 3 * 2499);
  });

  test("TC-123 the customer's name is stored without outer spaces", async () => {
    const { body } = await client.postOrder(anOrder({ customer: { name: "  Asha  " } }));

    assert.equal(body.data.customer.name, "Asha");
  });

  test("TC-124 each new order gets its own ID", async () => {
    const first = await client.postOrder(anOrder());
    const second = await client.postOrder(anOrder());

    assert.notEqual(first.body.data.id, second.body.data.id);
  });

  test("TC-125 an unknown order is 404", async () => {
    const { status, body } = await client.get("/api/orders/ord-9999", { token: TOKEN });

    assert.equal(status, 404);
    assert.equal(body.error, "Order not found.");
  });
});

describe("Order rules", () => {
  const item = (fields) => anOrder({ items: [fields] });
  const invalidOrders = [
    ["a body that is a list", [], "Order body must be a JSON object."],
    ["a body that is null", null, "Order body must be a JSON object."],
    ["no items", anOrder({ items: [] }), "Order must contain at least one item."],
    ["no customer", { items: [{}] }, "Customer name must contain at least 2 characters."],
    ["a one-letter name", anOrder({ customer: { name: "A" } }), "Customer name must contain at least 2 characters."],
    ["a name of spaces", anOrder({ customer: { name: "    " } }), "Customer name must contain at least 2 characters."],
    ["an email without @", anOrder({ customer: { email: "taylor" } }), "Customer email must be valid."],
    ["no productId", item({ quantity: 1 }), "Each item must include a productId."],
    ["an item of null", anOrder({ items: [null] }), "Each item must include a productId."],
    ["quantity 0", item({ productId: "p-100", quantity: 0 }), "Each item quantity must be a positive integer."],
    ["quantity 1.5", item({ productId: "p-100", quantity: 1.5 }), "Each item quantity must be a positive integer."],
    ["quantity as text", item({ productId: "p-100", quantity: "2" }), "Each item quantity must be a positive integer."],
    ["quantity 101", item({ productId: "p-100", quantity: 101 }), "Each item quantity must be 100 or less."],
    ["an unknown product", item({ productId: "p-999", quantity: 1 }), "Product p-999 is unavailable."],
    ["a product out of stock", item({ productId: "p-300", quantity: 1 }), "Product p-300 is unavailable."],
  ];

  for (const [name, order, message] of invalidOrders) {
    test(`TC-131 refused: ${name}`, async () => {
      const { status, body } = await client.postOrder(order);

      assert.equal(status, 422);
      assert.equal(body.error, message);
    });
  }

  test("TC-132 the largest quantity is accepted, with an exact total", async () => {
    const { status, body } = await client.postOrder(item({ productId: "p-100", quantity: 100 }));

    assert.equal(status, 201);
    assert.equal(body.data.totalCents, 649900);
  });

  test("TC-133 broken JSON is 400", async () => {
    const { status, body } = await client.postOrder("{invalid-json");

    assert.equal(status, 400);
    assert.equal(body.error, "Request body must be valid JSON.");
  });

  test("TC-134 a body over 64 KB is 413", async () => {
    const { status, body } = await client.postOrder("x".repeat(65 * 1024));

    assert.equal(status, 413);
    assert.equal(body.error, "Request body is too large.");
  });
});

describe("Bad requests", () => {
  test("TC-141 an unknown route is 404", async () => {
    const { status, body } = await client.get("/api/unknown");

    assert.equal(status, 404);
    assert.equal(body.error, "Route not found.");
  });

  test("TC-142 a path that isn't a valid URL is 400 and the API keeps running", async () => {
    const { status } = await client.get("//");
    const health = await client.get("/health");

    assert.equal(status, 400);
    assert.equal(health.status, 200);
  });

  test("TC-143 every answer is JSON that nothing may cache", async () => {
    const { headers } = await client.get("/api/products/missing");

    assert.match(headers.get("content-type"), /^application\/json/);
    assert.equal(headers.get("cache-control"), "no-store");
  });
});
