/**
 * Pure helpers over an already-parsed swagger document. No MCP, no Express, no I/O — every
 * function takes the parsed object so it can be tested without a server. `swagger-mcp.js` is the
 * only place that knows about HTTP.
 */

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const isLocalRef = (value) => typeof value === 'string' && value.startsWith('#/');

const refName = (ref) => String(ref).split('/').pop();

// Resolve a local JSON pointer (`#/components/schemas/Error`) inside the document.
const getByPointer = (doc, ref) => {
  let current = doc;
  for (const part of ref.slice(2).split('/')) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
};

/**
 * Deep copy `node` with every local `$ref` inlined. Non-local refs are left as-is; dangling refs
 * and cycles become a readable `$ref` stub instead of throwing or hanging.
 * @param {*} node
 * @param {object} doc parsed swagger document
 * @param {Set<string>} [seen] refs already followed on the current branch
 */
const resolveRefs = (node, doc, seen = new Set()) => {
  if (Array.isArray(node)) {
    return node.map((item) => resolveRefs(item, doc, seen));
  }

  if (node && typeof node === 'object') {
    if (isLocalRef(node.$ref)) {
      const ref = node.$ref;
      if (seen.has(ref)) return { $ref: `${refName(ref)} (circular)` };

      const target = getByPointer(doc, ref);
      if (target === undefined) return { $ref: `${ref} (unresolved)` };

      const branch = new Set(seen);
      branch.add(ref);
      return resolveRefs(target, doc, branch);
    }

    const copy = {};
    for (const [key, value] of Object.entries(node)) {
      copy[key] = resolveRefs(value, doc, seen);
    }
    return copy;
  }

  return node;
};

/**
 * One sendable example value for a schema. Run it on an ALREADY-RESOLVED schema so it never has
 * to chase a `$ref`. `nullable` is ignored on purpose: the point is a value you can send.
 * @param {object} schema
 */
const exampleFromSchema = (schema) => {
  if (!schema || typeof schema !== 'object') return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case 'object': {
      const example = {};
      for (const [key, value] of Object.entries(schema.properties || {})) {
        example[key] = exampleFromSchema(value);
      }
      return example;
    }
    case 'array':
      return schema.items ? [exampleFromSchema(schema.items)] : [];
    case 'string':
      return schema.format === 'date-time' ? '2026-01-01T00:00:00Z' : 'string';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return null;
  }
};

const operationEntries = (doc) => {
  const entries = [];
  for (const [path, item] of Object.entries(doc?.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!HTTP_METHODS.includes(method.toLowerCase())) continue;
      entries.push({ method: method.toUpperCase(), path, operation });
    }
  }
  return entries;
};

/**
 * Every operation, optionally filtered by tag (case-insensitive).
 * @param {object} doc
 * @param {string} [tag]
 * @returns {Array<{method: string, path: string, tags: string[], summary: string}>}
 */
const listEndpoints = (doc, tag) => {
  const wanted = tag ? String(tag).toLowerCase() : null;
  return operationEntries(doc)
    .filter(({ operation }) => {
      if (!wanted) return true;
      return (operation.tags || []).some((t) => String(t).toLowerCase() === wanted);
    })
    .map(({ method, path, operation }) => ({
      method,
      path,
      tags: operation.tags || [],
      summary: operation.summary || ''
    }));
};

const normalizePath = (path) => {
  let value = String(path ?? '').trim();
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
};

/**
 * Exact path + method lookup.
 * @returns {{operation: object, path: string, method: string}|null}
 */
const findEndpoint = (doc, path, method) => {
  const wantedPath = normalizePath(path);
  const wantedMethod = String(method || '').toLowerCase();
  if (!wantedMethod || !HTTP_METHODS.includes(wantedMethod)) return null;

  const item = (doc?.paths || {})[wantedPath];
  if (!item) return null;

  const operation = item[wantedMethod];
  if (!operation) return null;

  return { operation, path: wantedPath, method: wantedMethod.toUpperCase() };
};

// Collect property names reachable from a resolved schema (one level of nesting is enough to
// match field-name queries; arrays and nested objects are walked too).
const collectKeys = (schema, into) => {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach((item) => collectKeys(item, into));
    return;
  }
  if (schema.properties) {
    for (const [key, value] of Object.entries(schema.properties)) {
      into.add(key.toLowerCase());
      collectKeys(value, into);
    }
  }
  if (schema.items) collectKeys(schema.items, into);
};

const jsonSchemaFor = (operation) => {
  const request = operation?.requestBody?.content?.['application/json']?.schema;
  const responses = Object.values(operation?.responses || {})
    .map((response) => response?.content?.['application/json']?.schema)
    .filter(Boolean);
  return { request, responses };
};

/**
 * Case-insensitive substring search over path, summary, description, tags and field names, ranked
 * by how many of those categories matched. Returns the top 25.
 */
const searchEndpoints = (doc, query) => {
  const needle = String(query ?? '').toLowerCase();
  if (!needle) return [];

  const results = [];
  for (const { method, path, operation } of operationEntries(doc)) {
    let score = 0;
    if (path.toLowerCase().includes(needle)) score += 1;
    if ((operation.summary || '').toLowerCase().includes(needle)) score += 1;
    if ((operation.description || '').toLowerCase().includes(needle)) score += 1;
    if ((operation.tags || []).join(' ').toLowerCase().includes(needle)) score += 1;

    const { request, responses } = jsonSchemaFor(operation);
    const keys = new Set();
    if (request) collectKeys(resolveRefs(request, doc), keys);
    responses.forEach((schema) => collectKeys(resolveRefs(schema, doc), keys));
    if ([...keys].some((key) => key.includes(needle))) score += 1;

    if (score > 0) {
      results.push({
        method,
        path,
        tags: operation.tags || [],
        summary: operation.summary || '',
        score
      });
    }
  }

  results.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return results.slice(0, 25);
};

module.exports = {
  resolveRefs,
  exampleFromSchema,
  listEndpoints,
  findEndpoint,
  searchEndpoints
};
