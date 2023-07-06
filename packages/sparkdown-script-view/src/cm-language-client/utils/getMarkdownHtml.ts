import { Language } from "@codemirror/language";
import { NodeType } from "@lezer/common";
import { highlightTree, Tag } from "@lezer/highlight";

const getSyntaxHighlightedHtml = (
  str: string,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
) => {
  const tree = language.parser.parse(str);
  let html = "";
  let prev = 0;
  highlightTree(tree, highlighter, (from, to, token) => {
    const s = str.slice(from, to);
    const diff = from - prev;
    if (diff > 0) {
      html += `<span>${str.slice(from - diff, from)}</span>`;
    }
    html += `<span class="${token}">${s}</span>`;
    prev = to;
  });
  return html;
};

const REGEX = {
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
  paragraph: /(^|\n\n)((?:(?!\n\n)[\s\S])*)/gim,
  paragraph_ignore: /^<\/?(ul|ol|li|h|p|bl|code|table|tr|td)/i,
  fix_list_unordered: /<\/ul>\s?<ul>/gim,
  fix_list_ordered: /<\/ol>\s<ol>/gim,
  fix_blockquote: /<\/blockquote>\s?<blockquote>/gim,
} as const;

const getRules = (
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): {
  regex: RegExp;
  replacer: (substring: string, ...args: any[]) => string;
}[] => [
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
    replacer: (_match, _$1, $2, _$3, $4) => {
      console.log($2, language.name);
      const content =
        $2 === language.name
          ? getSyntaxHighlightedHtml($4, language, highlighter)
          : $4;
      return `<pre><code>${content}</code></pre>`;
    },
  },
  {
    regex: REGEX.fenced_code_tilde,
    replacer: (_match, _$1, $2, _$3, $4) => {
      console.log($2, language.name);
      const content =
        $2 === language.name
          ? getSyntaxHighlightedHtml($4, language, highlighter)
          : $4;
      return `<pre><code>${content}</code></pre>`;
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
      return `<blockquote>${$2}</blockquote>`;
    },
  },
  {
    regex: REGEX.paragraph,
    replacer: (_$match, _$1, $2) => {
      let trimmed = $2.trim();
      if (!trimmed) {
        return "";
      }
      if (REGEX.paragraph_ignore.test(trimmed)) {
        return `\n${trimmed}\n`;
      }
      return `<p>${trimmed}</p>`;
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

export const getMarkdownHtml = (
  markdown: string,
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): string => {
  const rules = getRules(language, highlighter);
  rules.forEach((rule) => {
    markdown = markdown.replace(rule.regex, rule.replacer);
  });
  return markdown.trim();
};
