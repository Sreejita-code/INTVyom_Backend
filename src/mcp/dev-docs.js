/**
 * Developer docs for the MCP: the Markdown files in docs/, read once at startup.
 * Lookups go through a Map keyed by file name, so a tool argument is never joined into a
 * filesystem path.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getLogger } = require('../core/logging/logger');

const logger = getLogger('mcp.dev-docs');

const DEFAULT_DIR = path.join(__dirname, '..', '..', 'docs');
const CHANGELOG = 'CHANGELOG';

const titleOf = (name, text) => text.match(/^#\s+(.+)$/m)?.[1] ?? name;

/**
 * @param {string} [dir] folder of *.md files
 * @returns {Map<string, {name: string, title: string, text: string}>} name = file name without `.md`
 */
const loadDevDocs = (dir = DEFAULT_DIR) => {
  const docs = new Map();
  // The swagger tools must keep working without docs/ (e.g. an image built without it), and with
  // one unreadable file: skip what cannot be read, keep the rest.
  try {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
      const name = file.slice(0, -'.md'.length);
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      docs.set(name, { name, title: titleOf(name, text), text });
    }
  } catch (error) {
    logger.warn(`dev docs not fully loaded from ${dir}: ${error.message}`);
  }
  return docs;
};

const listDevDocs = (docs) => [...docs.values()].map(({ name, title }) => ({ name, title }));

const getDevDoc = (docs, name) => docs.get(name) ?? null;

/**
 * Newest-first changelog entries: each `## ` section of CHANGELOG.md is one entry.
 * @returns {string[]|null} null when there is no CHANGELOG.md
 */
const getChangelog = (docs, limit = 5) => {
  const changelog = docs.get(CHANGELOG);
  if (!changelog) return null;
  const [, ...entries] = changelog.text.split(/^(?=## )/m);
  return entries.slice(0, limit).map((entry) => entry.trim());
};

module.exports = { loadDevDocs, listDevDocs, getDevDoc, getChangelog };
