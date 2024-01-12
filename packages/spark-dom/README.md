Run spark games in a browser environment.

## Getting Started

```javascript
import { GameParser, GameContext } from "spark-engine";

const parser = new GameParser();
const program = parser.parse(script);
const game = new GameContext(program);

let prevTime = 0;
let loopRequestId = 0;

/**
 * Execute the game loop
 */
const gameLoop = () => {
  const time = Date.now();
  const delta = (time - prevTime) / 1000; // Get time since last frame
  prevTime = time;
  // Execute game logic
  if (game.update(time, delta)) {
    loopRequestId = window.requestAnimationFrame(gameLoop); // Continue the game loop
  } else {
    window.cancelAnimationFrame(loopRequestId); // Stop the game loop
  }
};

/**
 * Load the game
 */
const loadGame = async () => {
  game.init(); // Initialize game
  await game.start(); // Start game
  loopRequestId = window.requestAnimationFrame(gameLoop); // Start the game loop
};

// Load the game once the window loads
window.onload = loadGame;
```
