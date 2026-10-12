import { pathToFileURL } from "node:url";
import { main } from "../../.agents/hooks/worktree-cleanup.mjs";
export { decide } from "../../.agents/hooks/worktree-cleanup.mjs";
if (process.argv[1] && pathToFileURL(process.argv[1]).href.toLowerCase() === import.meta.url.toLowerCase()) main().catch(error => { console.error(error); process.exitCode = 2; });
