# API testing with Postman and Newman

[![CI](https://github.com/niranjankagri/postman-newman-api-testing/actions/workflows/ci.yml/badge.svg)](https://github.com/niranjankagri/postman-newman-api-testing/actions/workflows/ci.yml)

A versioned **Postman** collection, run by **Newman** in CI against a small commerce API that lives in this repository.
Every run starts its own copy of the API on a free port, so nothing outside the job is needed. Node.js 22, Newman 6.

| | |
|---|---|
| Collection | 11 requests in 4 folders, plus one data-driven request for the order rules |
| Checks | 64 Newman assertions per run, plus OpenAPI validation for every response |
| Data | Two CSV files: customers for the main flow, one row per rule for the invalid orders |
| Unit tests | 46 API, file and contract-validator checks with `node:test` |
| Reports | JUnit XML for each run, and a results table in every CI run summary |
| Found | A `GET //` request crashed the whole API, and a huge quantity made the order total `null`. Both are fixed |

## What is tested

| Layer | Where | Tests |
|---|---|---:|
| API behaviour | `test/server.test.js` | 34 |
| OpenAPI validator | `test/openapi.test.js` | 6 |
| Postman files | `test/collection.test.js` | 6 |
| Main flow | Collection, `customers.csv` (2 iterations, 22 requests) | 48 assertions |
| Order rules | Collection, `invalid-orders.csv` (8 iterations) | 16 assertions |

Every test and `pm.test` name starts with its case ID, and each case is written out in
[docs/manual-test-cases.md](docs/manual-test-cases.md).

The checks overlap on purpose. The API tests reach cases the collection can't easily send, such as a 65 KB body. The
collection remains easy to open and extend in Postman. `openapi.json` defines the schemas once; during Newman runs, the
runner injects the resolved order schema for the collection's contract assertions and validates every response against
the documented operation and status.

## Run it

```
npm ci
npm run test:ci          unit tests, then the collection
npm test                 unit tests only
npm run test:collection  the collection only
```

The results table, including OpenAPI contract failures, is printed at the end and saved as `artifacts/reports/summary.md`, next to the JUnit files. `npm run test:collection` performs the full contract validation; running the collection directly in Postman runs its functional assertions.

## Use it in Postman

1. Import `postman/collections/commerce-api.postman_collection.json` and
   `postman/environments/local.postman_environment.json`, then select **Local Demo API**.
2. Start the API with `npm start`.
3. Run the folders Health to Orders with `postman/data/customers.csv`, and the Order rules folder with
   `postman/data/invalid-orders.csv`.

The same runs from the command line, with the API started by `npm start`:

```
npm exec -- newman run postman/collections/commerce-api.postman_collection.json \
  --environment postman/environments/local.postman_environment.json \
  --iteration-data postman/data/invalid-orders.csv --folder "Order rules"
```

The token in the environment file is a made-up value for this local API. The full OpenAPI response contract is checked by `npm run test:collection` using [`openapi.json`](openapi.json).

## The API under test

| Method | Endpoint | Behaviour |
|---|---|---|
| `GET` | `/health` | Readiness |
| `GET` | `/api/products`, `/api/products/:id` | The catalog; `404` for an unknown product |
| `POST` | `/api/orders` | Needs a token; checks customer, product and quantity (1 to 100) |
| `GET` | `/api/orders/:id` | Needs a token; `404` for an unknown order |

Orders live only in memory, and each server starts empty.

## Design

| Pattern | Where | Why |
|---|---|---|
| Client object | `ApiClient` (tests) | Paths and headers in one place; tests read as behaviour |
| Test data builder | `anOrder()` (tests) | A test states only the value it's about |
| Data-driven tests | `invalid-orders.csv` | A new rule is a new row, not a new request |
| Collection-level checks | `TC-200` | Rules for every answer run on every request, including new ones |
| Request chaining | Collection variables | Later requests use the IDs and prices earlier ones returned |
| Expected counts | `run-newman.js` | A skipped folder or empty CSV can't pass quietly |

The API request and response schemas are defined in [`openapi.json`](openapi.json) and validated during Newman runs. The runner supplies the collection's order schema from this document at runtime; the checked-in collection does not duplicate it. More in [docs/framework-design.md](docs/framework-design.md).

## Documents

- [Framework design](docs/framework-design.md): the decisions, and what the work found
- [Manual test cases](docs/manual-test-cases.md): every case in plain language, by ID
- [OpenAPI contract](openapi.json): endpoint, request and response schemas
- [Interview questions](docs/interview-questions.md) ([PDF](docs/interview-questions.pdf)): 60 questions on API testing,
  Postman and Newman, answered with this project

## What this does not prove

The API is built for this project, so its bugs and limits are this demo's. The collection runs on localhost with one user
at a time, which says nothing about load or real network behaviour. `npm audit` still lists 11 packages inside Newman 6.2.3,
the newest release: they're development-only and run a collection I wrote, and the fixes need Newman itself to update.

## License

[MIT](LICENSE)
