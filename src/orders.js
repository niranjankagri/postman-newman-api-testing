// Order rules and the in-memory order store.

import { findProduct } from "./catalog.js";

// Without a limit, a huge quantity makes the total too large for a number and it reaches the
// client as null
export const MAX_QUANTITY = 100;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function customerError(customer) {
  if (typeof customer?.name !== "string" || customer.name.trim().length < 2) {
    return "Customer name must contain at least 2 characters.";
  }
  if (typeof customer.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    return "Customer email must be valid.";
  }
  return null;
}

function itemError(item) {
  if (!item || typeof item.productId !== "string") {
    return "Each item must include a productId.";
  }
  if (!Number.isInteger(item.quantity) || item.quantity < 1) {
    return "Each item quantity must be a positive integer.";
  }
  if (item.quantity > MAX_QUANTITY) {
    return `Each item quantity must be ${MAX_QUANTITY} or less.`;
  }
  if (!findProduct(item.productId)?.inStock) {
    return `Product ${item.productId} is unavailable.`;
  }
  return null;
}

/** Returns the first problem with an order body as a message, or null when it is valid. */
export function orderInputError(body) {
  if (!isObject(body)) {
    return "Order body must be a JSON object.";
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return "Order must contain at least one item.";
  }
  const problem = customerError(body.customer);
  if (problem) {
    return problem;
  }
  for (const item of body.items) {
    const itemProblem = itemError(item);
    if (itemProblem) {
      return itemProblem;
    }
  }
  return null;
}

function totalCents(items) {
  return items.reduce(
    (total, item) => total + findProduct(item.productId).priceCents * item.quantity,
    0,
  );
}

/** A new, empty store: each server has its own, so tests can't see each other's orders. */
export function createOrderStore() {
  const orders = new Map();
  let nextOrderNumber = 1;

  return {
    add(body) {
      const order = {
        id: `ord-${String(nextOrderNumber++).padStart(4, "0")}`,
        status: "accepted",
        customer: { name: body.customer.name.trim(), email: body.customer.email },
        items: body.items.map((item) => ({ ...item })),
        totalCents: totalCents(body.items),
      };
      orders.set(order.id, order);
      return order;
    },
    find(id) {
      return orders.get(id);
    },
  };
}
