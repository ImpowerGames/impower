import { Button } from "@impower/impower-ui/components";
import type { Synth } from "@impower/spark-engine/src/game/modules/audio/types/Synth";
import { useEffect, useRef, useState } from "preact/hooks";
import {
  rollTypewriter,
  SAMPLE_LINE,
  typewriterDefinition,
  typewriterSample,
} from "./typewriterSample";

export default function TypewriterSound({ filename }: { filename: string }) {
  const [patch, setPatch] = useState(() => rollTypewriter(() => 0.5));
  const [defaults, setDefaults] = useState<Synth | null>(null);
  const [status, setStatus] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const playing = useRef<AudioBufferSourceNode | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const definition = typewriterDefinition(patch);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { Workspace } = await import("../../workspace/Workspace");
      const uri = Workspace.fs.getFileUri(
        Workspace.window.store.project.id ?? "",
        filename,
      );
      const base = await Workspace.ls.connection.sendRequest<Synth | null>(
        "sparkdown/synthDefaults",
        { uri },
      );
      if (mounted) {
        setDefaults(base);
        if (!base) setStatus("Open a Sparkdown project to hear the sample.");
      }
    }
    void load().catch(() => {
      if (mounted) setStatus("The sound preview couldn't load.");
    });
    return () => {
      mounted = false;
      playing.current?.stop();
      playing.current = null;
      if (audio.current) void audio.current.close();
    };
  }, [filename]);

  const play = (voice = patch) => {
    if (!defaults) return;
    setStatus("");
    try {
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      const samples = typewriterSample(voice, defaults, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(
        1,
        samples.length,
        context.sampleRate,
      );
      source.buffer.copyToChannel(samples, 0);
      source.connect(context.destination);
      source.onended = () => {
        source.disconnect();
        if (playing.current === source) playing.current = null;
      };
      playing.current?.stop();
      source.start();
      playing.current = source;
      void context.resume().catch(() => {
        if (playing.current === source) {
          source.stop();
          setStatus("The sound preview couldn't play.");
        }
      });
    } catch {
      setStatus("The sound preview couldn't play.");
    }
  };

  const reroll = () => {
    const next = rollTypewriter();
    setPatch(next);
    play(next);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(definition);
      setStatus("Definition copied.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setStatus("Definition selected. Use your device’s Copy command.");
    }
  };

  return (
    <div class="grid gap-3 p-4 text-sm">
      <p class="m-0">
        Hear one key, then “{SAMPLE_LINE}” at the default dialogue speed.
      </p>
      <div class="flex flex-wrap gap-2">
        <Button disabled={!defaults} onClick={() => play()}>
          Play sample
        </Button>
        <Button onClick={reroll}>Reroll</Button>
      </div>
      <label class="grid gap-1 font-semibold">
        Sparkdown definition
        <textarea
          ref={field}
          readOnly
          value={definition}
          rows={6}
          spellcheck={false}
          class="w-full resize-y rounded border border-edge bg-transparent p-2 font-mono text-xs font-normal"
        />
      </label>
      <Button onClick={copy}>Copy definition</Button>
      <p class="m-0 text-muted">
        Paste above your scenes. Use your character’s name in place of{" "}
        <code>story_key</code> to give them this voice.
      </p>
      <p role="status" class="m-0 empty:hidden">
        {status}
      </p>
    </div>
  );
}
