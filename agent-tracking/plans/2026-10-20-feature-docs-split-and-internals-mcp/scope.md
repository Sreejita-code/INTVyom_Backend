# Scope — 2026-10-20-feature-docs-split-and-internals-mcp

- **Type:** feature
- **Requested by:** repo owner
- **Date:** 2026-10-20

## Original request (verbatim)

> Now I want to build an MCP for this repo, just like the repo or the core of the API LifeKit docs MCP that we are using. My code is using that core API, the LifeKit core program, and it is on top of this and on top of that program.
>
> I need an MCP just like that for this repo so that any frontend that is attached to it can use it and understand the payloads and the changes: what changes are happening, what the payloads and response are, and everything. That way, it will be easy for my frontend agent to attach to this repo and get an understanding of all the payloads, responses, and everything.
>
> Another thing is the internal mechanism: where it is present, what other things are present, how all this code works, and how all this code utilizes the core to work and everything. Those things, I think, will be present in a dev docs file as well as the MCP. I think that should be present in the docs file. I don't know what the equivalent of `mk docs` in Python is for Node, what the equivalent of that is in Node, and how you will build it. I don't know. Help me understand.
>
> I want the readme.md to be for people who want to run my code. Then there will be dev docs, which will be for developers to understand the code after the readme, after running. It will include all the architectures, all the findings, how it works, how it utilizes the core, and everything. Then there will be the docs. The docs will be like the main MCP. It'll be just like Swagger's. It will be giving the endpoints as well as the payloads and responses and everything.
>
> I think, if you can, somewhere attach MCP to Swagger's and those kinds of things. I don't know. You tell me what will be the better option here and the better way to do it, and this will be much better. Perfect. Help me understand. Create me a plan and ask me if something is needed.

## Agreed scope

| Question | Answer |
|----------|--------|
| Target | README.md, new docs/, src/mcp/, src/server.js, tests/mcp, swagger.yaml info text, AGENTS.md structure |
| Depth | standard (default) |
| Out of scope | API behaviour changes, new endpoints, MCP auth, site generator, auto-diff of swagger |
| Constraints | No new dependencies; MCP stays docs-only, unauthenticated, stateless; swagger.yaml remains source of truth |
| Success criteria | README run-only; docs/ has architecture + core-usage + data pages; /mcp serves them plus changelog; tests green |
| Report format (HTML / MD) | HTML |
| Severity cut-off | all |
| Type-specific answers | see clarification log |

## Assumptions confirmed with the user

-

## Clarification log

| Question asked | User's answer |
|----------------|---------------|
| Q1 Extend /mcp or second MCP? | Extend /mcp |
| Q2 Site generator? | None: plain docs/*.md served via MCP |
| Q3 README cut endpoints? | Yes, link to /api-docs + MCP |
| Q4 Swagger relationship | Swagger stays source of truth, link MCP from it |
| Q5 Changelog source | Hand-kept docs/CHANGELOG.md, get_changelog tool |
