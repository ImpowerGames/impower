import { Clock, RequestMessage } from "@impower/spark-engine/src/game/core";
import { ExitWorldMessage } from "@impower/spark-engine/src/game/modules/world/classes/messages/ExitWorldMessage";
import { LoadWorldMessage } from "@impower/spark-engine/src/game/modules/world/classes/messages/LoadWorldMessage";
import { Manager } from "../Manager";
import { World } from "../World";

export default class WorldManager extends Manager {
  _worlds = new Map<string, World>();
  get worlds() {
    return this._worlds;
  }

  async loadWorld(src: string) {
    // TODO: show loading screen
    const response = await fetch(src);
    const code = await response.text();
    const globalPrefixedCode = code.replace(
      /export\s+default\s+class\s+extends\s+World/,
      "export default class extends globalThis.World"
    );
    // Make base World class globally accessible
    (globalThis as any).World = World;
    const blob = new Blob([globalPrefixedCode], { type: "text/javascript" });
    const moduleUrl = URL.createObjectURL(blob);
    const module = await import(moduleUrl);
    const CustomWorldClass = module.default;
    const world: World = new CustomWorldClass(this._app, () =>
      this.exitWorld(src)
    );
    await world.onLoad();
    this.stage.addChild(world.root);
    this._worlds.set(src, world);
    // TODO: hide loading screen
  }

  async exitWorld(src: string) {
    // TODO: show loading screen
    const world = this._worlds.get(src);
    if (world) {
      this.stage.removeChild(world.root);
      this._worlds.delete(src);
    }
    this.emit(ExitWorldMessage.type.notification({ src }));
  }

  override onStart(): void {
    for (const world of this._worlds.values()) {
      world.onStart();
    }
  }

  override onPause(): void {
    for (const world of this._worlds.values()) {
      world.onPause();
    }
  }

  override onUnpause(): void {
    for (const world of this._worlds.values()) {
      world.onUnpause();
    }
  }

  override onSkip(seconds: number): void {
    for (const world of this._worlds.values()) {
      world.onSkip(seconds);
    }
  }

  override onUpdate(time: Clock): void {
    for (const world of this._worlds.values()) {
      world.onUpdate(time);
    }
  }

  override onDispose(): void {
    this._worlds.clear();
  }

  async onLoadWorld(params: { src: string }): Promise<void> {
    await this.loadWorld(params.src);
  }

  override async onReceiveRequest(msg: RequestMessage) {
    if (LoadWorldMessage.type.isRequest(msg)) {
      await this.onLoadWorld(msg.params);
      return LoadWorldMessage.type.result(msg.params);
    }
    return undefined;
  }
}
