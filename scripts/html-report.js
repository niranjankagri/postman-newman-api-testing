const html = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

function total(results, select) {
  return results.reduce((sum, result) => sum + select(result), 0);
}

function runStatus(result) {
  const failed =
    result.found.length > 0 ||
    result.contractFailures > 0 ||
    result.stats.assertions.failed > 0;
  return failed ? "Failed" : "Passed";
}

function failureDetails(result) {
  const newmanFailures = (result.newmanFailures ?? []).map(
    ({ name, message }) =>
      "<li><strong>" + html(name) + "</strong>: " + html(message) + "</li>",
  );
  const contractFailures = (result.contractFailureMessages ?? []).map(
    (message) => "<li>OpenAPI: " + html(message) + "</li>",
  );
  const details = [...newmanFailures, ...contractFailures];

  return details.length ? '<ul class="failures">' + details.join("") + "</ul>" : "";
}

/** Render a self-contained HTML summary from the Newman run results. */
export function renderHtmlReport(results, coverage) {
  const assertions = total(results, (result) => result.stats.assertions.total);
  const failedAssertions = total(results, (result) => result.stats.assertions.failed);
  const requests = total(results, (result) => result.stats.requests.total);
  const contractFailures = total(results, (result) => result.contractFailures);
  const failedRuns = results.filter((result) => runStatus(result) === "Failed").length;
  const overallStatus = failedRuns ? "Failed" : "Passed";
  const rows = results.map((result) => {
    const status = runStatus(result);
    return [
      "<tr><td>", html(result.name), '</td><td><span class="badge ',
      status.toLowerCase(), '">', status, "</span></td><td>",
      result.stats.iterations.total, "</td><td>", result.stats.requests.total,
      "</td><td>", result.stats.assertions.total, "</td><td>",
      result.stats.assertions.failed, "</td><td>", result.contractFailures,
      "</td></tr>",
    ].join("");
  });
  const details = results.map((result) => {
    const content = failureDetails(result);
    return content
      ? "<section><h3>" + html(result.name) + "</h3>" + content + "</section>"
      : "";
  }).filter(Boolean).join("");

  return \`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Newman test report</title>
  <style>
    :root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #172033; background: #f3f6fb; }
    body { margin: 0; padding: 2rem 1rem; }
    main { max-width: 1050px; margin: auto; }
    h1, h2, h3 { line-height: 1.2; }
    h1 { margin-bottom: .35rem; }
    .muted { color: #5d687b; }
    .status { display: inline-block; margin: 1rem 0; padding: .3rem .75rem; border-radius: 999px; font-weight: 700; }
    .passed { color: #12603a; background: #dcfce7; }
    .failed { color: #991b1b; background: #fee2e2; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: .75rem; margin: 1.25rem 0; }
    .metric, .panel { background: white; border: 1px solid #dce3ee; border-radius: .75rem; padding: 1rem; }
    .metric strong { display: block; font-size: 1.5rem; }
    .metric span { color: #5d687b; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { padding: .7rem; border-bottom: 1px solid #e5eaf1; text-align: left; white-space: nowrap; }
    th { background: #f8fafc; }
    .badge { padding: .2rem .55rem; border-radius: 999px; font-size: .85rem; font-weight: 700; }
    .failures { color: #991b1b; overflow-wrap: anywhere; }
    section { border-top: 1px solid #e5eaf1; padding-top: .5rem; }
    @media (max-width: 600px) { body { padding: 1rem .6rem; } th, td { padding: .55rem; } }
  </style>
</head>
<body>
  <main>
    <h1>Newman test report</h1>
    <p class="muted">Postman collection execution and OpenAPI response contract checks.</p>
    <span class="status \${overallStatus.toLowerCase()}">\${overallStatus}</span>
    <div class="metrics">
      <div class="metric"><strong>\${results.length}</strong><span>Collection runs</span></div>
      <div class="metric"><strong>\${requests}</strong><span>Requests</span></div>
      <div class="metric"><strong>\${assertions}</strong><span>Assertions</span></div>
      <div class="metric"><strong>\${failedAssertions}</strong><span>Failed assertions</span></div>
      <div class="metric"><strong>\${contractFailures}</strong><span>Contract failures</span></div>
    </div>
    <section class="panel">
      <h2>Run results</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Run</th><th>Status</th><th>Iterations</th><th>Requests</th><th>Assertions</th><th>Failed</th><th>Contract failures</th></tr></thead>
          <tbody>\${rows.join("")}</tbody>
        </table>
      </div>
    </section>
    <section class="panel"><h2>OpenAPI response coverage</h2><p>\${html(coverage)}</p></section>
    \${details ? '<section class="panel"><h2>Failure details</h2>' + details + "</section>" : ""}
  </main>
</body>
</html>
\`;
}
