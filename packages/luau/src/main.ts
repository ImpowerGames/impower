import { loadLuau, type Luau } from "./luau.js";

const SAMPLE = `-- Welcome to the Luau WebAssembly demo!
-- Edit this script and hit Run.

local function fib(n: number): number
  if n < 2 then return n end
  return fib(n - 1) + fib(n - 2)
end

for i = 0, 10 do
  print(string.format("fib(%2d) = %d", i, fib(i)))
end

return "done"
`;

const sourceEl = document.getElementById("source") as HTMLTextAreaElement;
const runEl = document.getElementById("run") as HTMLButtonElement;
const checkEl = document.getElementById("check") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLSpanElement;
const resultEl = document.getElementById("result") as HTMLPreElement;

sourceEl.value = SAMPLE;

function setOutput(text: string, isError = false) {
  resultEl.textContent = text;
  resultEl.classList.toggle("error", isError);
}

function setStatus(text: string) {
  statusEl.textContent = text;
}

async function init() {
  let luau: Luau;
  try {
    luau = await loadLuau();
  } catch (err) {
    setStatus("Failed to load Luau WASM");
    setOutput(
      `Could not load Luau.Web.js.\n\n${(err as Error).message}\n\n` +
        "Run `npm run build:wasm` (requires Docker) to produce src/wasm/Luau.Web.js.",
      true
    );
    return;
  }

  setStatus("Ready");
  runEl.disabled = false;
  if (luau.hasCheck) {
    checkEl.disabled = false;
  } else {
    checkEl.title = "checkScript is not available in this Luau build";
    checkEl.style.display = "none";
  }

  runEl.addEventListener("click", () => {
    setStatus("Running…");
    try {
      const out = luau.execute(sourceEl.value);
      setOutput(out || "(no output)");
      setStatus("Ready");
    } catch (err) {
      setOutput((err as Error).message, true);
      setStatus("Error");
    }
  });

  checkEl.addEventListener("click", () => {
    setStatus("Type-checking…");
    try {
      const errors = luau.check(sourceEl.value, true);
      setOutput(errors || "No type errors.", Boolean(errors));
      setStatus("Ready");
    } catch (err) {
      setOutput((err as Error).message, true);
      setStatus("Error");
    }
  });
}

void init();
