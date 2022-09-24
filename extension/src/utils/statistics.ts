import { SparkScreenplayConfig } from "../../../screenplay";
import {
  calculateSpeechDuration,
  isMonologue,
  SparkParseResult,
  sparkRegexes,
  StructureItem,
} from "../../../sparkdown";
import { createPdf } from "../pdf/pdf";
import { PdfStats } from "../pdf/pdfmaker";
import { ExportConfig } from "../types/ExportConfig";
import { getCharacterName } from "./getCharacterName";
import { rgbToHex } from "./rgbToHex";
import { wordToColor } from "./wordToColor";

interface DialoguePiece {
  character: string;
  speech: string;
}

interface DialogueStatisticPerCharacter {
  name: string;
  speakingParts: number;
  wordsSpoken: number;
  secondsSpoken: number;
  monologues: number;
  color: string;
}

interface SingleSceneStatistic {
  title: string;
}

interface LengthStatistics {
  characters: number;
  characterswithoutwhitespace: number;
  lines: number;
  lineswithoutwhitespace: number;
  words: number;
  pages: number;
  pagesreal: number;
  scenes: number;
}

interface LengthChartItem {
  line: number;
  scene: string;
  length: number;
}

interface DialogueChartItem {
  line: number;
  scene: string;
  lengthTimeGlobal: number;
  lengthWordsGlobal: number;
  monologue: boolean;
  lengthTime: number;
  lengthWords: number;
}

interface SceneItem {
  line: number;
  endline: number;
  scene: string;
  type: "int" | "ext" | "mixed" | "other";
  time: string;
}

interface DurationByProp {
  prop: string;
  duration: number;
}

interface DurationStatistics {
  dialogue: number;
  action: number;
  total: number;
  lengthchart_action: LengthChartItem[];
  lengthchart_dialogue: LengthChartItem[];
  durationBySceneProp: DurationByProp[];
  characters: DialogueChartItem[][];
  scenes: SceneItem[];
  characternames: string[];
  monologues: number;
}

interface CharacterStatistics {
  characters: DialogueStatisticPerCharacter[];
  characterCount: number;
  monologues: number;
}

interface SceneStatistics {
  scenes: SingleSceneStatistic[];
}

interface ScreenPlayStatistics {
  characterStats: CharacterStatistics;
  sceneStats: SceneStatistics;
  lengthStats: LengthStatistics;
  durationStats: DurationStatistics;
  pdfmap: string;
  structure: StructureItem[];
}

const getWordCount = (script: string): number => {
  return ((script || "").match(/\S+/g) || []).length;
};

const getCharacterCount = (script: string): number => {
  return script.length;
};

const getCharacterCountWithoutWhitespace = (script: string): number => {
  return ((script || "").match(/\S+?/g) || []).length;
};

const getLineCount = (script: string): number => {
  return ((script || "").match(/\n/g) || []).length;
};

const getLineCountWithoutWhitespace = (script: string): number => {
  return ((script || "").match(/^.*\S.*$/gm) || []).length;
};

const createCharacterStatistics = (
  parsed: SparkParseResult
): CharacterStatistics => {
  const dialoguePieces: DialoguePiece[] = [];
  for (let i = 0; i < parsed.tokens.length; i++) {
    while (i < parsed.tokens.length && parsed.tokens[i].type === "character") {
      const character = getCharacterName(parsed.tokens[i]?.content);
      let speech = "";
      while (i++ && i < parsed.tokens.length) {
        if (parsed.tokens[i].type === "dialogue") {
          speech += parsed.tokens[i].content + " ";
        } else if (parsed.tokens[i].type === "character") {
          break;
        }
        // else skip extensions / parenthesis / dialogue-begin/-end
      }

      speech = speech.trim();
      dialoguePieces.push({
        character,
        speech,
      });
    }
  }

  const dialoguePerCharacter: Record<string, string[]> = {};

  dialoguePieces.forEach((dialoguePiece) => {
    if (dialoguePerCharacter[dialoguePiece.character]) {
      dialoguePerCharacter[dialoguePiece.character].push(dialoguePiece.speech);
    } else {
      dialoguePerCharacter[dialoguePiece.character] = [dialoguePiece.speech];
    }
  });

  const characterStats: DialogueStatisticPerCharacter[] = [];
  let monologueCounter = 0;

  Object.keys(dialoguePerCharacter).forEach((singleDialPerChar: string) => {
    const speakingParts = dialoguePerCharacter[singleDialPerChar].length;
    let secondsSpoken = 0;
    let monologues = 0;
    const allDialogueCombined = dialoguePerCharacter[singleDialPerChar].reduce(
      (prev, curr) => {
        const time = calculateSpeechDuration(curr);
        secondsSpoken += time;
        if (isMonologue(time)) {
          monologues++;
        }
        return `${prev} ${curr} `;
      },
      ""
    );
    monologueCounter += monologues;
    const wordsSpoken = getWordCount(allDialogueCombined);
    characterStats.push({
      name: singleDialPerChar,
      color: rgbToHex(wordToColor(singleDialPerChar, 0.6, 0.5)),
      speakingParts,
      secondsSpoken,
      monologues,
      wordsSpoken,
    });
  });

  characterStats.sort((a, b) => {
    // by parts
    if (b.speakingParts > a.speakingParts) {
      return +1;
    }
    if (b.speakingParts < a.speakingParts) {
      return -1;
    }
    // then by words
    if (b.wordsSpoken > a.wordsSpoken) {
      return +1;
    }
    if (b.wordsSpoken < a.wordsSpoken) {
      return -1;
    }
    return 0;
  });

  return {
    characters: characterStats,
    characterCount: characterStats.length,
    monologues: monologueCounter,
  };
};

