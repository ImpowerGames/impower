import { pathToFileURL } from "node:url";
import { main } from "../../.agents/hooks/doubled-backslash-hook.mjs";
export { decide } from "../../.agents/hooks/doubled-backslash-hook.mjs";

if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) {
  main().catch((error) => { console.error(error); process.exitCode = 2; });
}
