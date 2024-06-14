import { Story } from "../../../../../sparkdown/src/inkjs/engine/Story";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { GameContext } from "../types/GameContext";
import { ICommandRunner } from "../types/ICommandRunner";
import { InstanceMap } from "../types/InstanceMap";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RecursivePartial } from "../types/RecursivePartial";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { evaluate } from "../utils/evaluate";
import { getAllProperties } from "../utils/getAllProperties";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Module } from "./Module";

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export type M = { [name: string]: Module };

export class Game<T extends M = {}> {
  protected _destroyed = false;

  protected _context: GameContext = {} as GameContext;
  get context() {
    return this._context;
  }

  protected _stored: string[] = [];
  public get stored() {
    return this._stored;
  }

  protected _commands: { [key: string]: ICommandRunner } = {};
  get commands() {
    return this._commands;
  }

  protected _latestCheckpointId = "";
  get latestCheckpointId() {
    return this._latestCheckpointId;
  }

  protected _latestCheckpointData = "";
  get latestCheckpointData() {
    return this._latestCheckpointData;
  }

  protected _modules: Record<string, Module> = {};
  get module() {
    return this._modules as GameModules & T;
  }

  protected _moduleNames: string[];

  protected _connection: Connection;
  get connection() {
    return this._connection;
  }

  protected _story: Story;
  public get story() {
    return this._story;
  }

  protected _displaying: {
    tags: string[];
    text: string;
    choices: { index: number; text: string; onChoose: () => void }[];
  } = {
    tags: [],
    text: "",
    choices: [],
  };
  public get displaying() {
    return this._displaying;
  }