const createSceneStatistics = (parsed: SparkParseResult): SceneStatistics => {
  const sceneStats: SingleSceneStatistic[] = [];
  parsed.tokens.forEach((tok) => {
    if (tok.type === "scene") {
      sceneStats.push({
        title: tok.content,
      });
    }
  });
  return {
    scenes: sceneStats,
  };
};

const getLocationType = (
  val: RegExpExecArray | null
): "int" | "ext" | "mixed" | "other" => {
  if (val && val[1]) {
    if (/i(nt)?\.?\/e(xt)?\.?/i.test(val[1])) {
      return "mixed";
    } else if (/i(nt)?\.?/i.test(val[1])) {
      return "int";
    } else if (/e(xt)?\.?/i.test(val[1])) {
      return "ext";
    }
  }
  return "other";
};

const getLocationTime = (val: RegExpExecArray | null): string => {
  if (val && val[2]) {
    let dash = val[2].lastIndexOf(" - ");
    if (dash === -1) {
      dash = val[2].lastIndexOf(" – ");
    }
    if (dash === -1) {
      dash = val[2].lastIndexOf(" — ");
    }
    if (dash === -1) {
      dash = val[2].lastIndexOf(" − ");
    }
    if (dash !== -1) {
      return val[2].substring(dash + 3).toLowerCase();
    }
  }
  return "unspecified";
};

