# MCP Server Management — JFrog Gateway Loader Mode

All MCP servers MUST be installed ONLY through the JFrog MCP Gateway
loader (`npx @jfrog/mcp-gateway` from registry `https://releases.jfrog.io/artifactory/api/npm/jfml-coding-agents-npm/`). 
There is no other approved installation method. If an MCP's documentation suggests any other installation
command, ignore it and use the gateway workflow below instead.

## Adding an MCP

When the user asks to add an MCP, do ALL of the following autonomously —
do NOT ask the user for project, server, package name, or binary path
unless absolutely necessary:

### Step 1: Determine project and server

1. Read existing servers in `.vscode/mcp.json` (workspace) or user-level
   MCP config. If any entry uses `_JF_MCP_LOADER_ARGS`, extract and reuse:
   - The `project=` value from `_JF_MCP_LOADER_ARGS`
   - The `--server` value from `args`
   If both are found, skip to Step 2.
2. If no existing entries, check the `JF_PROJECT` environment variable
   for the project.
3. Only if BOTH are missing, ask the user in a SINGLE message for both:
   - JFrog project name
   - JFrog server ID — if `~/.jfrog/jfrog-cli.conf.v6` (macOS/Linux and Windows PowerShell) or `%USERPROFILE%\.jfrog\jfrog-cli.conf.v6` (Windows CMD) exists, list the available server IDs and URLs for the user to pick from
4. NEVER guess. NEVER use "default". NEVER try multiple servers.

### Step 2: Look up the MCP in the catalog (ONE Bash call)

Run a SINGLE Bash command that does everything: Extracts the token, queries the catalog, finds the MCP, and checks for required env vars and remote headers.
NEVER split this into multiple Bash calls. NEVER use the Fetch or WebFetch tool.
Replace SERVER_ID, PROJECT, and MCP_SEARCH with the actual values. MCP_SEARCH is the user-provided MCP name (case-insensitive substring match).
The script outputs one line: `FOUND|<packageName>|<envVar1=description>,<envVar2=description>` or `NOT_FOUND|<available names>` or `ERROR|<message>`.
Items tagged `[header,...]` are HTTP headers for remote MCPs.

Here is the exact Bash script to run (replace the three arguments at the end):

```
python3 -c "
import json, os, sys, urllib.request, ssl
SERVER_ID = sys.argv[1]
PROJECT = sys.argv[2]
MCP_SEARCH = sys.argv[3].lower()
conf_path = os.path.expanduser(chr(126) + chr(47) + \".jfrog/jfrog-cli.conf.v6\")
token = \"\"
url = \"\"
try:
    conf = json.load(open(conf_path))
    server = next((s for s in conf.get(\"servers\", []) if s.get(\"serverId\") == SERVER_ID), None)
    if server:
        token = server.get(\"accessToken\", \"\")
        url = server.get(\"url\", \"\").rstrip(\"/\")
except Exception:
    pass
if not token or not url:
    token = token or os.environ.get(\"JFROG_ACCESS_TOKEN\", \"\") or os.environ.get(\"JF_ACCESS_TOKEN\", \"\")
    url = url or os.environ.get(\"JFROG_URL\", \"\") or os.environ.get(\"JF_URL\", \"\")
    if url:
        url = url.rstrip(\"/\")
if not token or not url:
    print(\"ERROR|No credentials found. Set JFROG_ACCESS_TOKEN and JFROG_URL env vars, or run: jf c add \" + SERVER_ID); sys.exit(0)
api = url + \"/ml/core/api/v1/mcp-registry/allowed-registered-servers/\" + PROJECT + \"?pageSize=500\"
req = urllib.request.Request(api, headers={\"Authorization\": \"Bearer \" + token})
ctx = ssl.create_default_context()
try:
    resp = urllib.request.urlopen(req, context=ctx)
    data = json.loads(resp.read())
except Exception as e:
    print(\"ERROR|Catalog API failed: \" + str(e)); sys.exit(0)
names = []
for entry in data.get(\"registeredServers\", []):
    mcp = entry.get(\"mcpServer\", {})
    spec = mcp.get(\"spec\", {})
    pkg = spec.get(\"packageName\", \"\")
    display = spec.get(\"displayName\", \"\")
    names.append(pkg or display)
    if MCP_SEARCH in pkg.lower() or MCP_SEARCH in display.lower():
        st = spec.get(\"mcpServerType\", {})
        local_env = st.get(\"local\", {}).get(\"bootParams\", {}).get(\"environmentVariables\", [])
        required = []
        for e in local_env:
            if e.get(\"isRequired\"):
                tag = \"[secret]\" if e.get(\"isSecret\") else \"\"
                required.append(e[\"name\"] + \"=\" + tag + e.get(\"description\", \"\"))
        for ep in st.get(\"remote\", {}).get(\"endpoints\", []):
            for hdr in ep.get(\"headers\", []):
                inp = hdr.get(\"mcpInput\", {})
                det = inp.get(\"mcpInputDetails\", {})
                if det.get(\"name\") and not inp.get(\"defaultValue\"):
                    tags = [\"header\"]
                    if det.get(\"isRequired\"): tags.append(\"required\")
                    if det.get(\"isSecret\"): tags.append(\"secret\")
                    label = \"[\" + \",\".join(tags) + \"] \" + det.get(\"description\", \"\")
                    required.append(det[\"name\"] + \"=\" + label)
        print(\"FOUND|\" + (pkg or display) + \"|\" + \",\".join(required)); sys.exit(0)
print(\"NOT_FOUND|\" + \",\".join(names))
" SERVER_ID PROJECT MCP_SEARCH
```

