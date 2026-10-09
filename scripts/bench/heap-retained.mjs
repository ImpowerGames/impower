#!/usr/bin/env node
// Reads a heap snapshot that preview-bench.mjs --heap-probe wrote, with the
// parsed classes it counted beside it, and measures what the parsed objects
// hold (#1712): their own size, and the heap that only they keep alive, which
// is everything reachable from the snapshot's root that stops being reachable
// once no path may pass through a parsed object. That is the heap a compile
// with no parsed objects would not hold, provided whatever they lead to is
// not kept some other way.
//
//   node scripts/bench/heap-retained.mjs <file>.edit
//
// reads <file>.edit.heapsnapshot and <file>.edit.parsed.json. Weak edges
// keep nothing alive and are not followed.

import fs from "node:fs";
import { fileURLToPath } from "node:url";

// The numbers of one flat array of the snapshot ("nodes" or "edges"),
// read from the bytes after its opening bracket.
function readNumbers(buffer, key, count) {
  const at = buffer.indexOf(`"${key}":[`);
  if (at < 0) throw new Error(`no ${key} in the snapshot`);
  const out = new Float64Array(count);
  let n = 0;
  let value = 0;
  let inNumber = false;
  for (let i = at + key.length + 4; i < buffer.length; i++) {
    const c = buffer[i];
    if (c >= 48 && c <= 57) {
      value = value * 10 + (c - 48);
      inNumber = true;
    } else {
      if (inNumber) {
        out[n++] = value;
        value = 0;
        inNumber = false;
      }
      if (c === 93) break; // ]
    }
  }
  if (n !== count) throw new Error(`${key}: read ${n} numbers, expected ${count}`);
  return out;
}

export function readSnapshot(file) {
  const buffer = fs.readFileSync(file);
  const nodesAt = buffer.indexOf('"nodes":[');
  const meta = JSON.parse(buffer.subarray(0, nodesAt).toString("utf8").replace(/,\s*$/, "") + "}").snapshot;
  const nodeFields = meta.meta.node_fields;
  const edgeFields = meta.meta.edge_fields;
  const nodes = readNumbers(buffer, "nodes", meta.node_count * nodeFields.length);
  const edges = readNumbers(buffer, "edges", meta.edge_count * edgeFields.length);
  const stringsAt = buffer.indexOf('"strings":[');
  const end = buffer.lastIndexOf("]");
  const strings = JSON.parse(buffer.subarray(stringsAt + 10, end + 1).toString("utf8"));
  return { meta, nodes, edges, strings };
}

// Sizes in bytes: every node reachable from the root, the parsed objects'
// own, and what stays reachable when no path passes through one of them.
export function retainedBy(snapshot, isParsedName) {
  const { meta, nodes, edges, strings } = snapshot;
  const nf = meta.meta.node_fields;
  const ef = meta.meta.edge_fields;
  const N = nf.length;
  const E = ef.length;
  const NAME = nf.indexOf("name");
  const SIZE = nf.indexOf("self_size");
  const EDGES = nf.indexOf("edge_count");
  const TYPE = nf.indexOf("type");
  const ETYPE = ef.indexOf("type");
  const TO = ef.indexOf("to_node");
  const nodeTypes = meta.meta.node_types[TYPE];
  const edgeTypes = meta.meta.edge_types[ETYPE];
  const weak = edgeTypes.indexOf("weak");
  const shortcut = edgeTypes.indexOf("shortcut");
  const objectType = nodeTypes.indexOf("object");
  const count = nodes.length / N;
  const firstEdge = new Uint32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) {
    firstEdge[i] = e;
    e += nodes[i * N + EDGES] * E;
    firstEdge[i + 1] = e;
  }
  const parsed = new Uint8Array(count);
  const byClass = {};
  let parsedSelf = 0;
  for (let i = 0; i < count; i++) {
    if (nodes[i * N + TYPE] !== objectType) continue;
    const name = strings[nodes[i * N + NAME]];
    if (!isParsedName(name)) continue;
    parsed[i] = 1;
    parsedSelf += nodes[i * N + SIZE];
    const c = (byClass[name] ??= { count: 0, selfBytes: 0 });
    c.count += 1;
    c.selfBytes += nodes[i * N + SIZE];
  }
  const reach = (skipParsed) => {
    const seen = new Uint8Array(count);
    const stack = [0];
    seen[0] = 1;
    let bytes = 0;
    while (stack.length) {
      const i = stack.pop();
      bytes += nodes[i * N + SIZE];
      for (let e = firstEdge[i]; e < firstEdge[i + 1]; e += E) {
        const t = edges[e + ETYPE];
        if (t === weak || t === shortcut) continue;
        const to = edges[e + TO] / N;
        if (seen[to] || (skipParsed && parsed[to])) continue;
        seen[to] = 1;
        stack.push(to);
      }
    }
    return bytes;
  };
  const reachable = reach(false);
  const withoutParsed = reach(true);
  return { nodes: count, reachableBytes: reachable, parsedSelfBytes: parsedSelf, retainedBytes: reachable - withoutParsed, byClass };
}

function main(args) {
  const base = args[0];
  if (!base) throw new Error("pass the --heap-probe path with its mode, e.g. <file>.edit");
  const probe = JSON.parse(fs.readFileSync(`${base}.parsed.json`, "utf8"));
  const names = new Set(Object.keys(probe.byClass));
  const result = retainedBy(readSnapshot(`${base}.heapsnapshot`), (name) => names.has(name));
  const mb = (b) => (b / 1048576).toFixed(1);
  const counted = Object.values(result.byClass).reduce((a, c) => a + c.count, 0);
  console.log(
    [
      `${base}: ${result.nodes} nodes, ${mb(result.reachableBytes)} MB reachable`,
      `parsed objects: ${counted} in the snapshot (${probe.parsedObjects} counted by the probe, prototypes among them), ${mb(result.parsedSelfBytes)} MB of their own`,
      `held only through parsed objects: ${mb(result.retainedBytes)} MB`,
      "",
      "  by class (count, own MB), largest first:",
      ...Object.entries(result.byClass)
        .sort((a, b) => b[1].selfBytes - a[1].selfBytes)
        .slice(0, 15)
        .map(([name, c]) => `    ${name.padEnd(28)} ${String(c.count).padStart(8)} ${mb(c.selfBytes).padStart(8)}`),
    ].join("\n"),
  );
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
