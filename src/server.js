import { createServer as createHttpServer } from "node:http";
import { pathToFileURL } from "node:url";

const products = [
  { id: "p-100", name: "Trail Backpack", priceCents: 6499, inStock: true },
  { id: "p-200", name: "Insulated Bottle", priceCents: 2499, inStock: true },
  { id: "p-300", name: "Travel Mug", priceCents: 1899, inStock: false },
];

const MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_TOKEN = "local-demo-token";

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let byteLength = 0;

  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function hasValidToken(request, token) {
  return request.headers.authorization === `Bearer ${token}`;
}

function orderInputError(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Order body must be a JSON object.";
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "Order must contain at least one item.";
  }
  if (
    typeof body.customer?.name !== "string" ||
    body.customer.name.trim().length < 2
  ) {
    return "Customer name must contain at least 2 characters.";
  }
  if (
    typeof body.customer?.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer.email)
  ) {
    return "Customer email must be valid.";
  }

  for (const item of body.items) {
    if (!item || typeof item.productId !== "string") {
      return "Each item must include a productId.";
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return "Each item quantity must be a positive integer.";
    }

    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product || !product.inStock) {
      return `Product ${item.productId} is unavailable.`;
    }
  }

  return null;
}

export function createServer({ token = process.env.DEMO_API_TOKEN || DEFAULT_TOKEN } = {}) {
  const orders = new Map();
  let nextOrderNumber = 1;

  return createHttpServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { status: "ok" });
    }

    if (request.method === "GET" && url.pathname === "/api/products") {
      return sendJson(response, 200, { data: products });
    }

    const productMatch = url.pathname.match(/^\/api\/products\/([^/]+)$/);
    if (request.method === "GET" && productMatch) {
      const product = products.find((item) => item.id === productMatch[1]);
      if (!product) {
        return sendJson(response, 404, { error: "Product not found." });
      }
      return sendJson(response, 200, { data: product });
    }

    if (url.pathname === "/api/orders" || url.pathname.startsWith("/api/orders/")) {
      if (!request.headers.authorization) {
        return sendJson(response, 401, { error: "Bearer token is required." });
      }
      if (!hasValidToken(request, token)) {
        return sendJson(response, 403, { error: "Bearer token is invalid." });
      }
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      try {
        const body = await readJson(request);
        const validationMessage = orderInputError(body);
        if (validationMessage) {
          return sendJson(response, 422, { error: validationMessage });
        }

        const totalCents = body.items.reduce((total, item) => {
          const product = products.find((candidate) => candidate.id === item.productId);
          return total + product.priceCents * item.quantity;
        }, 0);
        const order = {
          id: `ord-${String(nextOrderNumber++).padStart(4, "0")}`,
          status: "accepted",
          customer: {
            name: body.customer.name.trim(),
            email: body.customer.email,
          },
          items: body.items.map((item) => ({ ...item })),
          totalCents,
        };
        orders.set(order.id, order);
        return sendJson(response, 201, { data: order });
      } catch (error) {
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 400;
        return sendJson(response, statusCode, { error: error.message });
      }
    }

    const orderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (request.method === "GET" && orderMatch) {
      const order = orders.get(orderMatch[1]);
      if (!order) {
        return sendJson(response, 404, { error: "Order not found." });
      }
      return sendJson(response, 200, { data: order });
    }

    return sendJson(response, 404, { error: "Route not found." });
  });
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  const port = Number.parseInt(process.env.PORT || "4173", 10);
  const host = process.env.HOST || "127.0.0.1";
  const server = createServer();

  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Demo API listening at http://${host}:${actualPort}`);
  });
}
