# Postman + Newman API Testing

A self-contained API automation showcase built around a versioned Postman collection and Newman. The collection runs against a small local commerce API, so a test run needs no external account, API key, or public test service.

## What it demonstrates

- A Postman collection with reusable base URL and bearer-token variables.
- Positive and negative checks for the product catalog and order API.
- Authentication failures, invalid quantities, unavailable products, and response contracts.
- CSV-driven customer and quantity variations through Newman iterations.
- Collection chaining: create an order, save its ID, then read it back.
- JUnit output suitable for CI, plus Newman’s readable CLI report.
- A small Node.js API with no runtime dependencies; each server process starts with an empty in-memory order store.

## Requirements

- Node.js 22.19 or newer and npm.
- Newman 6.2.3 is installed as a project development dependency by `npm ci`.

## Run the checks

```sh
npm ci
npm test
npm run test:collection
npm run test:ci
```

`npm test` runs the API route and collection-structure tests. `npm run test:collection` starts the API on an available local port, runs two CSV data iterations through Newman, and writes JUnit output to `artifacts/reports/newman-junit.xml`. The API process is stopped when the run finishes. Generated reports are ignored by Git.

To inspect the API manually, start it in one terminal and use the Postman collection in the Postman app or Newman in another:

```sh
npm start
npm exec -- newman run postman/collections/commerce-api.postman_collection.json \
  --environment postman/environments/local.postman_environment.json \
  --iteration-data postman/data/customers.csv \
  --reporters cli,junit \
  --reporter-junit-export artifacts/reports/newman-junit.xml
```

The standalone command uses the local environment's synthetic `local-demo-token`. It is only a fake credential for this local demo API; do not replace it with a real secret in a committed file.

## API surface

| Method | Endpoint | Behavior |
|---|---|---|
| `GET` | `/health` | Readiness response |
| `GET` | `/api/products` | Product catalog |
| `GET` | `/api/products/:id` | Product lookup or `404` |
| `POST` | `/api/orders` | Authenticated order creation; validates customer, product, and quantity |
| `GET` | `/api/orders/:id` | Authenticated order readback or `404` |

Orders exist only in the current server process. The API binds to `127.0.0.1` by default and uses the local demo token unless `DEMO_API_TOKEN` is set. Set `PORT` to select a port when running `npm start`.

## Import the collection into Postman

1. Import `postman/collections/commerce-api.postman_collection.json`.
2. Import `postman/environments/local.postman_environment.json`.
3. Start the API with `npm start` and select **Local Demo API**.
4. Run the collection with `postman/data/customers.csv` as iteration data.

The collection is exported in Postman Collection **v2.1 JSON**, the format supported by Newman. Newman does not run the newer v3 YAML collection format, so keep this export in v2.1 when running locally or in CI. See [Postman’s collection format notes](https://learning.postman.com/docs/use/use-collections/collections-schemas/) and [Newman documentation](https://github.com/postmanlabs/newman).

## Project layout

```text
src/server.js                                      Local demo commerce API
test/server.test.js                                API route and behavior checks
test/collection.test.js                            Collection and fixture safeguards
postman/collections/commerce-api.postman_collection.json
postman/environments/local.postman_environment.json
postman/data/customers.csv                         Newman iteration data
scripts/run-newman.js                              Isolated API + Newman runner
```

## License

MIT. See [LICENSE](LICENSE).
