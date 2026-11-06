import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import newman from "newman";
import { createServer } from "../src/server.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const collection = resolve(
  projectRoot,
  "postman/collections/commerce-api.postman_collection.json",
);
const dataFile = resolve(projectRoot, "postman/data/customers.csv");
const reportDirectory = resolve(projectRoot, "artifacts/reports");
const token = process.env.DEMO_API_TOKEN || "local-demo-token";
const server = createServer({ token });

function listen(target) {
  return new Promise((resolveListen, rejectListen) => {
    target.once("error", rejectListen);
    target.listen(0, "127.0.0.1", () => {
      target.off("error", rejectListen);
      resolveListen(target.address());
    });
  });
}

function close(target) {
  return new Promise((resolveClose, rejectClose) => {
    target.close((error) => (error ? rejectClose(error) : resolveClose()));
    target.closeAllConnections();
  });
}

function runCollection(options) {
  return new Promise((resolveRun, rejectRun) => {
    newman.run(options, (error, summary) => {
      if (error) {
        rejectRun(error);
        return;
      }
      resolveRun(summary);
    });
  });
}

try {
  await mkdir(reportDirectory, { recursive: true });
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const summary = await runCollection({
    collection,
    iterationData: dataFile,
    reporters: ["cli", "junit"],
    reporter: {
      junit: { export: resolve(reportDirectory, "newman-junit.xml") },
    },
    envVar: [
      { key: "baseUrl", value: baseUrl },
      { key: "authToken", value: token },
    ],
    timeout: 30_000,
    timeoutRequest: 5_000,
    timeoutScript: 5_000,
    reporterOptions: { silent: false },
  });

  const stats = summary.run.stats;
  console.log(
    `Newman complete: ${stats.assertions.total} assertions, ${stats.assertions.failed} failed.`,
  );
  if (stats.assertions.failed > 0 || summary.run.failures.length > 0) {
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
