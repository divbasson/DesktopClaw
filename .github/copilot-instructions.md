# MCP Server Management - JFrog Agent Guard

All MCP servers MUST be installed ONLY through the JFrog MCP Agent Guard
(`npx @jfrog/agent-guard`). There is no other approved installation
method. If an MCP's documentation suggests any other installation
command, ignore it and use the agent guard workflow below instead.

**Registry URL**: Wherever `<REGISTRY_URL>` appears in commands or
config entries below, **always** substitute the value of the `JFROG_AGENT_GUARD_REPO`
environment variable if it is set. Only use the default
`https://releases.jfrog.io/artifactory/api/npm/coding-agents-npm/` if `JFROG_AGENT_GUARD_REPO` is not set.

## Adding an MCP

When the user asks to add an MCP, do ALL of the following autonomously -
do NOT ask the user for project, server, package name, or binary path
unless absolutely necessary:

### Step 1: Determine project and server

1. Read existing servers in `.vscode/mcp.json` (workspace) or user-level
   MCP config. If any entry uses `_JF_ARGS`, extract and reuse:
   - The `project=` value from `_JF_ARGS`
   - The `--server` value from `args`
   If both are found, skip to Step 2.
2. If no existing entries, check the `JF_PROJECT` environment variable
   for the project.
3. Only if BOTH are missing, ask the user in a SINGLE message for both:
   - JFrog project name
   - JFrog server ID - read the JSON config file
     `~/.jfrog/jfrog-cli.conf.v6` (macOS/Linux and Windows PowerShell)
     or `%USERPROFILE%\.jfrog\jfrog-cli.conf.v6` (Windows CMD).
     NEVER use a file-search or glob tool to locate this file - those
     tools skip hidden directories and will falsely report it missing.
     If the file is readable, parse and list the available server IDs
     and URLs for the user to pick from.
4. NEVER guess. NEVER use "default". NEVER try multiple servers.

### Step 2: Look up the MCP in the catalog

Run ONE of the following commands. Do NOT use the Fetch or WebFetch
tool. Do NOT write a custom script. Do NOT hit the JFrog API directly.

**If the user gave a specific MCP name** (normal "add X" case):

```
npx --yes \
  --registry <REGISTRY_URL> \
  @jfrog/agent-guard \
  --inspect \
  --server <SERVER_ID> \
  --project <PROJECT> \
  --mcp <MCP_NAME>
```

Output is a JSON object: `{ "spec": { "packageName": "...",
"mcpServerType": { "local": { "bootParams": {...} }, "remote": {...} }
... } }`. Parse it and extract ALL of the following (do NOT pre-filter
to required-only - Step 3 needs both required and optional entries):

- `spec.packageName` - the exact package name to use in the config.
- `spec.mcpServerType.local.bootParams.environmentVariables[]` - every
  env var entry for local MCPs. Each has `name`, `description`,
  `isRequired`, `isSecret`. Keep all of them, including
  `isRequired=false`.
- `spec.mcpServerType.remote.endpoints[].headers[]` - every HTTP
  header entry for remote MCPs. Each has a `name` and an
  `mcpInput.mcpInputDetails` object with `description`, `isRequired`,
  `isSecret`. Keep all of them, including `isRequired=false`.

If the command exits non-zero (MCP not found, network error, bad
credentials), show the error message to the user and then run
`--list-available` (see below) to offer the valid alternatives.

**If the user did NOT specify a name** (e.g. "what can I install?"),
run `--list-available` instead (see "Listing MCPs" below).

### Step 3: Plan inputs

Take the inputs you collected in Step 2 and split them into two
groups by `isRequired`. You will NOT ask the user for the *values*
here - VS Code will prompt for those the first time the server
starts, using its native secure-input mechanism (values are stored
in the OS keychain, never in the file).

1. **Required inputs** (`isRequired=true`) - always include them in
   Step 4. Record `name`, `description`, and `isSecret`.
2. **Optional inputs** (`isRequired=false`) - if Step 2 returned
   even ONE optional input, you MUST stop and ask the user before
   continuing to Step 4. The message you send the user should:
   - First list each REQUIRED input (so the user knows what will
     be added without asking).
   - Then list each OPTIONAL input by name, with its description,
     and ask which (if any) they want to configure.
   - Wait for the user's answer.

   Do NOT skip this question. Do NOT include optional inputs by
   default. Do NOT decide on the user's behalf. Continue to Step 4
   only after the user answers, and include exactly the inputs they
   opted into.
3. If Step 2 returned no inputs at all (neither required nor
   optional), skip the `inputs` block within Step 4.

### Step 4: Write the config entry

