import { highlightTree } from "@lezer/highlight";
import sparkdownLanguageSupport from "../../cm-lang-sparkdown/sparkdownLanguageSupport";
import SPARKDOWN_HIGHLIGHTS from "../../constants/SPARKDOWN_HIGHLIGHTS";

const language = sparkdownLanguageSupport().language;

const getSyntaxHighlightedHtml = (str: string) => {
  const tree = language.parser.parse(str);
  let html = "";
  let prev = 0;
  highlightTree(tree, SPARKDOWN_HIGHLIGHTS, (from, to, token) => {
    const s = str.slice(from, to);
    const diff = from - prev;
    if (diff > 0) {
      html += `<span>${str.slice(from - diff, from)}</span>`;
    }
    html += `<span class=${token}>${s}</span>`;
    prev = to;
  });
  return html;
};

const REGEX = {
  clean_lines: /^\s*/gm,
  header: /(#+)(.*)/gim,
  image: /!\[([^[]+)\]\(([^)]+)\)/gim,
  link: /\[([^[]+)\]\(([^)]+)\)/gim,
  bold: /(\*\*|__)(.*?)\1/gim,
  italic: /(\*|_)(.*?)\1/gim,
  quote: /:"(.*?)":/gim,
  fenced_code_backtick: /([`]{3})([\S]*)([\s]?)([\s\S]+)([`]{3})/gim,
  fenced_code_tilde: /([~]{3})([\S]*)([\s]?)([\s\S]+)([~]{3})/gim,
  inline_code: /`([^`]+)`/gim,
  list_unordered: /\*+(.*)?/gim,
  list_ordered: /[0-9]+\.(.*)/gim,
  strikethrough: /~~(.*?)~~/gim,
  horizontal_rule: /\n-{5,}/gim,
  blockquote: /\n(&gt;|>)(.*)/gim,
  paragraph: /\n([^\n]+)\n/gim,
  paragraph_ignore: /^<\/?(ul|ol|li|h|p|bl|code|table|tr|td)/i,
  fix_list_unordered: /<\/ul>\s?<ul>/gim,
  fix_list_ordered: /<\/ol>\s<ol>/gim,
  fix_blockquote: /<\/blockquote>\s?<blockquote>/gim,
} as const;

const rules: {
  regex: RegExp;
  replacer: (substring: string, ...args: any[]) => string;
}[] = [
  {
    regex: REGEX.clean_lines,
    replacer: () => {
      return "";
    },
  },
  {
    regex: REGEX.header,
    replacer: (_match, $1, $2) => {
      const h = $1.trim().length;
      return `<h${h}>${$2.trim()}</h${h}>`;
    },
  },
  {
    regex: REGEX.image,
    replacer: (_match, $1, $2) => {
      return `<img src="${$2}" alt="${$1}">`;
    },
  },
  {
    regex: REGEX.link,
    replacer: (_match, $1, $2) => {
      return `<a href="${$2}">${$1}</a>`;
    },
  },
  {
    regex: REGEX.bold,
    replacer: (_match, _$1, $2) => {
      return `<strong>${$2}</strong>`;
    },
  },
  {
    regex: REGEX.italic,
    replacer: (_match, _$1, $2) => {
      return `<em>${$2}</em>`;
    },
  },
  {
    regex: REGEX.quote,
    replacer: (_match, $1, _$2) => {
      return `<q>${$1}</q>`;
    },
  },
  {
    regex: REGEX.fenced_code_backtick,
    replacer: (_match, _$1, _$2, _$3, $4) => {
      return `<pre><code>${getSyntaxHighlightedHtml($4)}</code></pre>`;
    },
  },
  {
    regex: REGEX.fenced_code_tilde,
    replacer: (_match, _$1, _$2, _$3, $4) => {
      const tree = language.parser.parse($4);
      highlightTree(tree, SPARKDOWN_HIGHLIGHTS, (from, to, token) => {
        console.log({ from, to, token });
      });
      return `<pre><code>${getSyntaxHighlightedHtml($4)}</code></pre>`;
    },
  },
  {
    regex: REGEX.inline_code,
    replacer: (_match, $1, _$2) => {
      return `<code>${$1}</code>`;
    },
  },
  {
    regex: REGEX.list_unordered,
    replacer: (_match, $1, _$2) => {
      return `<ul><li>${$1.trim()}</li></ul>`;
    },
  },
  {
    regex: REGEX.list_ordered,
    replacer: (_match, $1, _$2) => {
      return `<ol><li>${$1.trim()}</li></ol>`;
    },
  },
  {
    regex: REGEX.horizontal_rule,
    replacer: () => {
      return "<hr />";
    },
  },
  {
    regex: REGEX.strikethrough,
    replacer: (_match, $1, _$2) => {
      return `<del>${$1}</del>`;
    },
  },
  {
    regex: REGEX.blockquote,
    replacer: (_$match, _$1, $2) => {
      return `\n<blockquote>${$2}</blockquote>`;
    },
  },
  {
    regex: REGEX.paragraph,
    replacer: (_$match, $1) => {
      let trimmed = $1.trim();
      if (REGEX.paragraph_ignore.test(trimmed)) {
        return `\n${trimmed}\n`;
      }
      return `\n<p>${trimmed}</p>\n`;
    },
  },
  {
    regex: REGEX.fix_list_unordered,
    replacer: (_$match, _$1) => {
      return "";
    },
  },
  {
    regex: REGEX.fix_list_ordered,
    replacer: (_$match, _$1) => {
      return "";
    },
  },
  {
    regex: REGEX.fix_blockquote,
    replacer: (_$match, _$1) => {
      return "";
    },
  },
];

export const getMarkdownHtml = (markdown: string): string => {
  rules.forEach((rule) => {
    markdown = markdown.replace(rule.regex, rule.replacer);
  });
  console.log(markdown);
  return markdown.trim();
};
