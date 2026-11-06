import assert from "node:assert/strict";
import { test } from "node:test";
import { renderHtmlReport } from "../scripts/html-report.js";

function result(overrides = {}) {
  return {
    name: "main-flow",
    stats: {
      iterations: { total: 2 },
      requests: { total: 26 },
      assertions: { total: 56, failed: 0 },
    },
    contractFailures: 0,
    contractFailureMessages: [],
    newmanFailures: [],
    found: [],
    ...overrides,
  };
}

test("TC-351 renders a passing report with run totals and response coverage", () => {
  const report = renderHtmlReport(
    [result(), result({ name: "order-rules", stats: {
      iterations: { total: 8 },
      requests: { total: 8 },
      assertions: { total: 16, failed: 0 },
    } })],
    { summary: "Documented responses seen: 10 of 10", missing: [] },
  );

  assert.match(report, /<title>Newman test report<\/title>/);
  assert.match(report, /class="status passed">Passed/);
  assert.match(report, /<strong>34<\/strong><span>Requests/);
  assert.match(report, /<strong>72<\/strong><span>Assertions/);
  assert.match(report, /Documented responses seen: 10 of 10/);
  assert.match(report, /main-flow/);
  assert.match(report, /order-rules/);
});

test("TC-352 marks failures and escapes their text before adding it to HTML", () => {
  const report = renderHtmlReport(
    [result({
      name: "<script>alert(1)</script>",
      contractFailures: 1,
      contractFailureMessages: ["<img src=x onerror=alert(1)>"],
      newmanFailures: [{ name: "Bad <case>", message: "Expected <ok> & received no" }],
      found: ["1 OpenAPI contract failure"],
      stats: {
        iterations: { total: 1 },
        requests: { total: 1 },
        assertions: { total: 1, failed: 1 },
      },
    })],
    { summary: "Coverage: <missing>", missing: [] },
  );

  assert.match(report, /class="status failed">Failed/);
  assert.match(report, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(report, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(report, /Expected &lt;ok&gt; &amp; received no/);
  assert.match(report, /Coverage: &lt;missing&gt;/);
  assert.doesNotMatch(report, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(report, /<img src=x onerror/);
});

test("TC-353 a documented response nobody produced fails the report, as it fails the build", () => {
  const report = renderHtmlReport([result()], {
    summary: "Documented responses seen: 13 of 14 (missing: GET /health 503)",
    missing: ["GET /health 503"],
  });

  assert.match(report, /class="status failed">Failed/);
});
