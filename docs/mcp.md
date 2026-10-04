# MCP server

`apps/mcp`. A Model Context Protocol server, over stdio, run on the machine
the assistant runs on. It exists so that somebody working on a project can ask
"which box is the soldering iron in" and get an answer without getting up: the
inventory is the memory, and this is how a model reads it.

It is **the third consumer of `packages/api-client`**, and it contains no HTTP
at all. That is the point rather than a detail — the shared client was built
for a browser and a phone, and a third consumer that had to write its own
requests would have proved the abstraction was two special cases wearing a
coat. One thing was genuinely missing and was added there rather than worked
around here: the client now takes the `Authorization` scheme as an option, so
it can carry a machine token as well as a session (ADR 17).

```
src/main.ts         The process. stdio IS the transport, so nothing prints.
src/configuration.ts  The address and the credential, out of the environment.
src/server.ts       The tools, and what their descriptions tell a model.
src/waymark.ts      The shared client, asked for the Machine scheme.
src/confirming.ts   Why a write is two calls and the second cannot be guessed.
src/credential.ts   What this token may do, asked before a write is offered.
src/failures.ts     One refusal, one sentence, no stack traces.
src/render.ts       Why an answer is lines rather than JSON.
src/tools/          One file per tool.
```

## The tools

| Tool | Answers |
| --- | --- |
| `waymark_search` | Where something is. Every hit with its full path. |
| `waymark_unit` | What one storage unit holds: units inside it, items in it. |
| `waymark_tree` | Every storage unit, nested, as an indented outline. |
| `waymark_items` | Every item in the house, each with where it is. |
| `waymark_add_item` | Records an item in a unit. **Confirmed**, see below. |
| `waymark_move_items` | Moves items into another unit. **Confirmed**. |

**Answers are lines, not JSON.** The reader is a model with a context budget,
and a forty-box inventory rendered as nested objects is mostly punctuation:
every row repeats every key in quotes, and the fields that carry no
information — `"quantity": 1`, `"tags": []`, `"description": null`, two
timestamps — repeat with them. So one line per thing, the location first
because the location is the answer, the id last and labelled because a model
needs it and a person never does, and anything that is only ever the default
left off. Two tests measure the rendered answer against the JSON it replaces
rather than asserting it is smaller.

**A refusal is a sentence that says what to do.** No token, a token the API
refused, an API that did not answer and a write a read-only credential may not
make are four situations with four different next moves, and a stack trace is
none of them. Each one names what happened, says whether anything changed, and
gives the command or the variable that fixes it. The token is never
interpolated into any of them — they are written from the variable's NAME — and
every answer is scrubbed of it on the way out anyway, because a rule holds
until somebody adds a path that breaks it and a credential in a transcript
cannot be taken back.

## A write is two calls, and the second one cannot be guessed

The two tools that change the inventory are confirmed rather than automatic.
The obvious way to build that is a `confirm: true` argument, and it is
worthless: the reader is a model, `true` is the value it reaches for, and a
mechanism that can be satisfied by pattern-matching has already been defeated.

So the confirmation is a **capability, not an assertion**. Called without one,
a write tool changes nothing: it resolves what it WOULD do — a real request, so
a box that does not exist is found out here — describes it in names and full
paths rather than ids, and answers with a code. The code is fifty random bits
from a CSPRNG, bound to a fingerprint of that exact change, spent once, and
lapsed after five minutes. `yes`, `true`, `confirm`, `I confirm` and a code
issued for a different change are each asserted to fail and to write nothing.

What that buys is structural: **a write is impossible unless its
plain-language description was put in the conversation first**, where the
person can read it. What it cannot do — and nothing inside an MCP server
can — is prove that a human did read it. That is what the scope is for.

**A `read` token makes writes impossible at the API regardless**, in the hook
that authenticated it, before the body is parsed (ADR 17). That is the
guarantee; the confirmation is the courtesy on top of it. Handed one, the write
tools say so in words — "the machine token \"mcp-server\" is read-only, so it
may read the inventory but may not change it" — and they say it BEFORE
previewing anything, by asking `GET /auth/me` what the credential may do. A
preview that invites somebody to agree to something the server already knows it
cannot do would be worse than the 403 it was trying to avoid.

## Running it

Create a token on the Waymark server, read-only unless the assistant is meant
to file things away:

```sh
pnpm --filter @waymark/api machine-token create --name mcp-server --scope read
```

Then, in the MCP client's settings:

```json
{
  "mcpServers": {
    "waymark": {
      "command": "/absolute/path/to/waymark/apps/mcp/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/waymark/apps/mcp/src/main.ts"],
      "env": {
        "WAYMARK_API_URL": "https://waymark.example",
        "WAYMARK_MACHINE_TOKEN": "wmk_..."
      }
    }
  }
}
```

Absolute paths to the checkout's own `tsx` rather than `pnpm start`, because an
MCP client started from a desktop session often has no package manager on its
`PATH` — and because **stdout is the transport**, so anything that prints to it
breaks the session rather than logging. Nothing in this package writes to
stdout; diagnostics go to stderr, which the client shows in its log.

| Variable | Default | What it decides |
| --- | --- | --- |
| `WAYMARK_MACHINE_TOKEN` | _unset_ | The credential. There is no default, and there will not be one. |
| `WAYMARK_API_URL` | `http://127.0.0.1:3000` | Where Waymark is, as this machine sees it. |

**Missing configuration does not stop it starting.** A server that exits is
drawn by its client as "failed", with the reason in a log file nobody has open;
one that starts and answers "Waymark has no machine token, create one with
..." puts the fix in front of the person who is at that moment asking where
something is. The tools stay listed for the same reason: an assistant told
there are no tools says Waymark is unavailable and stops.

```sh
pnpm --filter @waymark/mcp test
pnpm --filter @waymark/mcp typecheck
pnpm --filter @waymark/mcp start        # only useful with a client on the other end
```

Tests stub the API at the HTTP boundary with MSW and never mock
`@waymark/api-client` — a test that replaced the client would prove the
replacement was called and say nothing about the contract — and the tools are
driven through the real protocol over the SDK's in-memory transport, so a tool
that is not registered, a schema that rejects what a model would send, or a
refusal that arrives as a failed call rather than as a readable answer all fail
here.
