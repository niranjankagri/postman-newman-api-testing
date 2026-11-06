import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:4173";
const token = __ENV.DEMO_API_TOKEN || "local-demo-token";

export const options = {
  vus: 5,
  duration: "10s",
  thresholds: {
    checks: ["rate>0.99"],
    http_req_duration: ["p(95)<750"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const health = http.get(baseUrl + "/health");
  check(health, {
    "TC-171 health returns 200": (response) => response.status === 200,
  });

  const catalog = http.get(baseUrl + "/api/products");
  check(catalog, {
    "TC-172 catalog returns three products": (response) =>
      response.status === 200 && response.json("data").length === 3,
  });

  const order = http.post(
    baseUrl + "/api/orders",
    JSON.stringify({
      customer: { name: "Performance Tester", email: "performance@example.test" },
      items: [{ productId: "p-100", quantity: 1 }],
    }),
    {
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
    },
  );
  check(order, {
    "TC-173 order is accepted": (response) => response.status === 201,
  });

  sleep(1);
}
