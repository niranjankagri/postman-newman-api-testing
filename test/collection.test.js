// Safeguards for the Postman files: mistakes that Newman itself wouldn't report.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function readProjectFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const collection = JSON.parse(
  await readProjectFile("postman/collections/commerce-api.postman_collection.json"),
);
const environment = JSON.parse(
  await readProjectFile("postman/environments/local.postman_environment.json"),
);

function flattenItems(items) {
  return items.flatMap((item) => (Array.isArray(item.item) ? flattenItems(item.item) : [item]));
}

const requests = flattenItems(collection.item);

function testScript(request) {
  return request.event.find((event) => event.listen === "test").script.exec.join("\n");
}

function csvRows(text) {
  return text.trim().split("\n").slice(1);
}

describe("Postman files", () => {
  test("TC-151 the collection uses the v2.1 format Newman reads", () => {
    assert.equal(
      collection.info.schema,
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    );
  });

  test("TC-152 request names are unique", () => {
    const names = requests.map((request) => request.name);

    assert.equal(new Set(names).size, names.length);
  });

  test("TC-153 every request has a check with a case ID", () => {
    for (const request of requests) {
      assert.match(testScript(request), /pm\.test\(.TC-\d{3} /, request.name);
    }
  });

  test("TC-154 the only token in the files is the demo one", () => {
    const token = environment.values.find((value) => value.key === "authToken");

    assert.equal(token.value, "local-demo-token");
    assert.equal(token.type, "secret");
    // Requests must use {{authToken}}: a real token pasted into one would be published
    assert.equal(JSON.stringify(collection).includes("local-demo-token"), false);
  });

  test("TC-155 every variable used in a URL or body is defined", () => {
    const csvColumns = ["customerName", "email", "productId", "quantity"];
    const defined = new Set([
      ...collection.variable.map((variable) => variable.key),
      ...environment.values.map((value) => value.key),
      ...csvColumns,
    ]);
    const text = JSON.stringify(collection.item) + JSON.stringify(collection.auth);

    for (const [, name] of text.matchAll(/\{\{(\w+)\}\}/g)) {
      assert.ok(defined.has(name), `{{${name}}} is not defined`);
    }
  });

  test("TC-156 the CSV files have the expected columns and rows", async () => {
    const customers = await readProjectFile("postman/data/customers.csv");
    const invalid = await readProjectFile("postman/data/invalid-orders.csv");

    assert.match(customers, /^customerName,email,quantity\r?\n/);
    assert.match(invalid, /^rule,customerName,email,productId,quantity,expectedError\r?\n/);
    assert.equal(csvRows(customers).length, 2);
    assert.equal(csvRows(invalid).length, 8);
  });
});
