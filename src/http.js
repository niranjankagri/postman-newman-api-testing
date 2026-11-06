// Small helpers around Node's HTTP server: JSON in, JSON out.

const MAX_BODY_BYTES = 64 * 1024;

// An error the client caused, carrying the status to answer with
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    // Orders are personal data, so no proxy or browser may keep a copy
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

export async function readJson(request) {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    byteLength += chunk.length;
    // Checked while reading, so an oversized body is never held in memory
    if (byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

// new URL() throws on a path such as "//". The handler must never throw for bad input,
// or one request would stop the whole server.
export function parseUrl(request) {
  try {
    return new URL(request.url, "http://127.0.0.1");
  } catch {
    throw new HttpError(400, "Request URL is invalid.");
  }
}
