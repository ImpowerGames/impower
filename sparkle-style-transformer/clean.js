const fs = require("fs");

const folderPath = process.argv.slice(2)?.[0];
fs.rmSync(folderPath, { recursive: true, force: true });
