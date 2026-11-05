import { useEffect, useState } from "preact/hooks";

export type TextPreviewProps = {
  src: string;
};

export default function TextPreview({ src }: TextPreviewProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(false);
    fetch(src)
      .then((r) => r.text())
      .then((t) => {
        if (!cancelled) {
          setText(t);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return <div class="m-auto text-sm text-muted">Can't preview this file.</div>;
  }
  if (text == null) {
    return <div class="m-auto text-sm text-muted">Loading…</div>;
  }
  return (
    <pre class="size-full select-text overflow-auto whitespace-pre-wrap break-words rounded-control bg-paper p-4 font-mono text-sm text-ink">
      {text}
    </pre>
  );
}