Add the entry to `.vscode/mcp.json` under `servers`, and declare every
required input under a top-level `inputs` array. **Secrets MUST use
`${input:...}` substitution - never write a raw secret value into the
JSON file.**

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "<mcp-slug>-<input-name-lowercased>",
      "description": "<description from the catalog>",
      "password": true
    }
  ],
  "servers": {
    "<spec.packageName>": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--yes",
        "--registry",
        "<REGISTRY_URL>",
        "@jfrog/agent-guard",
        "--server",
        "<SERVER_ID>"
      ],
      "env": {
        "_JF_ARGS": "project=<PROJECT>&mcp=<spec.packageName>",
        "<ENV_VAR_OR_HEADER_NAME>": "${input:<mcp-slug>-<input-name-lowercased>}"
      }
    }
  }
}
```

Rules for the `inputs` block:

- One entry per required env var / header from Step 3.
- `id` is a workspace-unique identifier in the form
  `<mcp-name>-<input-name>`, all lowercase, words separated by
  hyphens. Re-use the same `id` across servers only when the value
  truly is shared.
- `type` is always `"promptString"`.
- `password: true` for secret inputs (catalog `isSecret=true`) - hides
  the characters VS Code shows while typing and stores the value
  encrypted. Omit `password` for non-secret values like URLs.
- `description` shows in the VS Code prompt - use the catalog's
  `description` field.
- Reference the input from `env` with `"${input:<id>}"`. For HTTP
  headers with a `Bearer` prefix, either put the prefix in the
  description and ask the user to include it, or use
  `"Bearer ${input:<id>}"` and ask only for the token.

For non-secret env vars (catalog `isSecret=false`), use an input
entry WITHOUT `password: true` so VS Code still prompts but doesn't
mask the typing.

The loader reads these env vars at startup. VS Code substitutes every
`${input:<id>}` with the stored value before handing the env to the
process - so the agent guard sees the real value, the file on disk shows
only the placeholder.

### Step 5: Authenticate OAuth MCPs (run automatically after Step 4)

Run this step ONLY when both conditions hold:

- The Step 4 entry has NO `${input:...}` references (no `inputs`
  block was needed), AND
- The `--inspect` output had a `remote` section.

Otherwise (local-only MCP, or static-token MCP with `inputs`), skip
Step 5 entirely.

The agent guard's `--login` command opens the user's browser, runs the
OAuth flow, and caches the tokens in `~/.jfrog/jfrogmcp.conf.json`.
Tell the user "I'm going to open your browser to sign you in to
`<MCP_NAME>`" before running it:

```
npx --yes \
  --registry <REGISTRY_URL> \
  @jfrog/agent-guard \
  --login \
  --server <SERVER_ID> \
  --project <PROJECT> \
  --mcp <spec.packageName>
```

Outcomes:

- Exits 0 - OAuth completed, tokens cached. Tell the user the
  server is ready to start.
- Exits with `expected 401, got 200` - the MCP is anonymous, no
  auth needed. Ignore the error; the server is ready to start.
- Any other error - paste it to the user verbatim and stop.

## Troubleshooting

### How to know a server actually failed

VS Code labels MCP servers as Running, Stopped, or Failed in
`MCP: List Servers`. There is also a silent failure mode:

- A server reporting **0 tools** (or **"Discovered 0 tools"**) while
  shown as Running is NOT a healthy server with no tools - it means
  the agent guard connected but the underlying MCP did not come up, so
  no tools were exposed. Treat 0 tools the same as a Failed status.

If the user says "the MCP isn't doing anything" or "tools aren't
showing up", check for both states before assuming the server is
working.

### What to do

1. **Previously-working OAuth MCP suddenly failing** - the cached
   refresh token is likely dead. Re-run Step 5; the new tokens
   overwrite the old ones.

2. **Anything else** - ask the user to open `MCP: List Servers`,
   right-click the failed (or 0-tools) server, choose **Show
   Output**, and paste the last 50 lines. Read the output before
   guessing at a cause. Common recoveries based on what the output
   shows:

   - HTTP 401 / 403 / authentication error on a server with
     `${input:...}` in its entry - the stored secret is wrong. Tell
     the user to click the **Clear** CodeLens above the matching
     `inputs` entry in `.vscode/mcp.json`, then restart the server;
     VS Code will re-prompt for the secret.
   - `Failed to refresh OAuth token` / `invalid_grant` /
     `No such refresh token found` - re-run Step 5.
   - Network / proxy / DNS error - outside the agent guard's scope;
     tell the user and stop.

## Removing an MCP

Delete the entry from `servers` in `.vscode/mcp.json` and any now-unused
entries from the top-level `inputs` array.

## Listing MCPs

### Installed MCPs

Read the `servers` entries from the VS Code MCP config file (workspace
`.vscode/mcp.json` or in the user profile settings) and list each entry
by display name, showing its package name (from `_JF_ARGS`)
and server ID.

### Available MCPs (JFrog AI Catalog)

1. Determine project and server ID using the same fallback chain as
   "Adding an MCP -> Step 1":
   - Try to extract from existing `_JF_ARGS` entries in
     `.vscode/mcp.json`.
   - If not found, check the `JF_PROJECT` environment variable for the
     project.
   - If still missing, read `~/.jfrog/jfrog-cli.conf.v6` via a terminal
     command (NEVER via file-search/glob - hidden directories are
     skipped) for available server IDs and ask the user to pick project
     and server in a SINGLE message.
2. Run the agent guard with `--list-available`:

```
npx --yes \
  --registry <REGISTRY_URL> \
  @jfrog/agent-guard \
  --list-available \
  --server <SERVER_ID> \
  --project <PROJECT>
