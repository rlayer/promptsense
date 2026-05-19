import type { ReactNode } from "react";

interface MarkdownTextProps {
  text: string;
  className?: string;
}

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const PLAIN_SECTION_HEADINGS = ["Summary", "Direct impact", "Side effects", "Checks"];

/** Renders the limited markdown/plain-text subset used by analysis summaries. */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  return (
    <div className={className}>
      {parseMarkdownBlocks(text).map((block, index) => renderBlock(block, index))}
    </div>
  );
}

/** Renders a parsed markdown block as React nodes. */
function renderBlock(block: MarkdownBlock, index: number): ReactNode {
  if (block.type === "heading") {
    const HeadingTag = `h${Math.min(4, Math.max(3, block.level + 2))}` as "h3" | "h4";
    return <HeadingTag key={index}>{renderInlineMarkdown(block.text)}</HeadingTag>;
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
        ))}
      </ListTag>
    );
  }

  return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
}

/** Parses supported markdown and plain fallback sections into block objects. */
function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    const plainSection = parsePlainSectionHeading(line);
    if (plainSection) {
      blocks.push({ type: "heading", level: 1, text: plainSection.title });
      if (plainSection.body) {
        blocks.push({ type: "paragraph", text: plainSection.body });
      }
      index += 1;
      continue;
    }

    const list = parseList(lines, index);
    if (list) {
      blocks.push(list.block);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const current = lines[index].trim();
      if (!current || isHeading(current) || isPlainSectionHeading(current) || isListItem(current)) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join(" ") });
  }

  return blocks;
}

/** Detects fallback section headings such as Summary or Checks. */
function parsePlainSectionHeading(line: string): { title: string; body: string } | null {
  for (const title of PLAIN_SECTION_HEADINGS) {
    if (line.toLocaleLowerCase() === title.toLocaleLowerCase()) {
      return { title, body: "" };
    }

    const prefix = `${title}:`;
    if (line.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase())) {
      return { title, body: line.slice(prefix.length).trim() };
    }
  }

  return null;
}

/** Parses an ordered or unordered list starting at a specific line. */
function parseList(
  lines: string[],
  startIndex: number
): { block: MarkdownBlock; nextIndex: number } | null {
  const first = lines[startIndex].trim();
  const ordered = /^(\d+)\.\s+(.+)$/.exec(first);
  const unordered = /^[-*]\s+(.+)$/.exec(first);
  const isOrdered = Boolean(ordered);
  const firstText = ordered?.[2] ?? unordered?.[1];

  if (!firstText) {
    return null;
  }

  const items: string[] = [];
  let currentItem = firstText;
  let index = startIndex + 1;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      break;
    }

    const nextOrdered = /^(\d+)\.\s+(.+)$/.exec(line);
    const nextUnordered = /^[-*]\s+(.+)$/.exec(line);
    const nextText = isOrdered ? nextOrdered?.[2] : nextUnordered?.[1];

    if (nextText) {
      items.push(currentItem);
      currentItem = nextText;
      index += 1;
      continue;
    }

    if (isHeading(line) || (isOrdered ? nextUnordered : nextOrdered)) {
      break;
    }

    currentItem = `${currentItem} ${line}`;
    index += 1;
  }

  items.push(currentItem);

  return {
    block: { type: "list", ordered: isOrdered, items },
    nextIndex: index
  };
}

/** Renders supported inline strong/code markdown tokens. */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

/** Checks whether a line starts a markdown heading. */
function isHeading(line: string): boolean {
  return /^(#{1,4})\s+/.test(line);
}

/** Checks whether a line starts a supported plain-text fallback section. */
function isPlainSectionHeading(line: string): boolean {
  return parsePlainSectionHeading(line) !== null;
}

/** Checks whether a line starts an ordered or unordered list item. */
function isListItem(line: string): boolean {
  return /^(\d+)\.\s+/.test(line) || /^[-*]\s+/.test(line);
}
