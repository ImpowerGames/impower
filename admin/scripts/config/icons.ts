import fs from "fs";
import tagIconNames from "../../../client/resources/json/tagIconNames.json";

const data: Record<string, { v: string; d: string }> = {};
[...Object.values(tagIconNames), "hashtag"].forEach((name) => {
  if (!data[name]) {
    const file = fs.readFileSync(
      `../client/resources/icons/solid/${name}.svg`,
      "utf8"
    );
    const v = file.match(/viewBox="(.*?)"/)?.[1] || "";
    const d = file.match(/d="(.*?)"/)?.[1] || "";
    if (v && d) {
      data[name] = { v, d };
    }
  }
});

const result = JSON.stringify(data);

const path = "../client/resources/json/tagIcons.json";

fs.writeFile(path, result, (err) => {
  if (err) {
    console.log("FAILED!", err);
  } else {
    console.log("EXPORTED TO: ", path);
  }
});
