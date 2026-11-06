import Ajv from "ajv";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "options", "head", "trace"]);

function escapeSegment(segment) {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathPattern(template) {
  const segments = template.split("/").map((segment) =>
    /^\{[^/]+\}$/.test(segment) ? "[^/]+" : escapeSegment(segment),
  );
  return new RegExp(`^${segments.join("/")}$`);
}

function resolveSchema(schema, components, resolving = []) {
  if (Array.isArray(schema)) {
    return schema.map((value) => resolveSchema(value, components, resolving));
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }

  if (typeof schema.$ref === "string") {
    const prefix = "#/components/schemas/";
    if (!schema.$ref.startsWith(prefix)) {
      throw new Error(`Unsupported OpenAPI schema reference: ${schema.$ref}`);
    }
    const name = schema.$ref.slice(prefix.length);
    if (resolving.includes(name)) {
      throw new Error(`Cyclic OpenAPI schema reference: ${[...resolving, name].join(" -> ")}`);
    }
    const target = components[name];
    if (!target) {
      throw new Error(`OpenAPI schema not found: ${name}`);
    }
    return resolveSchema(target, components, [...resolving, name]);
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      resolveSchema(value, components, resolving),
    ]),
  );
}

export function createOpenApiContract(spec) {
  if (!spec || !spec.openapi?.startsWith("3.")) {
    throw new Error("The API contract must be an OpenAPI 3 document.");
  }

  const ajv = new Ajv({ allErrors: true });
  const components = spec.components?.schemas ?? {};
  const operations = [];

  for (const [template, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue;
      }
      const responses = new Map();
      for (const [statusCode, response] of Object.entries(operation.responses ?? {})) {
        const schema = response.content?.["application/json"]?.schema;
        if (schema) {
          responses.set(statusCode, ajv.compile(resolveSchema(schema, components)));
        }
      }
      operations.push({ method: method.toUpperCase(), template, pattern: pathPattern(template), responses });
    }
  }

  return {
    // Every documented response, as "METHOD /path status"
    documentedResponses() {
      return operations.flatMap(({ method, template, responses }) =>
        [...responses.keys()].map((statusCode) => `${method} ${template} ${statusCode}`),
      );
    },
    getSchema(name) {
      if (!components[name]) {
        throw new Error(`OpenAPI schema not found: ${name}`);
      }
      return resolveSchema({ $ref: `#/components/schemas/${name}` }, components);
    },
    validateResponse({ method, url, responseCode, body }) {
      const parsedUrl = new URL(url);
      const operation = operations.find(
        (candidate) =>
          candidate.method === String(method).toUpperCase() &&
          candidate.pattern.test(parsedUrl.pathname),
      );
      if (!operation) {
        return {
          valid: false,
          message: `No OpenAPI operation for ${String(method).toUpperCase()} ${parsedUrl.pathname}.`,
        };
      }

      const validate = operation.responses.get(String(responseCode));
      if (!validate) {
        return {
          valid: false,
          message: `OpenAPI ${operation.method} ${operation.template} does not document HTTP ${responseCode}.`,
        };
      }
      if (validate(body)) {
        return {
          valid: true,
          operationId: operation.template,
          documented: `${operation.method} ${operation.template} ${responseCode}`,
        };
      }

      const errors = ajv.errorsText(validate.errors, { separator: "; " });
      return {
        valid: false,
        message: `Response does not match OpenAPI ${operation.method} ${operation.template}: ${errors}`,
      };
    },
  };
}
