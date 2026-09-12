// The HTTP headers of an MCP server, as text and back.
//
// The dialog edits them as one line per header, `Name: value`, which is how a header is written
// everywhere else. Parsing lives here and not inline in the component because the value is a
// credential: a split in the wrong place hands the server half a token and the failure shows up
// much later, as an authentication error nobody can trace back. Tested in
// `src/lib/__tests__/mcp-headers.test.ts`.

/**
 * Reads one header per line, splitting on the FIRST `:` only — a value of its own holds colons
 * (`https://…`, a time, a base64 token), and cutting at the last one would corrupt it.
 *
 * A line that is empty, has no `:`, or has nothing before it is skipped rather than thrown: this
 * runs on every keystroke of a textarea, where a half-written line is the normal state.
 */
export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const name = line.slice(0, idx).trim();
    if (!name) continue;
    headers[name] = line.slice(idx + 1).trim();
  }
  return headers;
}

/** The other way round, so opening an existing server shows what was saved. */
export function formatHeaders(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}

/**
 * Reads `--header "Name: value"` options from CLI arguments and combines them with existing headers.
 * An empty value (e.g. `--header "Name:"`) deletes that header from the existing set.
 * Returns `undefined` if the resulting header set is empty.
 */
export function mcpHeadersFromArgs(
  args: string[],
  existing?: Record<string, string>,
): Record<string, string> | undefined {
  const headers: Record<string, string> = { ...existing };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--header" && i + 1 < args.length) {
      const raw = args[i + 1];
      i++;
      const parsed = parseHeaders(raw);
      for (const [name, value] of Object.entries(parsed)) {
        if (value === "") {
          delete headers[name];
        } else {
          headers[name] = value;
        }
      }
    }
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}
