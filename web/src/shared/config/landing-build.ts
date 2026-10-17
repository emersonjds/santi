/** SAN-111: a render-blocking stylesheet costs the landing page a round trip; `read` gets the file path inside the build. */
export const inlineStylesheets = (
  html: string,
  read: (file: string) => string | undefined
) =>
  html.replace(
    /<link rel="stylesheet"[^>]*href="\/([^"]+\.css)"[^>]*>/g,
    (link, file: string) => {
      const rules = read(file)
      return rules === undefined ? link : `<style>${rules}</style>`
    }
  )

/** The llmstxt.org summary served at `/llms.txt`. */
export const llmsTxt = (siteUrl: string) => `# santi

> Free, open-source agile tracker for software teams: Scrum and Kanban boards, a backlog and sprints, with a web app, a CLI and an MCP server. Written in Rust and React, licensed MIT or Apache-2.0.

santi can be self-hosted with Docker Compose and PostgreSQL. Everything the web app does goes through a documented JSON API, and the \`santi mcp\` command gives AI agents tools for projects, boards, backlog, issues, comments and sprints, acting with the permissions of an API token.

## Links

- [santi](${siteUrl}/): what santi does and how to start
- [API docs](${siteUrl}/docs/): interactive reference for the JSON API
- [OpenAPI document](${siteUrl}/openapi.json): the API contract, OpenAPI 3.1
- [Source code](https://github.com/emersonjds/santi): repository, README with self-hosting steps, issues
- [Changelog](https://github.com/emersonjds/santi/blob/main/CHANGELOG.md): what changed in each release
`
