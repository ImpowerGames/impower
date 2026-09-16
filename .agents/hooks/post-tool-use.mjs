import { main } from "./session-title.mjs";

main("post", process.argv[2]).catch((error) => { console.error(`Repository hook could not record this operation: ${error.message}`); process.exitCode = 2; });
