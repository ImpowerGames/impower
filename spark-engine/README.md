The Spark Engine is a light-weight library used to run spark games in a browser environment.

## Getting Started

```typescript
import { parseSpark } from "sparkdown";
import {
  generateSectionBlocks,
  generateStructObjects,
  SparkGame,
  SparkContext,
} from "spark-engine";

const parsed = parseSpark(script);
const gameContext = new SparkContext(parsed);

/**
 * Update all loaded blocks.
 *
 * @param time — The current time in ms
 * @param delta — The delta time in ms since the last frame update.
 *
 * @returns true if the game should continue running
 */
const updateLoadedBlocks = (time: number, delta: number): boolean => {
  for (let i = 0; i < gameContext.loadedBlockIds.length; i += 1) {
    const id = loadedBlockIds[i];
    if (!gameContext.update(id, time, delta)) {
      return false; // Player quit the game
    }
  }
  return true;
};

let prevTime = 0;
let loopRequestId = 0;

/**
 * Execute the game loop
 *
 * @param time — The current time in ms
 */
const loop = (time: number): void => {
  const delta = (time - prevTime) / 1000; // Get time since last frame
  prevTime = time;
  // Execute game logic
  if (updateLoadedBlocks(time, delta)) {
    loopRequestId = window.requestAnimationFrame(loop); // Continue the game loop
  } else {
    window.cancelAnimationFrame(loopRequestId); // Stop the game loop
  }
};

/**
 * Load the game
 */
const loadGame = (): void => {
  gameContext.init(); // Initialize game
  gameContext.start(); // Start game
  loopRequestId = window.requestAnimationFrame(loop); // Start the game loop
};

// Load the game once the window loads
window.onload = loadGame;
```
