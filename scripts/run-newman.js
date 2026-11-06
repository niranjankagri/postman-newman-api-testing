// Starts a private copy of the API on a free port, runs the collection against it with Newman,
// and exits with 1 if anything failed. "npm run test:collection" runs this file.
//
// The collection runs twice, because each part needs its own CSV file:
//   the main flow     with customers.csv: one pass through the folders per customer
//   the order rules   with invalid-orders.csv: one request, one row per rule

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import newman from "newman";
import { createServer } from "../src/server.js";
import { createOpenApiContract } from "./openapi-contract.js";
import { renderHtmlReport } from "./html-report.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reports = resolve(root, "artifacts/reports");
const token = process.env.DEMO_API_TOKEN || "local-demo-token";

const RUNS = [
  {
    name: "main-flow",
    folder: ["Health", "Product catalog", "Access", "Orders"],
    data: "postman/data/customers.csv",
    expectedAssertions: 56,
  },
  {
    name: "order-rules",
    folder: ["Order rules"],
    data: "postman/data/invalid-orders.csv",
    expectedAssertions: 16,
  },
];

function listen(server) {
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", fail);
      done(server.address());
    });
  });
}

function close(server) {
  return new Promise((done, fail) => {
    server.close((error) => (error ? fail(error) : done()));
    server.closeAllConnections();
  });
}

function runCollection(run, baseUrl, contract, collection, seen) {
  return new Promise((done, fail) => {
    const contractFailures = [];
    const runner = newman.run(
      {
        collection,
        environment: resolve(root, "postman/environments/local.postman_environment.json"),
        // These two replace the environment file's values: the port is new on each run
        envVar: [
          { key: "baseUrl", value: baseUrl },
          { key: "authToken", value: token },
        ],
        folder: run.folder,
        iterationData: resolve(root, run.data),
        reporters: ["cli", "junit"],
        reporter: { junit: { export: resolve(reports, "newman-" + run.name + ".xml") } },
        timeoutRequest: 5_000,
        timeoutScript: 5_000,
      },
      (error, summary) => {
        if (error) {
          fail(error);
        } else {
          done({ summary, contractFailures });
        }
      },
    );

    // Newman emits this after each response, so every observed status and body is checked
    // against the corresponding OpenAPI operation and response schema.
    runner.on("request", (error, args) => {
      if (error) {
        contractFailures.push(error.message);
        return;
      }

      try {
        const body = JSON.parse(args.response.stream.toString("utf8"));
        const validation = contract.validateResponse({
          method: args.request.method,
          url: args.request.url.toString(),
          responseCode: args.response.code,
          body,
        });
        if (validation.valid) {
          seen.add(validation.documented);
        } else {
          contractFailures.push(
            args.request.method + " " + args.request.url + " HTTP " +
              args.response.code + ": " + validation.message,
          );
        }
      } catch (validationError) {
        contractFailures.push(
          args.request.method + " " + args.request.url + ": " + validationError.message,
        );
      }
    });
  });
}

// Newman counts only checks that ran, so an expected assertion count catches skipped folders.
function problems(run, stats, failures, contractFailures) {
  const found = [];
  if (failures > 0) {
    found.push(failures + " Newman failures");
  }
  if (contractFailures > 0) {
    found.push(contractFailures + " OpenAPI contract failures");
  }
  if (stats.assertions.total !== run.expectedAssertions) {
    found.push(stats.assertions.total + " assertions ran, expected " + run.expectedAssertions);
  }
  return found;
}

function summaryTable(results) {
  const rows = results.map(
    ({ name, stats, contractFailures, found }) =>
      "| " + name + " | " + stats.iterations.total + " | " + stats.requests.total + " | " +
      stats.assertions.total + " | " + stats.assertions.failed + " | " + contractFailures +
      " | " + (found.length ? found.join(", ") : "passed") + " |",
  );
  return [
    "| Run | Iterations | Requests | Assertions | Failed | Contract failures | Result |",
    "|---|---:|---:|---:|---:|---:|---|",
    ...rows,
    "",
  ].join("\n");
}

const server = createServer({ token });

try {
  await mkdir(reports, { recursive: true });
  const { port } = await listen(server);
  const contractPath = resolve(root, "openapi.json");
  const contract = createOpenApiContract(JSON.parse(await readFile(contractPath, "utf8")));
  const collectionPath = resolve(root, "postman/collections/commerce-api.postman_collection.json");
  const collection = JSON.parse(await readFile(collectionPath, "utf8"));
  const orderSchema = collection.variable.find((variable) => variable.key === "orderSchema");
  if (!orderSchema) {
    throw new Error("The collection must define an orderSchema variable for OpenAPI injection.");
  }
  orderSchema.value = JSON.stringify(contract.getSchema("OrderResponse"));

  // A response that is documented but never produced is never checked against the contract
  const seen = new Set();
  const results = [];
  for (const run of RUNS) {
    const { summary, contractFailures } = await runCollection(
      run,
      "http://127.0.0.1:" + port,
      contract,
      collection,
      seen,
    );
    for (const failure of contractFailures) {
      console.error("OpenAPI contract failure: " + failure);
    }
    results.push({
      name: run.name,
      stats: summary.run.stats,
      contractFailures: contractFailures.length,
      contractFailureMessages: [...contractFailures],
      newmanFailures: summary.run.failures.map(({ source: failedRequest, error }) => ({
        name: failedRequest?.name ?? "Unnamed assertion",
        message: error?.message ?? String(error),
      })),
      found: problems(
        run,
        summary.run.stats,
        summary.run.failures.length,
        contractFailures.length,
      ),
    });
  }

  const documented = contract.documentedResponses();
  const neverSeen = documented.filter((response) => !seen.has(response));
  const coverage =
    "Documented responses seen: " + (documented.length - neverSeen.length) + " of " + documented.length +
    (neverSeen.length ? " (missing: " + neverSeen.join(", ") + ")" : "") + "\n";
  const report = summaryTable(results) + "\n" + coverage;

  await writeFile(resolve(reports, "summary.md"), report);
  await writeFile(
    resolve(reports, "newman-report.html"),
    renderHtmlReport(results, coverage.trim()),
  );
  console.log(report);
  if (neverSeen.length > 0 || results.some((result) => result.found.length > 0)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server.listening) {
    await close(server);
  }
}
