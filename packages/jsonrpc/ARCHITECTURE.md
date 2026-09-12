# Messaging ownership

`@impower/jsonrpc/src` owns the internal message envelopes, factories and
classification guards. It imports no LSP, DAP or MCP runtime and no browser
helpers. Guards classify envelopes; they do not validate application payloads.
Worker, Window and MessagePort connections remain under `src/browser`.

`spark-editor-protocol` depends on that core and owns editor, workspace and
preview operations. Existing deep imports remain compatibility facades.
Notification `remote` hints belong to the editor relay facade. The CustomEvent
bus stays in `protocols/MessageProtocol`; it is a browser integration.
Engine operations and the engine connection stay with `spark-engine`.

LSP integration uses real upstream descriptors via `integrations/lsp`, preserving
the upstream by-name parameter encoding. Upstream interfaces are type-only
imports; explicit Spark extensions include diagnostics whose message may contain
markup. The generic descriptors do not inherit from LSP classes.
The existing DAP debug adapter translates its distinct envelope into engine
operations. MCP remains a separate future adapter.

Internal replies include `method` for routing as well as `id`. Standard JSON-RPC
replies correlate by `id` and do not carry `method`; an external adapter must
maintain that mapping instead of forwarding internal envelopes unchanged.
Responses carry exactly one of `result` or `error`. Connections that normalize
undefined handler results send explicit `null`.

Progress uses `method/progress`; matchers also accept the legacy bare method with
`value`. Neither form is a final response. Progress values and cancellation
messages are internal conventions, not promises of LSP or MCP compatibility.

Browser payloads use structured clone and may contain ArrayBuffers with transfer
lists. They are not necessarily JSON serializable. #500 owns socket serialization,
binary/resource references, external schemas and validation, progress/cancellation
mapping, authoritative completion semantics, the in-page bridge and MCP mappings.
This refactor does not replace every connection or change those external wire formats.

No bundle-size or runtime-performance improvement is claimed.