const getLengthChart = (
  parsed: SparkParseResult
): {
  action: LengthChartItem[];
  dialogue: LengthChartItem[];
  durationByProp: DurationByProp[];
  characterDurations: DialogueChartItem[][];
  scenes: SceneItem[];
  characterNames: string[];
  monologues: number;
} => {
  const action: LengthChartItem[] = [{ line: 0, length: 0, scene: "" }];
  const dialogue: LengthChartItem[] = [{ line: 0, length: 0, scene: "" }];
  const characters: Record<string, DialogueChartItem[]> = {};
  const scenes: SceneItem[] = [];
  let previousLengthAction = 0;
  let previousLengthDialogue = 0;
  let currentScene = "";
  let monologues = 0;
  const scenePropDurations: Record<string, number> = {};
  parsed.tokens.forEach((element) => {
    if (element.type === "action" || element.type === "dialogue") {
      const time = Number(element.duration);
      if (!isNaN(time)) {
        if (element.type === "action") {
          previousLengthAction += Number(element.duration);
        } else if (element.type === "dialogue") {
          previousLengthDialogue += Number(element.duration);
        }
      }

      if (element.type === "action") {
        action.push({
          line: element.line,
          length: previousLengthAction,
          scene: currentScene,
        });
      } else if (element.type === "dialogue") {
        dialogue.push({
          line: element.line,
          length: previousLengthDialogue,
          scene: currentScene,
        });
        const currentCharacter = characters[element.character];
        let dialogueLength = 0;
        let wordsLength = 0;
        const wordCount = getWordCount(element.content);
        const time = Number(element.duration);
        if (!currentCharacter) {
          characters[element.character] = [];
        } else if (currentCharacter.length > 0) {
          dialogueLength =
            currentCharacter[currentCharacter.length - 1].lengthTimeGlobal;
          wordsLength =
            currentCharacter[currentCharacter.length - 1].lengthWordsGlobal;
        }
        let monologue = false;
        if (isMonologue(time)) {
          monologue = true;
          monologues++;
        }
        characters[element.character].push({
          line: element.line,
          lengthTime: element.duration || 0,
          lengthWords: wordCount,
          lengthTimeGlobal: dialogueLength + time,
          lengthWordsGlobal: wordsLength + wordCount,
          monologue: monologue, //monologue if dialogue is longer than 30 seconds
          scene: currentScene,
        });
      }
    }
  });
  const sceneProperties = parsed.properties?.scenes || [];
  sceneProperties.forEach((scene) => {
    currentScene = scene.name;
    if (scenes.length > 0) {
      scenes[scenes.length - 1].endline = scene.line - 1;
    }
    const deconstructedSlug = sparkRegexes.scene.exec(scene.name);
    const sceneType = getLocationType(deconstructedSlug);
    const sceneTime = getLocationTime(deconstructedSlug);
    scenes.push({
      type: sceneType,
      line: scene.line,
      endline: 65500,
      time: sceneTime,
      scene: scene.name,
    });
    let currentLength = scenePropDurations["type_" + sceneType] || 0;
    scenePropDurations["type_" + sceneType] =
      currentLength +
      (scene.actionDuration || 0) +
      (scene.dialogueDuration || 0);
    currentLength = scenePropDurations["type_" + sceneType] || 0;
    scenePropDurations["time_" + sceneTime] =
      currentLength +
      (scene.actionDuration || 0) +
      (scene.dialogueDuration || 0);
  });
  const characterDuration: DialogueChartItem[][] = [];
  const characterNames: string[] = [];
  Object.entries(characters).map(([key, value]) => {
    characterNames.push(key);
    characterDuration.push(value);
  });
  const durationByProp = Object.entries(scenePropDurations).map(
    ([prop, duration]) => ({ prop, duration })
  );

  return {
    action,
    dialogue,
    durationByProp,
    scenes,
    characterDurations: characterDuration,
    characterNames,
    monologues: monologues,
  };
};

const createLengthStatistics = (
  script: string,
  pdf: PdfStats,
  parsed: SparkParseResult
): LengthStatistics => {
  return {
    characters: getCharacterCount(script),
    characterswithoutwhitespace: getCharacterCountWithoutWhitespace(script),
    lines: getLineCount(script),
    lineswithoutwhitespace: getLineCountWithoutWhitespace(script),
    words: getWordCount(script),
    pagesreal: pdf.pageCountReal,
    pages: pdf.pageCount,
    scenes: (parsed.properties?.scenes || []).length,
  };
};

const createDurationStatistics = (
  parsed: SparkParseResult
): DurationStatistics => {
  const lengthCharts = getLengthChart(parsed);
  console.log("Created duration stats");
  return {
    dialogue: parsed.properties?.dialogueDuration || 0,
    action: parsed.properties?.actionDuration || 0,
    total:
      (parsed.properties?.dialogueDuration || 0) +
      (parsed.properties?.actionDuration || 0),
    durationBySceneProp: lengthCharts.durationByProp,
    lengthchart_action: lengthCharts.action,
    lengthchart_dialogue: lengthCharts.dialogue,
    characters: lengthCharts.characterDurations,
    scenes: lengthCharts.scenes,
    characternames: lengthCharts.characterNames,
    monologues: lengthCharts.monologues,
  };
};

export const retrieveScreenPlayStatistics = async (
  script: string,
  parsed: SparkParseResult,
  screenplayConfig: SparkScreenplayConfig,
  exportConfig?: ExportConfig
): Promise<ScreenPlayStatistics> => {
  const pdfStats = (await createPdf(
    "$STATS$",
    screenplayConfig,
    exportConfig,
    parsed,
    undefined
  )) as PdfStats;
  return {
    characterStats: createCharacterStatistics(parsed),
    sceneStats: createSceneStatistics(parsed),
    lengthStats: createLengthStatistics(script, pdfStats, parsed),
    durationStats: createDurationStatistics(parsed),
    pdfmap: JSON.stringify(pdfStats?.lineMap),
    structure: parsed.properties?.structure || [],
  };
};
