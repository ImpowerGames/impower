import guide from "../../../../../docs/sparkdown-guide.md?html";

export default function SparkdownGuide({ html = guide }: { html?: string }) {
  return (
    <div
      tabIndex={0}
      data-sparkdown-guide
      class="grid gap-3.5 p-4 text-[13px]/[1.5] outline-none [&_a]:text-accent [&_a]:underline [&_code]:block [&_code]:font-mono [&_code]:text-[16px]/[1.5] [&_code]:text-accent [&_code]:[overflow-wrap:anywhere] [&_p]:m-0"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
