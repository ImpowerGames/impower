import { main } from "../../.agents/hooks/pre-tool-use.mjs";
main("claude").catch((error) => { console.error(error); process.exitCode = 2; });
