# Manual test cases

The test cases this project automates, written out so a tester can read, review or extend them without reading the code.
Every case has an ID, and the test that covers it starts with the same ID. A failure in a report leads straight to the
case below.

| ID range | Area | Automated in |
|---|---|---|
| TC-101 to TC-104 | Health and catalog | `test/server.test.js` |
| TC-111 to TC-114 | Access | `test/server.test.js` |
| TC-121 to TC-125 | Orders | `test/server.test.js` |
| TC-131 to TC-134 | Order rules | `test/server.test.js` |
| TC-141 to TC-143 | Bad requests | `test/server.test.js` |
| TC-151 to TC-156 | Postman files | `test/collection.test.js` |
| TC-301 to TC-307 | OpenAPI validator | `test/openapi.test.js` |
| TC-200 to TC-241 | The collection | `commerce-api.postman_collection.json` |

## How to run one case

```
node --test --test-name-pattern="TC-142" "test/*.test.js"
```

For a collection case, open the request in Postman and press Send, or run its folder with `--folder`.

## Health and catalog

| ID | Action | Expected |
|---|---|---|
| TC-101 | `GET /health` | `200`, `{"status":"ok"}` |
| TC-102 | `GET /api/products` | `200`; `p-100`, `p-200`, `p-300` |
| TC-103 | `GET /api/products/p-200` | `200`, Insulated Bottle |
| TC-104 | `GET /api/products/missing` | `404`, `Product not found.` |

## Access

| ID | Action | Expected |
|---|---|---|
| TC-111 | Post an order with no token | `401`, `Bearer token is required.` |
| TC-112 | Post an order with a wrong token | `403`, `Bearer token is invalid.` |
| TC-113 | Read an order with no token | `401` |
| TC-114 | Post broken JSON with no token | `401`: the token is checked first |

## Orders

| ID | Action | Expected |
|---|---|---|
| TC-121 | Post a valid order, then read it | `201`, status `accepted`; the read answer equals the created order |
| TC-122 | Order 2 of `p-100` and 3 of `p-200` | Total is 2 x 6499 + 3 x 2499 |
| TC-123 | Order with the name `"  Asha  "` | Stored as `Asha` |
| TC-124 | Post two orders | Different IDs |
| TC-125 | Read `ord-9999` | `404`, `Order not found.` |

## Order rules

| ID | Action | Expected |
|---|---|---|
| TC-131 | Post each of: a list, `null`, no items, no customer, a one-letter name, a name of spaces, an email without `@`, no `productId`, an item of `null`, quantity 0, 1.5, `"2"` or 101, an unknown product, a product out of stock (one run each) | `422` with that rule's message |
| TC-132 | Order quantity 100 of `p-100` | `201`, total 649900 |
| TC-133 | Post `{invalid-json` | `400`, `Request body must be valid JSON.` |
| TC-134 | Post a 65 KB body | `413`, `Request body is too large.` |

## Bad requests

| ID | Action | Expected |
|---|---|---|
| TC-141 | `GET /api/unknown` | `404`, `Route not found.` |
| TC-142 | `GET //`, then `GET /health` | `400`, then `200`: the API is still running |
| TC-143 | Any request | `Content-Type` is JSON, `Cache-Control` is `no-store` |

## Postman files

| ID | Check | Expected |
|---|---|---|
| TC-151 | The collection's schema | Postman Collection v2.1 |
| TC-152 | Request names | All different |
| TC-153 | Every request's test script | At least one `pm.test` with a case ID |
| TC-154 | Tokens in the files | Only the demo token, only in the environment file, marked secret |
| TC-155 | Every `{{variable}}` in a URL, body or auth setting | Defined in the collection, the environment or a CSV file |
| TC-156 | The two CSV files | Expected columns; 2 and 8 rows |

## OpenAPI validator

| ID | Check | Expected |
|---|---|---|
| TC-301 | A valid health answer | Accepted |
| TC-302 | A valid catalog, then one with a missing name and a text price | Accepted, then refused |
| TC-303 | A valid order, through nested schema references | Accepted |
| TC-304 | An error answer with a documented status | Accepted |
| TC-305 | An undocumented route, then an undocumented status | Both refused |
| TC-306 | The request schema with quantity 2, then 101 | Accepted, then refused |
| TC-307 | The list of documented responses | 14, including `413` on orders and `403` on reading an order |

During a Newman run, every response is also checked against `openapi.json`, and the run fails if a documented response never
appears.

## The collection

| ID | Request | Expected |
|---|---|---|
| TC-200 | Every request | JSON, `no-store`, under 1 second |
| TC-201 | `GET service health` | `200`, `{"status":"ok"}` |
| TC-211 | `GET products and save a product ID` | `200`, products with all four fields; saves the first ID and price |
| TC-212 | `GET product by saved ID` | `200`, the saved product |
| TC-213 | `GET unknown product` | `404` |
| TC-221 | `POST order without a token` | `401` |
| TC-222 | `POST order with an invalid token` | `403` |
| TC-223 | `GET order without a token` | `401` |
| TC-224 | `GET order with an invalid token` | `403` |
| TC-231 | `POST create order from CSV data` | `201`; name and email from the CSV row; total = saved price x quantity |
| TC-232 | The same answer | Matches the OpenAPI order schema, with no extra fields (runs under `npm run test:collection`, which supplies the schema) |
| TC-233 | `GET read created order` | `200`, equal to the created order |
| TC-234 | The same answer | Matches the OpenAPI order schema (same condition) |
| TC-235 | `GET unknown order` | `404` |
| TC-236 | `POST broken JSON` | `400` |
| TC-237 | `POST oversized body` | `413` |
| TC-241 | `POST invalid order from CSV data`, once per row of `invalid-orders.csv` | `422` with the row's `expectedError` |
