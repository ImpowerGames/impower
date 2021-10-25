import fs from "fs";
import phrases from "../input/phrases.json";

const uniquePhrases = Array.from(new Set(phrases));
const result = uniquePhrases
  .sort()
  .sort((a, b) => (a.length < b.length ? -1 : 1));
const path = "./src/input/phrases.json";

fs.writeFile(path, JSON.stringify(result), (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
