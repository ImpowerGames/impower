import { main } from "../../.agents/hooks/session-title.mjs";
main(process.argv[2], "claude").catch((error) => { console.error(`Session title hook: ${error.message}`); process.exitCode = 2; });
