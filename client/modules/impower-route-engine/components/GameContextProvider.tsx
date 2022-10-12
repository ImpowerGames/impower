import React, { useContext, useEffect, useRef, useState } from "react";
import {
  FileData,
  generateSectionBlocks,
  generateStructObjects,
  getScriptAugmentations,
  loadStyles,
  loadUI,
  SaveData,
  SparkContext,
  SparkGame,
  SparkGameRunner,
} from "../../../../spark-engine";
import { getSectionAtLine, parseSpark } from "../../../../sparkdown";
import { GameContext } from "../contexts/gameContext";
import { ProjectEngineContext } from "../contexts/projectEngineContext";

const createGame = (
  script: string,
  files: Record<string, FileData>,
  seed: string,
  activeLine: number,
  debugging: boolean,
  editable: boolean,
  saveData?: SaveData
): SparkContext => {
  const result = parseSpark(script, getScriptAugmentations(files), {
    lineOffset: 1,
  });
  const blockMap = generateSectionBlocks(result?.sections);
  const objectMap = generateStructObjects(result?.structs);
  const [startBlockId] = getSectionAtLine(activeLine, result?.sections);
  const startRuntimeBlock = blockMap?.[startBlockId];
  let startCommandIndex = 0;
  const startCommands = Object.values(startRuntimeBlock?.commands || {});
  for (let i = 1; i < startCommands?.length || 0; i += 1) {
    const command = startCommands[i];
    if (command.line > activeLine) {
      break;
    } else {
      startCommandIndex = i;
    }
  }
  const game = new SparkGame(blockMap, objectMap, {
    startBlockId,
    startCommandIndex,
    seed,
    debugging,
    saveData,
  });
  return new SparkContext(game, SparkGameRunner.instance, editable);
};

interface GameContextProviderProps {
  children: React.ReactNode;
}

const GameContextProvider = React.memo((props: GameContextProviderProps) => {
  const { children } = props;

  const [state] = useContext(ProjectEngineContext);
  const project = state?.project?.data;
  const script = project?.scripts?.data?.logic;
  const files = project?.files?.data;
  const seed =
    project?.instances?.configs?.data?.DebugConfig?.randomizationSeed;
  const mode = state?.test?.mode;
  const debugging = state?.test?.debug;
  const activeLine = state?.panel?.panels?.logic?.cursor?.fromLine || 1;

  const debuggingRef = useRef(debugging);
  debuggingRef.current = debugging;

  const activeLineRef = useRef(activeLine);
  activeLineRef.current = activeLine;

  const isFirstEditLoadRef = useRef(true);
  const isFirstScriptLoadRef = useRef(true);

  const gameRef = useRef<SparkContext>();
  const [game, setGame] = useState<SparkContext>();

  useEffect(() => {
    if (!isFirstEditLoadRef.current) {
      if (mode === "Edit") {
        gameRef.current = createGame(
          script,
          files,
          seed,
          activeLineRef.current,
          debuggingRef.current,
          true
        );
        setGame(gameRef.current);
      }
    }
    isFirstEditLoadRef.current = false;
  }, [files, mode, script, seed]);

  useEffect(() => {
    if (mode === "Test") {
      gameRef.current = createGame(
        script,
        files,
        seed,
        activeLineRef.current,
        debuggingRef.current,
        false
      );
      setGame(gameRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (script && isFirstScriptLoadRef.current) {
      isFirstScriptLoadRef.current = false;
      const result = parseSpark(script, getScriptAugmentations(files), {
        lineOffset: 1,
      });
      const objectMap = generateStructObjects(result?.structs);
      loadStyles(objectMap, ...Object.keys(objectMap?.style || {}));
      loadUI(objectMap, ...Object.keys(objectMap?.ui || {}));
    }
  }, [script, files]);

  useEffect(() => {
    if (gameRef.current) {
      if (debugging) {
        gameRef.current.game.debug.startDebugging();
      } else {
        gameRef.current.game.debug.stopDebugging();
      }
    }
  }, [debugging]);

  return <GameContext.Provider value={game}>{children}</GameContext.Provider>;
});

export default GameContextProvider;
