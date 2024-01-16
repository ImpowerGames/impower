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
  console.log("str", str);
  const tree = language.parser.parse(str);
  let html = "";
  let prev = 0;
  highlightTree(tree, highlighter, (from, to, token) => {
    const s = str.slice(from, to);
    const diff = from - prev;
    if (diff > 0) {
      console.log("span", str.slice(from - diff, from));
      html += `<span>${str.slice(from - diff, from)}</span>`;
    }
    console.log("s", s);
    html += `<span class="${token}">${s}</span>`;
    prev = to;
  });
  return html;
};

const syntaxHighlightingReplacer = (
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  },
  match: string[]
) => {
  const $2 = match[2] || "";
  const $4 = match[4] || "";
  const content =
    $2 === language.name
      ? getSyntaxHighlightedHtml($4, language, highlighter)
      : $4;
  return `<pre><code>${content}</code></pre>`;
};

const getRules = (
  language: Language,
  highlighter: {
    style(tags: readonly Tag[]): string | null;
    scope?(node: NodeType): boolean;
  }
): {
  regex: RegExp;
  replacer: (...match: string[]) => string;
}[] => [
  {
    regex: MARKDOWN_REGEX.fenced_code_backtick,
    replacer: (...match: string[]) => {
      return syntaxHighlightingReplacer(language, highlighter, match);
    },
  },
  {
    regex: MARKDOWN_REGEX.fenced_code_tilde,
    replacer: (...match: string[]) => {
      return syntaxHighlightingReplacer(language, highlighter, match);
    },
  },
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
      return `<b>${$2}</b>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.italic,
    replacer: (_match, _$1, $2) => {
      return `<i>${$2}</i>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.underline,
    replacer: (_match, _$1, $2) => {
      return `<u>${$2}</u>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.emphasis,
    replacer: (_match, $1, _$2) => {
      return `<em>${$1}</em>`;
    },
  },
  {
    regex: MARKDOWN_REGEX.quote,
    replacer: (_match, $1, _$2) => {
      return `<q>${$1}</q>`;
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
  const codeMatch =
    markdown.match(MARKDOWN_REGEX.fenced_code_backtick) ||
    markdown.match(MARKDOWN_REGEX.fenced_code_tilde);
  if (codeMatch) {
    return syntaxHighlightingReplacer(language, highlighter, codeMatch);
  }
  const rules = getRules(language, highlighter);
  rules.forEach((rule) => {
    markdown = markdown.replace(rule.regex, rule.replacer);
  });
  return markdown.trim();
};