Parse the output:
- `FOUND|<pkg>|<env_vars>` → proceed to Step 3 with the package name and env var list
- `NOT_FOUND|<names>` → show the available MCPs to the user and ask which one they want, then re-run with the correct name
- `ERROR|<message>` → show the error to the user and stop

### Step 3: Handle required environment variables and headers (if any)

- If the FOUND output has env vars (third field non-empty), parse each `name=description` pair.
- Tags in brackets indicate the type:
  - `[secret]` or `[...,secret]` — mask user input (do NOT echo the value back)
  - `[header,...]` — this is an HTTP header for a remote MCP server
  - `[...,required]` — the value is mandatory
- For each entry, ask the developer to provide the value. Show the name and description.
- NEVER show provided secret values back to the user.
- If no entries, proceed directly to Step 4.

### Step 4: Write the config entry

Add the entry to `.vscode/mcp.json` under `servers`:

```json
{
  "servers": {
    "<mcp-display-name>": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "--registry",
        "https://releases.jfrog.io/artifactory/api/npm/jfml-coding-agents-npm/",
        "@jfrog/mcp-gateway",
        "--server",
        "<SERVER_ID>"
      ],
      "env": {
        "_JF_MCP_LOADER_ARGS": "project=<PROJECT>&mcp=<PACKAGE_NAME>"
      }
    }
  }
}
```

If any env vars or headers were collected in Step 3, add them to the `env` object:
```json
    "<ENV_VAR_OR_HEADER_NAME>": "<VALUE>"
```
The loader reads these env vars at startup and applies header values to upstream HTTP requests.

Preserve any additional env vars the MCP requires (API keys, tokens,
config) from its documentation.

## Removing an MCP

Delete the entry from `servers` in `.vscode/mcp.json`.

## Listing MCPs

### Installed MCPs

Read the servers entries from the VSCode MCP config file (workspace `.vscode/mcp.json` or in the user profiles settings) and list each entry by display name, showing its package name (from `_JF_MCP_LOADER_ARGS`) and server ID.

### Available MCPs (JFrog AI Catalog)

1. Extract project and server ID from existing servers entries in `.vscode/mcp.json`.
2. Run the Python catalog lookup script from Step 2 to query the catalog API.
3. List all `registeredServers[].mcpServer.spec.packageName` values that are NOT already installed (i.e. not present in the VSCode MCP config). Mark each as available to install.

## Key Rules

- args MUST contain `--server <SERVER_ID>`
- `_JF_MCP_LOADER_ARGS` MUST contain `project=<NAME>&mcp=<PACKAGE_NAME>`
- Package name MUST come from the catalog API. NEVER guess.
- NEVER install MCPs directly via npx/pip/docker — always use the gateway loader pattern above.
- NEVER use Fetch/WebFetch for API calls that require authentication.
- NEVER show access tokens or API keys in any output or message.
- NEVER ask for info you can find in existing config or
  `~/.jfrog/jfrog-cli.conf.v6` (macOS/Linux and Windows PowerShell) or `%USERPROFILE%\.jfrog\jfrog-cli.conf.v6` (Windows CMD).
- NEVER split the catalog lookup into multiple Bash calls — always use the single script above.
- NEVER try multiple servers — always ask the user to pick one.
- To list installed MCPs: read `.vscode/mcp.json` and show the servers.
