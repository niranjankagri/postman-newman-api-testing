// The demo commerce API: routes and the bearer-token check. The rules live in orders.js.

import { createServer as createHttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { findProduct, products } from "./catalog.js";
import { HttpError, parseUrl, readJson, sendJson } from "./http.js";
import { createOrderStore, orderInputError } from "./orders.js";

const DEFAULT_TOKEN = "local-demo-token";

// 401 means "who are you?", 403 means "I know, and no": a client handles them differently
function requireToken(request, token) {
  const header = request.headers.authorization;
  if (!header) {
    throw new HttpError(401, "Bearer token is required.");
  }
  if (header !== `Bearer ${token}`) {
    throw new HttpError(403, "Bearer token is invalid.");
  }
}

function getProduct(response, id) {
  const product = findProduct(id);
  if (!product) {
    throw new HttpError(404, "Product not found.");
  }
  sendJson(response, 200, { data: product });
}

async function createOrder(request, response, orders) {
  const body = await readJson(request);
  const problem = orderInputError(body);
  if (problem) {
    throw new HttpError(422, problem);
  }
  sendJson(response, 201, { data: orders.add(body) });
}

function getOrder(response, orders, id) {
  const order = orders.find(id);
  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  sendJson(response, 200, { data: order });
}

async function route(request, response, { token, orders }) {
  const { pathname } = parseUrl(request);
  const { method } = request;

  if (method === "GET" && pathname === "/health") {
    return sendJson(response, 200, { status: "ok" });
  }
  if (method === "GET" && pathname === "/api/products") {
    return sendJson(response, 200, { data: products });
  }

  const productId = pathname.match(/^\/api\/products\/([^/]+)$/)?.[1];
  if (method === "GET" && productId) {
    return getProduct(response, productId);
  }

  // Everything under /api/orders needs a token, checked before anything else about the request
  if (pathname === "/api/orders" || pathname.startsWith("/api/orders/")) {
    requireToken(request, token);
  }
  if (method === "POST" && pathname === "/api/orders") {
    return createOrder(request, response, orders);
  }

  const orderId = pathname.match(/^\/api\/orders\/([^/]+)$/)?.[1];
  if (method === "GET" && orderId) {
    return getOrder(response, orders, orderId);
  }

  throw new HttpError(404, "Route not found.");
}

/** Creates the API, not yet listening. Each server starts with an empty order store. */
export function createServer({ token = process.env.DEMO_API_TOKEN || DEFAULT_TOKEN } = {}) {
  const context = { token, orders: createOrderStore() };

  return createHttpServer(async (request, response) => {
    try {
      await route(request, response, context);
    } catch (error) {
      // An unexpected error answers 500 and keeps the server alive, without showing internals
      const known = error instanceof HttpError;
      sendJson(response, known ? error.statusCode : 500, {
        error: known ? error.message : "Internal server error.",
      });
    }
  });
}

// True for "node src/server.js", false when a test or script imports this file
const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const port = Number.parseInt(process.env.PORT || "4173", 10);
  const host = process.env.HOST || "127.0.0.1";
  const server = createServer();

  server.listen(port, host, () => {
    console.log(`Demo API listening at http://${host}:${server.address().port}`);
  });
}