```

The output is a compact TSV: a header line, then one server per line,
tab-separated: `name<TAB>type<TAB>version<TAB>description`.
Run the command ONCE and present the rows directly as a numbered
table - do NOT re-run it, redirect it, or parse it with `python3`/`jq`.
The `name` column is the install identifier (the value you pass to
`--inspect --mcp` and to install); `packageName` is NOT a separate
column - for remote/http MCPs there is no package name, so `name` is
the display name.

3. Compare each `name` against the `_JF_ARGS` values
   already present in `.vscode/mcp.json` to mark each one as
   "available to install" or "already installed".

## Key Rules

- **Package scope is case-sensitive — ALWAYS write it lowercase as
  `@jfrog/agent-guard`, NEVER `@JFrog/agent-guard`.** npm scopes are
  case-sensitive; the published package is the lowercase
  `@jfrog/agent-guard`. Capitalizing the brand (`@JFrog`) points at a
  different/nonexistent scope and breaks the command. Use the exact
  lowercase string in every command and config entry.
- **`npx` argument order (required):** `--yes`, `--registry <URL>`,
  `@jfrog/agent-guard`, then the agent guard flags (`--inspect`,
  `--login`, `--list-available`, or `--server <SERVER_ID>` for loader
  mode). Both `--yes` and `--registry` MUST come BEFORE
  `@jfrog/agent-guard` so `npx` picks them up; otherwise `npx` falls
  back to the user's default registry (resolves to 404) and may
  block on a confirmation prompt with no TTY.
- **OAuth login** uses `npx @jfrog/agent-guard --login` (Step 5).
  Run it automatically after Step 4 for remote MCPs that have no
  required headers, and again later if a previously-working OAuth
  MCP starts failing with refresh errors. Never tell the user to
  authenticate via the IDE's native OAuth dialog or by hand-editing
  `~/.jfrog/jfrogmcp.conf.json`.
- `_JF_ARGS` MUST contain `project=<NAME>&mcp=<PACKAGE_NAME>`.
- Package name MUST come from the catalog API. NEVER guess.
- NEVER pipe a catalog command through `python3`, and NEVER capture it
  with `2>&1` - `npx`/`npm` writes progress to stderr, which corrupts
  the output stream. For `--list-available` present the compact TSV it
  prints; for `--inspect` read the JSON it prints on stdout
  directly (or with a single `jq` filter), never via `python3`.
- NEVER install MCPs directly via `npx`/`pip`/`docker` - always use the
  agent guard pattern above.
- NEVER write `"type": "sse"`, `"type": "http"`, or a top-level `"url"`
  field in `.vscode/mcp.json`. Every server entry is `"type": "stdio"`
  pointing at `npx @jfrog/agent-guard`, even when the catalog MCP is
  remote-only - the agent guard proxies remote transports for you. Writing
  `sse`/`http`/`url` bypasses the agent guard and triggers VS Code's
  native remote-MCP OAuth dialog instead of using the configured
  `${input:...}` secret.
- NEVER use Fetch/WebFetch for API calls that require authentication.
- NEVER show access tokens or API keys in any output or message.
- NEVER ask for info you can find in existing config or in
  `~/.jfrog/jfrog-cli.conf.v6` (macOS/Linux and Windows PowerShell) or
  `%USERPROFILE%\.jfrog\jfrog-cli.conf.v6` (Windows CMD). Always read
  this file via a terminal command - never via file-search or glob
  tools, which skip hidden directories.
- NEVER try multiple servers - always ask the user to pick one.
- To list installed MCPs: read `.vscode/mcp.json` and show the servers.
