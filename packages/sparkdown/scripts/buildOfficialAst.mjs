// Run with an activated Emscripten 4.0.10 SDK and a checkout of upstream Luau.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/tests/luau-conformance/upstream",
);
const typecheck = process.argv[3] === "--typecheck";
if (process.argv[3] && !typecheck)
  throw new Error("Expected --typecheck or no third argument");
const artifactDir = join(target, typecheck ? "typecheck-ast" : "ast");
const pin = typecheck
  ? JSON.parse(readFileSync(join(target, "typecheck-cases.json"), "utf8")).pin
  : readFileSync(join(target, "VENDORING.md"), "utf8").match(
      /copied from: `([a-f0-9]+)`/,
    )[1];
const upstream = resolve(process.argv[2]);
const head = execFileSync("git", ["-C", upstream, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (head !== pin)
  throw new Error(`Expected conformance pin ${pin}, got ${head}`);
if (
  execFileSync(
    "git",
    ["-C", upstream, "status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim()
)
  throw new Error("Upstream checkout must be clean");
if (!process.env.EMSDK)
  throw new Error(
    "Activate Emscripten 4.0.10 before rebuilding (EMSDK is absent)",
  );
const python = process.env.EMSDK_PYTHON || "python";
const compiler = join(process.env.EMSDK, "upstream/emscripten/em++.py");
const version = execFileSync(python, [compiler, "--version"], {
  encoding: "utf8",
}).split("\n")[0];
if (!version.includes("4.0.10"))
  throw new Error(`Expected Emscripten 4.0.10, got ${version}`);
const sources = ["Common", "Ast"].flatMap((dir) =>
  readdirSync(join(upstream, dir, "src"))
    .filter((f) => f.endsWith(".cpp"))
    .map((f) => join(upstream, dir, "src", f)),
);
execFileSync(
  python,
  [
    compiler,
    "-std=c++17",
    "-O2",
    "-funsigned-char",
    "-fexceptions",
    ...["Common", "Ast", "Analysis"].map(
      (dir) => `-I${join(upstream, dir, "include")}`,
    ),
    `-I${join(upstream, "Analysis/src")}`,
    ...sources,
    join(artifactDir, "bridge.cpp"),
    "-sMODULARIZE=1",
    "-sENVIRONMENT=node",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sSTACK_SIZE=8388608",
    "-sEXPORTED_FUNCTIONS=_parse_ast,_parse_errors,_parse_error_json,_malloc,_free",
    "-sEXPORTED_RUNTIME_METHODS=ccall,HEAPU8",
    "-o",
    join(artifactDir, "luau-ast.cjs"),
  ],
  { stdio: "inherit" },
);
// Match Git's LF checkout policy before hashing Emscripten's Windows output.
const loader = join(artifactDir, "luau-ast.cjs");
writeFileSync(
  loader,
  readFileSync(loader, "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^[ \t]+$/gm, ""),
);
const sha256 = (file) =>
  createHash("sha256")
    .update(readFileSync(join(artifactDir, file)))
    .digest("hex");
writeFileSync(
  join(artifactDir, "build.json"),
  JSON.stringify(
    {
      upstream: pin,
      emscripten: "4.0.10",
      sha256: Object.fromEntries(
        ["bridge.cpp", "luau-ast.cjs", "luau-ast.wasm"].map((file) => [
          file,
          sha256(file),
        ]),
      ),
    },
    null,
    2,
  ) + "\n",
);
