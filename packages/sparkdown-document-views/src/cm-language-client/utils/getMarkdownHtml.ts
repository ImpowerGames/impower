import { Language } from "@codemirror/language";
import { NodeType } from "@lezer/common";
import { highlightTree, Tag } from "@lezer/highlight";
import { MARKDOWN_REGEX } from "../constants/MARKDOWN_REGEX";

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
    regex: MARKDOWN_REGEX.header,
    replacer: (_match, $1, $2) => {
      const h = $1.trim().length;
      return `<h${h}>${$2.trim()}</h${h}>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.image,
    replacer: (_match, $1, $2) => {
      return `<img src="${$2}" alt="${$1}">`;
    },
  },
  {
    regex: MARKDOWN_REGEX.link,
    replacer: (_match, $1, $2) => {
      return `<a href="${$2}">${$1}</a>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.bold,
    replacer: (_match, _$1, $2) => {
      return `<strong>${$2}</strong>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.italic,
    replacer: (_match, _$1, $2) => {
      return `<em>${$2}</em>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.quote,
    replacer: (_match, $1, _$2) => {
      return `<q>${$1}</q>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.fenced_code_backtick,
    replacer: (_match, _$1, $2, _$3, $4) => {
      const content =
        $2 === language.name
          ? getSyntaxHighlightedHtml($4, language, highlighter)
          : $4;
      return `<pre><code>${content}</code></pre>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.fenced_code_tilde,
    replacer: (_match, _$1, $2, _$3, $4) => {
      const content =
        $2 === language.name
          ? getSyntaxHighlightedHtml($4, language, highlighter)
          : $4;
      return `<pre><code>${content}</code></pre>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.inline_code,
    replacer: (_match, $1, _$2) => {
      return `<code>${$1}</code>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.list_unordered,
    replacer: (_match, $1, _$2) => {
      return `<ul><li>${$1.trim()}</li></ul>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.list_ordered,
    replacer: (_match, $1, _$2) => {
      return `<ol><li>${$1.trim()}</li></ol>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.horizontal_rule,
    replacer: () => {
      return "<hr />";
    },
  },
  {
    regex: MARKDOWN_REGEX.strikethrough,
    replacer: (_match, $1, _$2) => {
      return `<del>${$1}</del>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.blockquote,
    replacer: (_$match, _$1, $2) => {
      return `<blockquote>${$2}</blockquote>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.paragraph,
    replacer: (_$match, _$1, $2) => {
      let trimmed = $2.trim();
      if (!trimmed) {
        return "";
      }
      if (MARKDOWN_REGEX.paragraph_ignore.test(trimmed)) {
        return `\n${trimmed}\n`;
      }
      return `<p>${trimmed}</p>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.fix_list_unordered,
    replacer: (_$match, _$1) => {
      return "";
    },
  },
  {
    regex: MARKDOWN_REGEX.fix_list_ordered,
    replacer: (_$match, _$1) => {
      return "";
    },
  },
  {
    regex: MARKDOWN_REGEX.fix_blockquote,
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
