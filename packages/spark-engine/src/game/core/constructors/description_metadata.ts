import { Create } from "../types/Create";
import { Metadata } from "../types/Metadata";
import { Description } from "../types/Description";

export const description_metadata: Create<Description<Metadata>> = () => ({
  $type: "metadata",
  $name: "$description",
  title: { "": "The title of the story." },
  credit: { "": `How the author is credited. (e.g. "Written by").` },
  author: { "": `The name of the author.` },
  source: {
    "": `Any additional sources for the story. (e.g. 'Based on the novel by x')`,
  },
  notes: { "": `Any additional notes you wish to include.` },
  date: { "": `The date this draft was written.` },
  contact: { "": `Contact details (e.g. your@email.com).` },
  revision: { "": `The name of the current and past revisions.` },
  font: { "": `The font used when printing the screenplay.` },
  header: {
    "": `
A header printed at the top of every page in the screenplay (excluding the title page).
\`\`\`
╚══════╝
╔══════╗
║▀▀▀▀▀▀║
║      ║
\`\`\`
`.trim(),
  },
  footer: {
    "": `
A footer printed at the bottom of every page in the screenplay (excluding the title page).
\`\`\`
║      ║
║▄▄▄▄▄▄║
╚══════╝
╔══════╗
\`\`\`
`.trim(),
  },
  watermark: {
    "": `
A watermark printed diagonally on every page of the screenplay.
\`\`\`
╔══════╗
║    ⋰ ║
║  ⋰   ║
║⋰     ║
╚══════╝
\`\`\`
`.trim(),
  },
  tl: {
    "": `
Additional content printed in the \`top left\` of the screenplay's title page.
\`\`\`
╔══════╗
║▀▀    ║
║      ║
║      ║
╚══════╝
\`\`\`
`.trim(),
  },
  tc: {
    "": `
Additional content printed in the \`top center\` of the screenplay's title page.
\`\`\`
╔══════╗
║  ▀▀  ║
║      ║
║      ║
╚══════╝
\`\`\`
`.trim(),
  },
  tr: {
    "": `
Additional content printed in the \`top right\` of the screenplay's title page.
\`\`\`
╔══════╗
║    ▀▀║
║      ║
║      ║
╚══════╝
\`\`\`
`.trim(),
  },
  cc: {
    "": `
Additional content printed in the \`center\` of the screenplay's title page.
\`\`\`
╔══════╗
║      ║
║ ████ ║
║      ║
╚══════╝
\`\`\`
`.trim(),
  },
  bl: {
    "": `
Additional content printed in the \`bottom left\` of the screenplay's title page.
\`\`\`
╔══════╗
║      ║
║      ║
║███   ║
╚══════╝
\`\`\`
`.trim(),
  },
  br: {
    "": `
Additional content printed in the \`bottom right\` of the screenplay's title page.
\`\`\`
╔══════╗
║      ║
║      ║
║   ███║
╚══════╝
\`\`\`
`.trim(),
  },
});
