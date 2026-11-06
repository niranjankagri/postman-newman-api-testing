// The product catalog. Fixed data: the demo is about testing the API, not about managing stock.

export const products = [
  { id: "p-100", name: "Trail Backpack", priceCents: 6499, inStock: true },
  { id: "p-200", name: "Insulated Bottle", priceCents: 2499, inStock: true },
  { id: "p-300", name: "Travel Mug", priceCents: 1899, inStock: false },
];

export function findProduct(id) {
  return products.find((product) => product.id === id);
}
