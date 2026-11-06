// Test support: a real server on a free port, a client object, and a test data builder.

import { createServer } from "../../src/server.js";

export const TOKEN = "test-token";

/** Starts a new API on a free port. Call stop() when the tests are done. */
export async function startApi() {
  const server = createServer({ token: TOKEN });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    client: new ApiClient(`http://127.0.0.1:${server.address().port}`),
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        // Keep-alive connections from fetch would otherwise hold the close open
        server.closeAllConnections();
      }),
  };
}

function bearer(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** The API's paths and headers in one place, so a test reads as behaviour. */
export class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async get(path, { token } = {}) {
    return this.#send(path, { headers: bearer(token) });
  }

  /** Sends an order as JSON. Pass a string to send those exact bytes. */
  async postOrder(order, { token = TOKEN } = {}) {
    return this.#send("/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", ...bearer(token) },
      body: typeof order === "string" ? order : JSON.stringify(order),
    });
  }

  async #send(path, options) {
    const response = await fetch(`${this.baseUrl}${path}`, options);
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
}

/** A valid order; a test states only the values it is about. */
export function anOrder({ customer = {}, ...overrides } = {}) {
  return {
    customer: { name: "Taylor Tester", email: "taylor@example.test", ...customer },
    items: [{ productId: "p-100", quantity: 2 }],
    ...overrides,
  };
}
