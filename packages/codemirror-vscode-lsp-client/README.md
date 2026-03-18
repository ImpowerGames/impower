# Codemirror VSCode LSP Client

Based on [@codemirror/lsp-client](https://github.com/codemirror/lsp-client), but modified to more closely match the behavior of (vscode-languageclient)[https://www.npmjs.com/package/vscode-languageclient]

## Install

```
npm install @impower/codemirror-vscode-lsp-client
npm install vscode-languageserver-protocol
npm install marked

npm install @codemirror/autocomplete
npm install @codemirror/language
npm install @codemirror/lint
npm install @codemirror/state
npm install @codemirror/view
npm install @lezer/highlight
```

## Usage

There are various ways to run a language server and connect it to a
web page. You can run it on the server and proxy it through a web
socket, or, if it is written in JavaScript or can be compiled to WASM,
run it directly in the client. The @codemirror/lsp-client package
talks to the server through a ([`Transport`](#lsp-client.Transport))
object, which exposes a small interface for sending and receiving JSON
messages.

Responsibility for how to actually talk to the server, how to connect
and to handle disconnects are left to the code that implements the
transport.

This example uses a crude transport that doesn't handle errors at all.

```javascript
import {Transport, LSPClient, languageServerExtensions} from "@codemirror/lsp-client"
import {basicSetup, EditorView} from "codemirror"
import {typescriptLanguage} from "@codemirror/lang-javascript"

function simpleWebSocketTransport(uri: string): Promise<Transport> {
  let handlers: ((value: string) => void)[] = []
  let sock = new WebSocket(uri)
  sock.onmessage = e => { for (let h of handlers) h(e.data.toString()) }
  return new Promise(resolve => {
    sock.onopen = () => resolve({
      send(message: string) { sock.send(message) },
      subscribe(handler: (value: string) => void) { handlers.push(handler) },
      unsubscribe(handler: (value: string) => void) { handlers = handlers.filter(h => h != handler) }
    })
  })
}

let transport = await simpleWebSocketTransport("ws://host:port")
let client = new LSPClient({extensions: languageServerExtensions()}).connect(transport)

new EditorView({
  extensions: [
    basicSetup,
    typescriptLanguage,
    client.plugin("file:///some/file.ts"),
  ],
  parent: document.body
})
```
