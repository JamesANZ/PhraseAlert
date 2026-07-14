/**
 * @title NatSpec comment extractor
 * @notice Walks TypeScript sources and emits userdoc + devdoc JSON from /** ... *\/ blocks.
 * @dev Run: npm run docs:extract — writes docs/natspec-userdoc.json and docs/natspec-devdoc.json
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const SKIP_DIRS = new Set(["node_modules", ".next", "data", "docs", ".git"]);

const USER_TAGS = new Set(["@title", "@notice", "@author"]);
const DEV_TAGS = new Set(["@dev", "@param", "@return", "@custom"]);

interface Block {
  file: string;
  line: number;
  tags: Record<string, string[]>;
  untagged: string[];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function parseBlock(raw: string): {
  tags: Record<string, string[]>;
  untagged: string[];
} {
  const tags: Record<string, string[]> = {};
  const untagged: string[] = [];
  let currentTag: string | null = null;

  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/^\s*\*\s?/, "").trim();
    if (!trimmed) continue;

    const tagMatch = trimmed.match(/^@([\w:]+)\s*(.*)$/);
    if (tagMatch) {
      const [, tag, rest] = tagMatch;
      const key = `@${tag}`;
      currentTag = key;
      if (!tags[key]) tags[key] = [];
      if (rest) tags[key].push(rest);
      continue;
    }

    if (currentTag) {
      if (!tags[currentTag]) tags[currentTag] = [];
      tags[currentTag].push(trimmed);
    } else {
      untagged.push(trimmed);
    }
  }

  if (untagged.length > 0 && !tags["@notice"]) {
    tags["@notice"] = [...untagged];
    return { tags, untagged: [] };
  }

  return { tags, untagged };
}

function extractBlocks(filePath: string): Block[] {
  const content = readFileSync(filePath, "utf-8");
  const rel = relative(ROOT, filePath);
  const blocks: Block[] = [];
  const re = /\/\*\*([\s\S]*?)\*\//g;
  let match: RegExpExecArray | null;
  let line = 1;
  let index = 0;

  while ((match = re.exec(content)) !== null) {
    const before = content.slice(index, match.index);
    line += before.split("\n").length - 1;
    const { tags, untagged } = parseBlock(match[1]);
    if (Object.keys(tags).length > 0 || untagged.length > 0) {
      blocks.push({ file: rel, line, tags, untagged });
    }
    index = match.index + match[0].length;
  }

  return blocks;
}

function partition(blocks: Block[]) {
  const userdoc: Block[] = [];
  const devdoc: Block[] = [];

  for (const block of blocks) {
    const tagKeys = Object.keys(block.tags);
    const hasUser = tagKeys.some((k) => USER_TAGS.has(k) || k === "@notice");
    const hasDev = tagKeys.some(
      (k) => DEV_TAGS.has(k) || k.startsWith("@custom:"),
    );

    if (hasUser) userdoc.push(block);
    if (hasDev || tagKeys.some((k) => k === "@param" || k === "@return")) {
      devdoc.push(block);
    }
  }

  return { userdoc, devdoc };
}

function toMarkdown(blocks: Block[], title: string): string {
  const lines = [`# ${title}`, "", `Generated ${new Date().toISOString()}`, ""];
  for (const block of blocks) {
    const titleTag = block.tags["@title"]?.[0];
    const notice = block.tags["@notice"]?.join(" ") ?? "";
    lines.push(`## ${titleTag ?? block.file}:${block.line}`);
    lines.push("");
    lines.push(`*${block.file}:${block.line}*`);
    if (notice) lines.push("", notice, "");
    for (const [tag, values] of Object.entries(block.tags)) {
      if (tag === "@title" || tag === "@notice") continue;
      for (const v of values) {
        lines.push(`- **${tag}** ${v}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

const files = walk(ROOT);
const allBlocks = files.flatMap(extractBlocks);
const { userdoc, devdoc } = partition(allBlocks);

const outDir = join(ROOT, "docs");
mkdirSync(outDir, { recursive: true });

writeFileSync(
  join(outDir, "natspec-userdoc.json"),
  JSON.stringify({ version: 1, blocks: userdoc }, null, 2),
);
writeFileSync(
  join(outDir, "natspec-devdoc.json"),
  JSON.stringify({ version: 1, blocks: devdoc }, null, 2),
);
writeFileSync(
  join(outDir, "natspec-userdoc.md"),
  toMarkdown(userdoc, "Bellwether User Documentation"),
);
writeFileSync(
  join(outDir, "natspec-devdoc.md"),
  toMarkdown(devdoc, "Bellwether Developer Documentation"),
);

console.log(
  `Extracted ${allBlocks.length} NatSpec blocks from ${files.length} files`,
);
console.log(
  `  userdoc: ${userdoc.length} blocks → docs/natspec-userdoc.{json,md}`,
);
console.log(
  `  devdoc:  ${devdoc.length} blocks → docs/natspec-devdoc.{json,md}`,
);
