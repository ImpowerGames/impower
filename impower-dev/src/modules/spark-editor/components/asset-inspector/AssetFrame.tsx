import { Thumbnail, ZoomFrame } from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";
import type { InspectedAsset } from "../../utils/assetDetails";

const SPECIMEN = "The quick brown fox jumps over the lazy dog";

let fonts = 0;
const loadedFaces = new Map<string, Promise<string>>();

const loadFace = (src: string): Promise<string> => {
  let loading = loadedFaces.get(src);
  if (!loading) {
    const family = `inspected-font-${(fonts += 1)}`;
    loading = new FontFace(family, `url("${src}")`).load().then((face) => {
      document.fonts.add(face);
      return family;
    });
    loadedFaces.set(src, loading);
  }
  return loading;
};

function useFontFamily(src: string | undefined) {
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    setFamily(null);
    if (!src || typeof FontFace === "undefined" || typeof document === "undefined") {
      return;
    }
    let alive = true;
    loadFace(src).then(
      (loaded) => alive && setFamily(loaded),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [src]);
  return family;
}

function FontSpecimen({ asset }: { asset: InspectedAsset }) {
  const family = useFontFamily(asset.src);
  return (
    <ZoomFrame label={`${asset.name} specimen`} surface="sheet">
      <div
        class="absolute inset-0 flex flex-col gap-2 overflow-hidden p-4 text-ink opacity-0 data-[ready]:opacity-100 motion-safe:transition-opacity motion-safe:duration-200"
        data-ready={family ? "" : undefined}
        data-font-specimen
      >
        <p class="m-0 text-[12px]/[1.4] text-muted">{asset.name}</p>
        <div class="flex min-h-0 flex-col gap-2 font-(family-name:--specimen-font)" style={{ "--specimen-font": family ? `"${family}"` : "inherit" }}>
          <p class="m-0 text-[28px]/[1.2]">{SPECIMEN}</p>
          <p class="m-0 text-[18px]/[1.3]">{SPECIMEN}</p>
          <p class="m-0 text-[13px]/[1.4]">{SPECIMEN}</p>
        </div>
      </div>
    </ZoomFrame>
  );
}

function TextContents({ asset, read }: { asset: InspectedAsset; read: (path: string) => Promise<string> }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    read(asset.path).then(
      (body) => alive && setText(body),
      () => alive && setText("This file could not be read."),
    );
    return () => {
      alive = false;
    };
  }, [asset.path, asset.src]);
  return (
    <ZoomFrame label={`${asset.name} contents`} surface="sheet">
      <pre
        tabIndex={0}
        aria-label={`Contents of ${asset.name}`}
        class="absolute inset-0 m-0 overflow-auto p-3.5 font-mono text-[13px]/[1.5] whitespace-pre-wrap text-ink select-text [overflow-wrap:anywhere]"
        data-text-contents
      >
        {text ?? ""}
      </pre>
    </ZoomFrame>
  );
}

function VideoFrame({ asset, onSeconds }: { asset: InspectedAsset; onSeconds: (seconds: number) => void }) {
  const [ratio, setRatio] = useState<number | undefined>(undefined);
  return (
    <ZoomFrame label={asset.name} ratio={ratio}>
      <video
        src={asset.src}
        controls
        playsInline
        preload="metadata"
        class="absolute inset-0 size-full object-contain"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget as HTMLVideoElement;
          if (video.videoWidth && video.videoHeight) {
            setRatio(video.videoWidth / video.videoHeight);
          }
          onSeconds(video.duration);
        }}
      />
    </ZoomFrame>
  );
}

export type AssetFrameProps = {
  asset: InspectedAsset;
  pixels?: { width: number; height: number } | null;
  read: (path: string) => Promise<string>;
  onSeconds: (seconds: number) => void;
};

export default function AssetFrame({ asset, pixels, read, onSeconds }: AssetFrameProps) {
  if (asset.type === "image") {
    return (
      <ZoomFrame
        label={asset.name}
        zoomable
        backdrop="checker"
        ratio={pixels ? pixels.width / pixels.height : undefined}
      >
        <Thumbnail size="fill" fit="contain" src={asset.src} class="bg-transparent" />
      </ZoomFrame>
    );
  }
  if (asset.type === "video") {
    return <VideoFrame asset={asset} onSeconds={onSeconds} />;
  }
  if (asset.type === "font") {
    return <FontSpecimen asset={asset} />;
  }
  if (asset.type === "text" && !asset.link) {
    return <TextContents asset={asset} read={read} />;
  }
  return null;
}
