/**
 * API documentation MCP — NOT an API execution MCP. Serves this backend's own swagger.yaml over
 * MCP (Model Context Protocol) so agents can read endpoint contracts and payloads.
 * Stateless Streamable HTTP: every POST builds a fresh server + transport, no sessions.
 *
 * Read-only by construction: it describes the API and never touches MongoDB, the upstream LiveKit
 * API or any credential. Do not add a tool that performs live requests — agents call the REST API
 * themselves, with their own bearer key.
 */
const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const asyncHandler = require('../core/middleware/asyncHandler');
const {
  HTTP_METHODS,
  normalizePath,
  resolveRefs,
  exampleFromSchema,
  listEndpoints,
  findEndpoint,
  searchEndpoints
} = require('./swagger-index');

const pkg = require('../../package.json');

const DOCS_ONLY = 'Docs only — does not call the API.';

// Shown by MCP clients at connect time, before any tool call.
const INSTRUCTIONS = [
  'API documentation only. This server describes the INTVyom REST API from its swagger.yaml.',
  'It cannot call the API, holds no credentials and never changes data.',
  'To perform a request, send HTTP to the backend yourself with `Authorization: Bearer <api_key>`',
  '(every /api route except signup and login needs it).',
  'Start with get_overview for conventions, then search_endpoints / get_endpoint for contracts.',
].join(' ');

const textResult = (text) => ({ content: [{ type: 'text', text }] });

// `security: []` on an operation opts out of the document-level requirement.
const authLine = (operation, doc) => {
  const requirements = operation.security ?? doc.security ?? [];
  return requirements.length === 0
    ? 'Auth: none'
    : 'Auth: `Authorization: Bearer <api_key>` (the key from POST /api/auth/signup or /api/auth/login)';
};

// Prefer application/json; otherwise the first declared type (e.g. multipart/form-data).
const pickContent = (content) => {
  if (!content) return null;
  const type = content['application/json'] ? 'application/json' : Object.keys(content)[0];
  return type ? { type, media: content[type] } : null;
};

// Authored examples first: they are curated to pass validation. The synthesized one is a fallback.
const renderExamples = (media, resolvedSchema) => {
  if (media.examples) {
    return Object.entries(media.examples).flatMap(([name, example]) => [
      `Example \`${name}\`${example.summary ? ` — ${example.summary}` : ''}:`,
      '```json', JSON.stringify(example.value, null, 2), '```',
    ]);
  }
  if (media.example !== undefined) {
    return ['Example:', '```json', JSON.stringify(media.example, null, 2), '```'];
  }
  return [
    'Example (synthesized from field examples — not validated):',
    '```json', JSON.stringify(exampleFromSchema(resolvedSchema), null, 2), '```',
  ];
};

const endpointLine = ({ method, path, tags, summary }) =>
  `${method} ${path} — [${(tags || []).join(', ')}] ${summary || ''}`.trimEnd();

const nearestPaths = (doc, path, limit) => {
  const target = normalizePath(path).split('/').filter(Boolean);
  return Object.keys(doc?.paths || {})
    .map((candidate) => {
      const shared = candidate
        .split('/')
        .filter(Boolean)
        .filter((segment) => target.includes(segment)).length;
      return { candidate, shared };
    })
    .sort((a, b) => b.shared - a.shared || a.candidate.length - b.candidate.length)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
};

const methodsForPath = (doc, path) => {
  const wanted = Object.keys(doc?.paths || {})
    .find((candidate) => normalizePath(candidate) === normalizePath(path));
  if (!wanted) return [];
  return Object.keys(doc.paths[wanted])
    .filter((key) => HTTP_METHODS.includes(key.toLowerCase()))
    .map((key) => key.toUpperCase());
};

const renderParameters = (operation, doc) => {
  const params = operation.parameters || [];
  if (params.length === 0) return 'None';
  return params
    // Shared params are `$ref`s to components.parameters; resolve the param itself, not only
    // its schema, or name/in render as "undefined (undefined)".
    .map((ref) => resolveRefs(ref, doc))
    .map((param) => {
      const schema = param.schema ? resolveRefs(param.schema, doc) : {};
      const type = schema.type || (Array.isArray(schema.enum) ? `enum(${schema.enum.join('|')})` : '');
      const bits = [
        `- ${param.name} (${param.in}${param.required ? ', required' : ''})`,
        type ? ` ${type}` : '',
        param.description ? ` — ${param.description}` : ''
      ];
      return bits.join('');
    })
    .join('\n');
};

const renderEndpoint = ({ operation, path, method }, doc) => {
  const sections = [`### ${method} ${path}`];

  if (operation.tags?.length) sections.push(`Tags: ${operation.tags.join(', ')}`);
  if (operation.summary) sections.push(`Summary: ${operation.summary}`);
  sections.push(authLine(operation, doc));
  if (operation.description) sections.push('', operation.description);

  sections.push('', '**Parameters**', renderParameters(operation, doc));

  const body = pickContent(resolveRefs(operation.requestBody, doc)?.content);
  sections.push('', '**Request body**');
  if (!body) {
    sections.push('None');
  } else {
    const resolved = resolveRefs(body.media.schema, doc);
    sections.push(`Content-Type: ${body.type}`, '```json', JSON.stringify(resolved, null, 2), '```');
    sections.push('', ...renderExamples(body.media, resolved));
  }

  sections.push('', '**Responses**');
  const responses = Object.entries(resolveRefs(operation.responses || {}, doc));
  if (responses.length === 0) sections.push('None');
  for (const [code, response] of responses) {
    sections.push('', `#### ${code}`);
    if (response.description) sections.push(response.description);
    const content = pickContent(response.content);
    if (content?.media.schema) {
      const resolved = resolveRefs(content.media.schema, doc);
      sections.push('```json', JSON.stringify(resolved, null, 2), '```');
      sections.push(...renderExamples(content.media, resolved));
    }
  }

  return sections.join('\n');
};

