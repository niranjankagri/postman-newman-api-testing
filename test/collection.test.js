import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const collectionPath = new URL(
  "../postman/collections/commerce-api.postman_collection.json",
  import.meta.url,
);

async function loadCollection() {
  return JSON.parse(await readFile(collectionPath, "utf8"));
}

function flattenItems(items) {
  return items.flatMap((item) =>
    Array.isArray(item.item) ? flattenItems(item.item) : [item],
  );
}

test("testCollectionUsesNewmanCompatibleV21Schema", async () => {
  const collection = await loadCollection();
  assert.equal(
    collection.info.schema,
    "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  );
  assert.ok(collection.item.length > 0);
});

test("testCollectionHasUniqueNamedRequestsAndAssertions", async () => {
  const collection = await loadCollection();
  const requests = flattenItems(collection.item);
  const names = requests.map((item) => item.name);

  assert.equal(new Set(names).size, names.length);
  assert.ok(requests.every((item) => item.request && item.event?.length > 0));
  assert.ok(
    requests.every((item) =>
      item.event.some((event) => event.listen === "test" && event.script.exec.length > 0),
    ),
  );
});

test("testLocalEnvironmentContainsOnlySyntheticCredentials", async () => {
  const environmentPath = new URL(
    "../postman/environments/local.postman_environment.json",
    import.meta.url,
  );
  const environment = JSON.parse(await readFile(environmentPath, "utf8"));
  const token = environment.values.find((value) => value.key === "authToken");

  assert.equal(token.value, "local-demo-token");
  assert.equal(token.type, "secret");
  assert.ok(token.enabled);
});

test("testCollectionAndDataFilesArePresent", async () => {
  const dataPath = new URL("../postman/data/customers.csv", import.meta.url);
  const csv = await readFile(dataPath, "utf8");

  assert.match(csv, /^customerName,email,quantity/m);
  assert.equal(fileURLToPath(collectionPath).endsWith(".json"), true);
});
