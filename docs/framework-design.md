# Framework design

Why the project is built the way it is. The README says what it does and how to run it.

## 1. Goals

1. Show a Postman collection a team could really use: versioned in Git, reviewed like code, and run on every push.
2. Keep it self-contained: no Postman account, no shared environment, no secret.
3. Make a pass mean something: a skipped folder, an empty data file or a changed response must fail.

## 2. The parts

| Part | Role | Tools |
|---|---|---|
| `src/` | The API under test | Node.js `http`, no runtime dependencies |
| `postman/collections/` | The requests and functional assertions | Postman Collection v2.1 |
| `openapi.json` | The API request and response contract | OpenAPI 3.0 |
| `scripts/openapi-contract.js` | Resolves and validates response schemas | Ajv |
| `postman/environments/` | Local address and demo tokens | Postman environment |
| `postman/data/` | Test data for the two runs | CSV |
| `scripts/run-newman.js` | Starts the API, runs the collection twice, decides | Newman as a library |
| `test/` | API tests and checks on the Postman files | `node:test` |

## 3. The API is split by job

`catalog.js` holds the products, `orders.js` the rules and the store, `http.js` the JSON helpers, and `server.js` only the
routes and the token check. A route says what happens, and anything that goes wrong is thrown as an `HttpError`, so one
`catch` turns every failure into an answer.

## 4. Newman as a library

`run-newman.js` calls `newman.run()` instead of the command line, because it has to:

- start the API on a free port and pass that address in, so two runs can't collide
- run the collection twice with different data
- validate each Newman response against OpenAPI by method, path and status
- decide the result from failed assertions, contract failures and expected counts

## 5. Two runs, because a run has one data file

Newman takes one CSV file per run and repeats everything for each row. The main flow runs once per customer. The order
rules are one request with 8 rows, so they run on their own with `--folder`: otherwise each customer would repeat them,
and each rule would repeat the whole flow.

## 6. Checks that can't be forgotten

`TC-200` sits on the collection, so it runs after every request: the answer is JSON, marked `no-store`, and under a second.
A new request gets it automatically.

`openapi.json` is the single source for request and response schemas. The Newman runner resolves its order response schema into the collection at runtime, so `TC-232` and `TC-234` use the contract without a second checked-in copy. It also listens for every response, matches method, path and status, and validates the JSON body. `additionalProperties: false` makes unexpected fields fail the run. Opening the collection directly in Postman runs the functional assertions; `npm run test:collection` supplies the OpenAPI schema checks.

The expected total in `TC-231` comes from the catalog's answer earlier in the run, not from a price copied into the test.

OpenAPI validation only sees responses that happen, so a documented response nobody produces would stay unchecked. The first
version had two: `413` on orders and `403` on reading an order. `TC-224` and `TC-237` now produce them, and the runner fails if
any of the 14 documented responses isn't seen in a run. Requests aren't validated against the file: `CreateOrderRequest` is
used only in `TC-306`.

## 7. A pass that means something

Newman counts only the checks that ran. If a folder were renamed, or a CSV file emptied, it would report fewer checks and
no failures. So `run-newman.js` holds the expected assertion count for each run, and a different number fails the build.
The cost is one number to update when a check is added, and that's on purpose.

`test/collection.test.js` covers what Newman can't see: a request with no case ID, an undefined `{{variable}}`, or a token
pasted into a request. An undefined variable is an easy miss, because Postman sends it as literal text and a negative test
can then pass for the wrong reason.

## 8. What the work found

**One request stopped the server.** `new URL("//", base)` throws, and it ran outside any `try`, so `GET //` ended the
process. `parseUrl` now answers `400`, and the whole handler sits in a `try`, so an unexpected error answers `500` and the
server keeps running (`TC-142`).

**A huge quantity broke the total.** `1e308` passes `Number.isInteger`, the total overflows to `Infinity`, and JSON writes
that as `null`. Quantity is now limited to 100 (`TC-131`, `TC-132`, `TC-241`).

**A check that couldn't fail.** The first version of the file test asserted that a fixed path ended in `.json`. It now
checks the columns and the row counts of both CSV files.

## 9. How I know the tests can fail

I put 14 bugs in on purpose and ran both layers against each. All were caught.

| Bug | Unit tests | Newman and OpenAPI |
|---|---|---|
| URL guard removed | TC-142 | Not caught |
| No quantity limit | TC-131 | TC-241 |
| Any Bearer token accepted | TC-112 | TC-222 |
| Total ignores the quantity | TC-122, TC-132 | TC-231 |
| Missing token answers 403 | TC-111, TC-113, TC-114 | TC-221, TC-223 |
| `no-store` header removed | TC-143 | TC-200 |
| Order IDs repeat | TC-124 | Not caught |
| Email not checked | TC-131 | TC-241 |
| Name not trimmed | TC-123 | Not caught |
| Out-of-stock product sold | TC-131 | TC-241 |
| Orders readable without a token | TC-113 | TC-223 |
| An extra field in the order | Not caught | Rejected by the OpenAPI order schema |
| An order changes after creation | TC-121 | TC-233, TC-234 |
| Rules CSV emptied | TC-156 | Expected count |

So the API tests and Newman run cover different cases, and the OpenAPI schema catches contract drift such as an unexpected field.

Seven more bugs went in after OpenAPI validation was added, and all failed the run: an extra order field, a price sent as text
(only OpenAPI noticed), a product losing a field, a renamed error key, an undocumented status, an extra field on health, and
the order schema not being supplied to the collection. The lint is proven too: a spec with a missing version and a broken `$ref`
failed the CI step with 2 errors.

## 10. Limits

- The collection runs on localhost with one user, so it says nothing about load. My
  [JMeter project](https://github.com/niranjankagri/jmeter-performance-testing) covers that.
- A schema proves the shape of this API's answers, not that a consumer still works. My
  [Pact project](https://github.com/niranjankagri/pact-contract-testing) covers consumer contracts.
- `TC-200`'s one-second limit is a sanity check, not a performance test.
- `npm audit` still lists 11 packages inside Newman 6.2.3, the newest release. Overrides cleared the critical one and 7
  others without breaking anything; the rest need major versions that only Newman can adopt. They're development-only.