const buildServer = (doc) => {
  const server = new McpServer(
    { name: 'intvyom-api-docs', version: pkg.version },
    { instructions: INSTRUCTIONS }
  );

  server.registerTool(
    'get_overview',
    {
      description: `${DOCS_ONLY} API-wide conventions: base URL, auth, tags, runtime modes and traps. Read this first.`,
      inputSchema: {}
    },
    async () => {
      try {
        const tags = (doc.tags || []).map((t) => `- ${t.name}: ${t.description || ''}`.trimEnd());
        return textResult([
          `# ${doc.info?.title || 'API'} ${doc.info?.version || ''}`.trimEnd(),
          '',
          'This MCP server is documentation only: it cannot execute requests. Call the API over HTTP yourself.',
          `Base URL: ${doc.servers?.[0]?.url || '(not set)'}`,
          authLine({}, doc),
          '',
          '## Tags',
          ...tags,
          '',
          doc.info?.description || ''
        ].join('\n'));
      } catch (error) {
        return textResult(`Error reading overview: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'list_endpoints',
    {
      description: `${DOCS_ONLY} List every endpoint in the INTVyom backend API, optionally filtered by tag.`,
      inputSchema: { tag: z.string().optional() }
    },
    async ({ tag }) => {
      try {
        const endpoints = listEndpoints(doc, tag);
        if (endpoints.length === 0) {
          if (tag) {
            const validTags = (doc.tags || []).map((t) => t.name).join(', ');
            return textResult(`No endpoints tagged '${tag}'. Valid tags: ${validTags}`);
          }
          return textResult('No endpoints found.');
        }
        return textResult(endpoints.map(endpointLine).join('\n'));
      } catch (error) {
        return textResult(`Error listing endpoints: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'search_endpoints',
    {
      description: `${DOCS_ONLY} Find endpoints by path, summary, description, tag or field name.`,
      inputSchema: { query: z.string() }
    },
    async ({ query }) => {
      try {
        const { total, results } = searchEndpoints(doc, query);
        if (results.length === 0) {
          return textResult(`No matches for '${query}'. Try list_endpoints to see everything.`);
        }
        return textResult(
          `${results.map(endpointLine).join('\n')}\n\n${total} match(es), showing ${results.length}`
        );
      } catch (error) {
        return textResult(`Error searching endpoints: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'get_endpoint',
    {
      description:
        `${DOCS_ONLY} Full request and response contract for one endpoint: auth, parameters, body schema with \`$ref\`s resolved, and example payloads.`,
      inputSchema: { path: z.string(), method: z.string().default('get') }
    },
    async ({ path, method }) => {
      try {
        const found = findEndpoint(doc, path, method);
        if (!found) {
          const methods = methodsForPath(doc, path);
          const lines = [`No endpoint ${String(method).toUpperCase()} ${normalizePath(path)}.`];
          if (methods.length > 0) {
            lines.push(`${normalizePath(path)} exists with methods: ${methods.join(', ')}.`);
          }
          lines.push(`Nearest paths: ${nearestPaths(doc, path, 5).join(', ')}`);
          return textResult(lines.join('\n'));
        }
        return textResult(renderEndpoint(found, doc));
      } catch (error) {
        return textResult(`Error reading endpoint: ${error.message}`);
      }
    }
  );

  server.registerTool(
    'get_schema',
    {
      description: `${DOCS_ONLY} One shared schema from \`components.schemas\`, resolved, with an example object.`,
      inputSchema: { name: z.string() }
    },
    async ({ name }) => {
      try {
        const schema = doc.components?.schemas?.[name];
        if (!schema) {
          const available = Object.keys(doc.components?.schemas || {}).join(', ');
          return textResult(`No schema '${name}'. Available: ${available}`);
        }
        const resolved = resolveRefs(schema, doc);
        return textResult(
          `${JSON.stringify(resolved, null, 2)}\n\nExample:\n${JSON.stringify(exampleFromSchema(resolved), null, 2)}`
        );
      } catch (error) {
        return textResult(`Error reading schema: ${error.message}`);
      }
    }
  );

  return server;
};

/**
 * @param {object} swaggerDocument already-parsed swagger.yaml (do not re-load it here)
 * @returns {import('express').Router}
 */
const createMcpRouter = (swaggerDocument) => {
  const router = express.Router();

  router.post('/', express.json(), asyncHandler(async (req, res) => {
    const server = buildServer(swaggerDocument);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }));

  // Stateless: there is no session to GET or DELETE.
  const methodNotAllowed = (req, res) => res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. This MCP server is stateless; use POST.' },
    id: null
  });
  router.get('/', methodNotAllowed);
  router.delete('/', methodNotAllowed);

  return router;
};

module.exports = createMcpRouter;
