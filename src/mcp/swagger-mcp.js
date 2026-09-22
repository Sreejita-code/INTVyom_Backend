/**
 * Serves this backend's own swagger.yaml over MCP (Model Context Protocol) on the Express app.
 * Stateless Streamable HTTP: every POST builds a fresh server + transport, no sessions.
 *
 * Read-only by construction: it describes the API and never touches MongoDB, the upstream LiveKit
 * API or any credential. Do not add a tool that performs live requests.
 */
const express = require('express');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const asyncHandler = require('../core/middleware/asyncHandler');
const {
  resolveRefs,
  exampleFromSchema,
  listEndpoints,
  findEndpoint,
  searchEndpoints
} = require('./swagger-index');

const pkg = require('../../package.json');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

const textResult = (text) => ({ content: [{ type: 'text', text }] });

const endpointLine = ({ method, path, tags, summary }) =>
  `${method} ${path} — [${(tags || []).join(', ')}] ${summary || ''}`.trimEnd();

const normalizePath = (path) => {
  let value = String(path ?? '').trim();
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value;
};

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
  if (operation.description) sections.push('', operation.description);

  sections.push('', '**Parameters**', renderParameters(operation, doc));

  const body = operation.requestBody?.content?.['application/json'];
  sections.push('', '**Request body**');
  if (!body) {
    sections.push('None');
  } else {
    const resolved = resolveRefs(body.schema, doc);
    sections.push('Content-Type: application/json', '```json', JSON.stringify(resolved, null, 2), '```');
  }

  sections.push('', '**Example request**');
  if (!body) {
    sections.push('None');
  } else {
    const resolved = resolveRefs(body.schema, doc);
    sections.push('```json', JSON.stringify(exampleFromSchema(resolved), null, 2), '```');
  }

  sections.push('', '**Responses**');
  const responses = Object.entries(operation.responses || {});
  if (responses.length === 0) sections.push('None');
  for (const [code, response] of responses) {
    sections.push('', `#### ${code}`);
    if (response.description) sections.push(response.description);
    const schema = response.content?.['application/json']?.schema;
    if (schema) {
      const resolved = resolveRefs(schema, doc);
      sections.push('```json', JSON.stringify(resolved, null, 2), '```');
      sections.push('Example:', '```json', JSON.stringify(exampleFromSchema(resolved), null, 2), '```');
    }
  }

  return sections.join('\n');
};

const buildServer = (doc) => {
  const server = new McpServer({ name: 'intvyom-swagger', version: pkg.version });

  server.registerTool(
    'list_endpoints',
    {
      description: 'List every endpoint in the INTVyom backend API, optionally filtered by tag.',
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
      description: 'Find endpoints by path, summary, description, tag or field name.',
      inputSchema: { query: z.string() }
    },
    async ({ query }) => {
      try {
        const results = searchEndpoints(doc, query);
        if (results.length === 0) {
          return textResult(`No matches for '${query}'. Try list_endpoints to see everything.`);
        }
        return textResult(
          `${results.map(endpointLine).join('\n')}\n\n${results.length} match(es), showing ${results.length}`
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
        'Full request and response contract for one endpoint, with `$ref`s resolved and a ready-to-send example request body.',
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
      description: 'One shared schema from `components.schemas`, resolved, with an example object.',
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
