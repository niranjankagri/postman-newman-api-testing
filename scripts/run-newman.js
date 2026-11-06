// Starts a private copy of the API on a free port, runs the collection against it with Newman,
// and exits with 1 if anything failed. "npm run test:collection" runs this file.
//
// The collection runs twice, because each part needs its own CSV file:
//   the main flow     with customers.csv: one pass through the folders per customer
//   the order rules   with invalid-orders.csv: one request, one row per rule

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import newman from "newman";
import { createServer } from "../src/server.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reports = resolve(root, "artifacts/reports");
const token = process.env.DEMO_API_TOKEN || "local-demo-token";

const RUNS = [
  {
    name: "main-flow",
    folder: ["Health", "Product catalog", "Access", "Orders"],
    data: "postman/data/customers.csv",
    expectedAssertions: 48,
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

function runCollection(run, baseUrl) {
  return new Promise((done, fail) => {
    newman.run(
      {
        collection: resolve(root, "postman/collections/commerce-api.postman_collection.json"),
        environment: resolve(root, "postman/environments/local.postman_environment.json"),
        // These two replace the environment file's values: the port is new on each run
        envVar: [
          { key: "baseUrl", value: baseUrl },
          { key: "authToken", value: token },
        ],
        folder: run.folder,
        iterationData: resolve(root, run.data),
        reporters: ["cli", "junit"],
        reporter: { junit: { export: resolve(reports, `newman-${run.name}.xml`) } },
        timeoutRequest: 5_000,
        timeoutScript: 5_000,
      },
      (error, summary) => (error ? fail(error) : done(summary)),
    );
  });
}

// Newman counts only the checks that ran, so a skipped folder or an empty CSV file would look
// like a pass: the expected count catches that
function problems(run, stats, failures) {
  const found = [];
  if (failures > 0) {
    found.push(`${failures} failures`);
  }
  if (stats.assertions.total !== run.expectedAssertions) {
    found.push(`${stats.assertions.total} assertions ran, expected ${run.expectedAssertions}`);
  }
  return found;
}

function summaryTable(results) {
  const rows = results.map(
    ({ name, stats, found }) =>
      `| ${name} | ${stats.iterations.total} | ${stats.requests.total} | ${stats.assertions.total} | ` +
      `${stats.assertions.failed} | ${found.length ? found.join(", ") : "passed"} |`,
  );
  return [
    "| Run | Iterations | Requests | Assertions | Failed | Result |",
    "|---|---:|---:|---:|---:|---|",
    ...rows,
    "",
  ].join("\n");
}

const server = createServer({ token });

try {
  await mkdir(reports, { recursive: true });
  const { port } = await listen(server);

  const results = [];
  for (const run of RUNS) {
    const { run: result } = await runCollection(run, `http://127.0.0.1:${port}`);
    results.push({
      name: run.name,
      stats: result.stats,
      found: problems(run, result.stats, result.failures.length),
    });
  }

  await writeFile(resolve(reports, "summary.md"), summaryTable(results));
  console.log(summaryTable(results));
  if (results.some((result) => result.found.length > 0)) {
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
