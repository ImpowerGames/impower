import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const playerCss = readFileSync(resolve(__dirname, "../../spark-web-player.css"), "utf8");
const iconSource = resolve(__dirname, "../../../../impower-ui/src/icons/svg/replay-beat.svg");

const replayBeatMask = () => {
  const rule = playerCss.match(
    /\.transport-icon\[data-icon="replay-beat"\]\s*\{([^}]*)\}/,
  );
  return rule?.[1]?.match(/mask-image:\s*url\('data:image\/svg\+xml,(.*?)'\);/)?.[1];
};

describe("the player bar's Replay beat icon", () => {
  it("masks with the replay-beat glyph from the impower-ui icon set", () => {
    expect(existsSync(iconSource)).toBe(true);
    expect(replayBeatMask()).toBe(readFileSync(iconSource, "utf8").trim());
  });
});