  constructor(
    compiled: Record<string, any>,
    options?: {
      previewing?: boolean;
      modules?: {
        [name in keyof T]: abstract new (...args: any) => T[name];
      };
    }
  ) {
    console.log("compiled", compiled);
    const previewing = options?.previewing;
    const modules = options?.modules;
    // Create story to control flow and state
    this._story = new Story(compiled);
    // Create context
    this._context = {
      system: {
        previewing,
        initialized: false,
        transitions: true,
        checkpoint: () => this.checkpoint(),
        restore: () => this.restore(),
        uuid: () => uuid(),
        supports: (module: string) => this.supports(module),
      },
    };
    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });
    // Override default modules with custom ones if specified
    const allModules = {
      ...DEFAULT_MODULES,
      ...modules,
    };
    const moduleNames = Object.keys(allModules);
    // Instantiate all modules
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const ctr = allModules[name];
      if (ctr) {
        this._modules[name] = new ctr(this);
      }
    }
    // Register builtins and commands of all modules
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const module = this._modules[name];
      if (module) {
        const moduleBuiltins = module.getBuiltins();
        if (moduleBuiltins) {
          for (const [k, v] of Object.entries(moduleBuiltins)) {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              this._context[k] ??= {};
              for (const [name, value] of Object.entries(v)) {
                if (this._context[k][name] === undefined) {
                  this._context[k][name] = value;
                }
              }
            } else {
              if (this._context[k] === undefined) {
                this._context[k] = v;
              }
            }
          }
        }
        const moduleStored = module.getStored();
        if (moduleStored) {
          this._stored.push(...moduleStored);
        }
        const moduleCommands = module.getCommands();
        if (moduleCommands) {
          for (const [k, v] of Object.entries(moduleCommands)) {
            this._commands[k] = v;
          }
        }
      }
    }
    this._moduleNames = moduleNames;

    if (compiled["structDefs"]) {
      for (const [type, structs] of Object.entries(compiled["structDefs"])) {
        this._context[type] ??= {};
        for (const [name, struct] of Object.entries(structs as any)) {
          if (Array.isArray(struct)) {
            this._context[type][name] = struct;
          } else {
            const builtinDefaultValue = this._context[type]?.default;
            const definedDefaultValue = (structs as any)?.["default"];
            const builtinDefaultProps = getAllProperties(builtinDefaultValue);
            const definedDefaultProps = getAllProperties(definedDefaultValue);
            const constructed = {} as any;
            for (const [propPath, propValue] of Object.entries(
              builtinDefaultProps
            )) {
              setProperty(constructed, propPath, propValue);
            }
            for (const [propPath, propValue] of Object.entries(
              definedDefaultProps
            )) {
              setProperty(constructed, propPath, propValue);
            }
            for (const [propPath, propValue] of Object.entries(
              getAllProperties(struct)
            )) {
              setProperty(constructed, propPath, propValue);
            }
            constructed["$type"] = type;
            constructed["$name"] = name;
            this._context[type][name] = constructed;
          }
        }
      }
    }

    console.log("context", this._context);
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async init(config: {
    send: (message: Message, transfer?: ArrayBuffer[]) => void;
    resolve: (path: string) => string;
    fetch: (url: string) => Promise<string | ArrayBuffer>;
    log: (message: unknown, severity: "info" | "warning" | "error") => void;
  }): Promise<void> {
    this._connection.connectOutput(config.send);
    this._context.system.resolve = config.resolve;
    this._context.system.fetch = config.fetch;
    this._context.system.log = config.log;
    this._context.system.initialized = true;
    await Promise.all(this._moduleNames.map((k) => this._modules[k]?.onInit()));
  }

  start(save: string = ""): void {
    this._context.system.previewing = false;
    if (save) {
      this.loadSave(save);
    }
    this.continueStory(true);
    for (const k of this._moduleNames) {
      this._modules[k]?.onStart();
    }
  }

  update(deltaMS: number) {
    if (!this._destroyed) {
      for (const k of this._moduleNames) {
        this._modules[k]?.onUpdate(deltaMS);
      }
    }
  }

  async restore(): Promise<void> {
    await Promise.all(
      this._moduleNames.map((k) => this._modules[k]?.onRestore())
    );
  }

  destroy(): void {
    this._destroyed = true;
    for (const k of this._moduleNames) {
      this._modules[k]?.onDestroy();
    }
    this._moduleNames = [];
    this._connection.incoming.removeAllListeners();
    this._connection.outgoing.removeAllListeners();
  }

  protected cache(cache: object, accessPath: string) {
    const value = evaluate(accessPath, this._context);
    if (value !== undefined && typeof value != "function") {
      setProperty(cache, accessPath, value);
    }
  }

  serialize(): string {
    const saveData: Record<string, any> & { context: any } = {
      context: {},
    };
    for (const accessPath of this._stored) {
      this.cache(saveData.context, accessPath);
    }
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.onSerialize();
        saveData[k] = module.state;
      }
    }
    const serialized = JSON.stringify(saveData);
    return serialized;
  }

  checkpoint(): void {
    const checkpointId = ""; // TODO: update with tag (# id:<uuid>)
    for (const k of this._moduleNames) {
      this._modules[k]?.onCheckpoint(checkpointId);
    }
    this._latestCheckpointId = checkpointId;
    this._latestCheckpointData = this._story.state.ToJson();
    // TODO: this._latestCheckpointData = this.serialize();
  }

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  > {
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        if ("id" in msg) {
          return module.onReceiveRequest(msg);
        }
        module.onReceiveNotification(msg);
      }
    }
    return undefined;
  }

  startStory() {
    // Save initial state
    this.checkpoint();
    // Continue story for the first time
    this.continueStory(true);
  }

  continueStory(_firstTime: boolean = false) {
    // Continue until we reach a point where the user must make a choice
    while (this._story.canContinue) {
      this._story.Continue();
      const text = this._story.currentText;
      const tags = this._story.currentTags;
      if (tags) {
        this.displaying.tags.push(...tags);
      }
      if (text) {
        if (this.isVisible(tags)) {
          this.displaying.text += text;
        }
      }
      for (const choice of this._story.currentChoices) {
        this.displaying.choices.push({
          index: choice.index,
          text: choice.text,
          onChoose: () => {
            this.choose(choice.index);
          },
        });
      }
      if (this._story.currentChoices.length > 0 || this.shouldFlush(text)) {
        this.checkpoint();
        this.flush();
      }
    }
  }

  reset() {
    // Reset story to its initial state
    this._story.ResetState();
    // Notify modules about reset
    for (const k of this._moduleNames) {
      this._modules[k]?.onReset();
    }
  }

  restart() {
    // Reset state
    this.reset();
    // Start story
    this.startStory();
    // Notify modules about restart
    for (const k of this._moduleNames) {
      this._modules[k]?.onRestart();
    }
  }

  loadSave(saveData: string) {
    try {
      if (saveData) {
        this._story.state.LoadJson(saveData);
        return true;
      }
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  /**
   * Parses property specified with tag
   * # property: value
   * e.g. title: My Game
   */
  parseTag(tag: string) {
    const [key, value] = tag.split(":");
    return [key?.trim(), value?.trim()];
  }

  isVisible(tags: string[] | null) {
    if (tags) {
      for (const tag of tags) {
        if (tag) {
          const [key] = this.parseTag(tag);
          if (key === "@") {
            return false;
          }
        }
      }
    }
    return true;
  }

  shouldFlush(text: string | null) {
    // this needs to be handled by writer parser,
    // so that it can also detect implicit chain indicators after
    // @ CHARACTER_NAME (parenthetical) ^
    // (parentheticals)
    // [[standalone_visual_tag]]
    // ((standalone_audio_tag))
    return (
      this.endsTextBlock(text) ||
      (!this.startsTextBlock(text) && !this.endsWithChain(text))
    );
  }

  startsTextBlock(text: string | null) {
    return text?.startsWith("@");
  }

  endsTextBlock(text: string | null) {
    return text?.startsWith("/@");
  }

  endsWithChain(text: string | null) {
    if (text) {
      if (text.trim().endsWith(">")) {
        // We need to make sure that the `>` at the end of the line is truly alone
        // and is not, in fact, the close of a `<text_tag>`
        for (let i = text.length - 1; i >= 0; i--) {
          const c = text[i];
          if (c) {
            if (c === "<") {
              // `>` is closing an open `<`
              return false;
            }
            if (c === ">") {
              // there cannot be an open `<` before this
              return true;
            }
          }
        }
        return true;
      }
    }
    return false;
  }

  flush() {
    const tags = this._displaying.tags;
    const text = this._displaying.text.trim();
    const choices = this._displaying.choices;

    // Build parameters
    const params: Record<string, string> = {};
    for (const tag of tags) {
      if (tag) {
        const [key, value] = this.parseTag(tag);
        if (key) {
          params[key] = value || "";
        }
      }
    }

    // If text exists, display text box
    const lines: string[] = [];
    if (text) {
      lines.push(JSON.stringify(text));
    }

    // If tags exist, display tags
    if (tags.length > 0) {
      lines.push("#" + JSON.stringify(params, null, 2));
    }

    // If choices exist, display choice menu
    for (const choice of choices) {
      lines.push(`${choice.index}: ${JSON.stringify(choice.text)}`);
    }

    console.log(lines.join("\n"));

    // const type = data.params.type;
    // const characterKey = data?.params?.characterKey || "";
    // const content = data?.params?.content;
    // const autoAdvance = data?.params?.autoAdvance;

    // const context = game.context;

    // let targetsCharacterName = false;
    // const displayed: Phrase[] = [];
    // content.forEach((c) => {
    //   // Override first instance of character_name with character's display name
    //   if (!targetsCharacterName && c.target === "character_name") {
    //     targetsCharacterName = true;
    //     c.text = context?.["character"]?.[characterKey]?.name || c.text;
    //   }
    //   const r: Phrase = {
    //     ...c,
    //   };
    //   if (!r.target) {
    //     r.target = type;
    //   }
    //   displayed.push(r);
    // });

    // if (displayed.length === 0) {
    //   // No events to process
    //   return {};
    // }

    // const instant = options?.instant;
    // const previewing = options?.preview;
    // const debugging = context.system.debugging;

    // if (!instant) {
    //   // Stop stale sound and voice audio on new dialogue line
    //   game.module.audio.stopChannel("sound");
    //   game.module.audio.stopChannel("voice");
    // }
    // // Stop writer audio on instant reveal and new dialogue line
    // game.module.audio.stopChannel("writer");

    // const clearUI = () => {
    //   // Clear stale text
    //   game.module.ui.text.clearStaleContent();
    //   // Clear stale images
    //   game.module.ui.image.clearStaleContent();
    // };

    // // Sequence events
    // const sequence = game.module.writer.write(displayed, {
    //   character: characterKey,
    //   instant,
    //   debug: debugging,
    // });

    // const updateUI = () => {
    //   // Clear stale content
    //   clearUI();

    //   // Display click indicator
    //   const indicatorStyle: Record<string, string | null> = {};
    //   if (autoAdvance) {
    //     indicatorStyle["display"] = "none";
    //   } else {
    //     indicatorStyle["transition"] = "none";
    //     indicatorStyle["opacity"] = instant ? "1" : "0";
    //     indicatorStyle["animation-play-state"] = "paused";
    //     indicatorStyle["display"] = null;
    //   }
    //   game.module.ui.style.update("indicator", indicatorStyle);

    //   // Process button events
    //   Object.entries(sequence.button).flatMap(([target, events], index) =>
    //     events.forEach(() => {
    //       const handleClick = (): void => {
    //         clearUI();
    //         game.module.ui.unobserve("click", target);
    //         this.game.choose(index);
    //       };
    //       game.module.ui.observe("click", target, handleClick);
    //     })
    //   );

    //   // Process text events
    //   Object.entries(sequence.text).map(([target, events]) =>
    //     game.module.ui.text.write(target, events, instant)
    //   );

    //   // Process images events
    //   Object.entries(sequence.image).map(([target, events]) =>
    //     game.module.ui.image.write(target, events, instant)
    //   );
    // };

    // // Process audio
    // const audioTriggerIds = instant
    //   ? []
    //   : Object.entries(sequence.audio).map(([channel, events]) =>
    //       game.module.audio.queue(channel, events, instant)
    //     );

    // const handleFinished = (): void => {
    //   const indicatorStyle: Record<string, string | null> = {};
    //   indicatorStyle["transition"] = null;
    //   indicatorStyle["opacity"] = "1";
    //   indicatorStyle["animation-play-state"] = previewing
    //     ? "paused"
    //     : "running";
    //   game.module.ui.style.update("indicator", indicatorStyle);
    //   onFinished?.();
    // };

    // game.module.ui.showUI("stage");

    // if (instant || game.context.system.simulating) {
    //   updateUI();
    //   handleFinished();
    //   return { displayed };
    // }

    // let elapsedMS = 0;
    // let ready = false;
    // let finished = false;
    // const totalDurationMS = (sequence.end ?? 0) * 1000;
    // const handleTick = (deltaMS: number): void => {
    //   if (!ready) {
    //     if (audioTriggerIds.every((n) => game.module.audio.isReady(n))) {
    //       ready = true;
    //       game.module.audio.triggerAll(audioTriggerIds);
    //       updateUI();
    //       onStarted?.();
    //     }
    //   }
    //   if (ready && !finished) {
    //     elapsedMS += deltaMS;
    //     if (elapsedMS >= totalDurationMS) {
    //       finished = true;
    //       handleFinished();
    //     }
    //   }
    // };

    this.displaying.text = "";
    this.displaying.choices = [];
    this.displaying.tags = [];
  }

  choose(index: number) {
    // Clear all displaying text and choices
    this.clear();
    // Tell the story where to go next
    this._story.ChooseChoiceIndex(index);
    // Save after every choice
    this.checkpoint();
    // And then continue on
    this.continueStory();
  }

  clear() {
    this.displaying.text = "";
    this.displaying.choices = [];
    this.displaying.tags = [];
    // TODO: Clear textbox and choices
  }

  log(message: unknown, severity: "info" | "warning" | "error" = "info") {
    this._context.system.log?.(message, severity);
  }

  startDebugging() {
    this._context.system.debugging = true;
  }

  stopDebugging() {
    this._context.system.debugging = true;
  }

  preview(checkpointId: string): void {
    this._context.system.previewing = true;
    for (const k of this._moduleNames) {
      this._modules[k]?.onPreview(checkpointId);
    }
    // TODO:
    console.log("preview: ", checkpointId);
    // this._story.ChoosePathString(closestKnotOrStitch);
    // this.continueStory()
  }
}
