/**
 * buildReadingPdf — deterministic, on-demand PDF generation for the Stoic
 * Birthday Reading, built with pdf-lib (pure JS, serverless-safe).
 *
 * The reading text is generated as a small markdown-like format. We parse
 * the subset the generator emits (bold section headers, numbered items,
 * bullets, inline bold/italic) and lay it out on A4 pages with manual
 * word-wrapping. The bytes are always rebuilt from the stored
 * `readingText`, so nothing is written to disk and the PDF never goes stale.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const MAX_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_ZONE = 46; // keep body away from the footer strip

// Brand palette (matches the email template)
const INK = rgb(0.173, 0.165, 0.149); // #2c2a26
const GOLD = rgb(0.722, 0.525, 0.043); // #b8860b
const MUTED = rgb(0.42, 0.38, 0.337); // #6b6156
const DIVIDER = rgb(0.91, 0.878, 0.831); // #e8e0d4

const KICKER_SIZE = 9;
const TITLE_SIZE = 21;
const SUBTITLE_SIZE = 11;
const HEADER_SIZE = 12.5;
const BODY_SIZE = 10.5;
const BODY_LINE = 14.5;
const FOOTER_SIZE = 7.5;

export interface ReadingPdfInput {
  readingText: string;
  title?: string;
  subtitle?: string;
}

type Block =
  | { kind: "header"; text: string }
  | { kind: "item"; number: string; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

type StyledToken = { text: string; bold: boolean; italic: boolean; gold?: boolean };

interface Fonts {
  plain: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

export async function buildReadingPdf(input: ReadingPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    plain: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  const blocks = parseBlocks(input.readingText);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawHeader(page, fonts, input);

  for (const block of blocks) {
    const drawn = drawBlock(page, fonts, block, y);
    page = drawn.page;
    y = drawn.y;
  }

  // Footer on every page
  const pages = doc.getPages();
  pages.forEach((p, i) => drawFooter(p, fonts, i, pages.length));

  return doc.save();
}

/** Split the reading text into layout blocks on blank lines. */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\n\n+/)) {
    const chunk = raw.replace(/\s*\n\s*/g, " ").trim();
    if (!chunk) continue;

    const header = /^\*\*(.+?)\*\*$/.exec(chunk);
    if (header) {
      blocks.push({ kind: "header", text: header[1] });
      continue;
    }
    const item = /^(\d+)\.\s+(.+)$/.exec(chunk);
    if (item) {
      blocks.push({ kind: "item", number: item[1], text: item[2] });
      continue;
    }
    if (chunk.startsWith("- ")) {
      blocks.push({ kind: "bullet", text: chunk.slice(2) });
      continue;
    }
    blocks.push({ kind: "paragraph", text: chunk });
  }
  return blocks;
}

/**
 * pdf-lib's built-in fonts use WinAnsi encoding — map decorative characters
 * to safe equivalents so drawText never throws on an unknown glyph.
 */
function sanitize(text: string): string {
  return text
    .replace(/✦/g, "·")
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•…€™]/g, "");
}

function pushStyled(out: StyledToken[], text: string, bold: boolean, italic: boolean): void {
  for (const word of text.split(/\s+/)) {
    if (word) out.push({ text: word, bold, italic });
  }
}

/** Split a text into styled word tokens, honoring **bold** and *italic* markers. */
function tokenizeStyled(text: string): StyledToken[] {
  const safe = sanitize(text);
  const out: StyledToken[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(safe)) !== null) {
    if (m.index > last) pushStyled(out, safe.slice(last, m.index), false, false);
    if (m[1] !== undefined) pushStyled(out, m[1], true, false);
    else if (m[2] !== undefined) pushStyled(out, m[2], false, true);
    last = m.index + m[0].length;
  }
  if (last < safe.length) pushStyled(out, safe.slice(last), false, false);
  return out;
}

function fontFor(token: StyledToken, fonts: Fonts): PDFFont {
  if (token.bold && token.italic) return fonts.boldItalic;
  if (token.bold) return fonts.bold;
  if (token.italic) return fonts.italic;
  return fonts.plain;
}

function tokenWidth(token: StyledToken, fonts: Fonts, size: number): number {
  return fontFor(token, fonts).widthOfTextAtSize(token.text, size);
}

/** Split a single over-long token into pieces that each fit maxWidth. */
function splitOversize(token: StyledToken, fonts: Fonts, size: number, maxWidth: number): StyledToken[] {
  if (tokenWidth(token, fonts, size) <= maxWidth) return [token];
  const pieces: StyledToken[] = [];
  let buff = "";
  for (const ch of token.text) {
    if (buff && fontFor(token, fonts).widthOfTextAtSize(buff + ch, size) > maxWidth) {
      pieces.push({ ...token, text: buff });
      buff = ch;
    } else {
      buff += ch;
    }
  }
  if (buff) pieces.push({ ...token, text: buff });
  return pieces;
}

/** Greedy word-wrap: returns lines, each an array of styled tokens. */
function wrapTokens(tokens: StyledToken[], fonts: Fonts, size: number, maxWidth: number): StyledToken[][] {
  const lines: StyledToken[][] = [];
  let current: StyledToken[] = [];
  let width = 0;
  const spaceWidth = fonts.plain.widthOfTextAtSize(" ", size);

  for (const raw of tokens) {
    for (const token of splitOversize(raw, fonts, size, maxWidth)) {
      const w = tokenWidth(token, fonts, size);
      if (current.length === 0 || width + spaceWidth + w <= maxWidth) {
        current.push(token);
        width += w + (current.length > 1 ? spaceWidth : 0);
      } else {
        lines.push(current);
        current = [token];
        width = w;
      }
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/** Draw one wrapped line per array; returns the updated page and next y. */
function drawLines(
  page: PDFPage,
  fonts: Fonts,
  lines: StyledToken[][],
  y: number,
  size: number,
  lineHeight: number,
): { page: PDFPage; y: number } {
  const spaceWidth = fonts.plain.widthOfTextAtSize(" ", size);
  for (const line of lines) {
    if (y - lineHeight < FOOTER_ZONE) {
      page = page.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
    let x = MARGIN;
    for (let i = 0; i < line.length; i++) {
      const token = line[i];
      const f = fontFor(token, fonts);
      page.drawText(token.text, { x, y, size, font: f, color: token.gold ? GOLD : INK });
      x += tokenWidth(token, fonts, size);
      if (i < line.length - 1) x += spaceWidth;
    }
    y -= lineHeight;
  }
  return { page, y };
}

function drawBlock(page: PDFPage, fonts: Fonts, block: Block, y: number): { page: PDFPage; y: number } {
  switch (block.kind) {
    case "header": {
      const lines = wrapTokens(tokenizeStyled(block.text), fonts, HEADER_SIZE, MAX_WIDTH);
      const drawn = drawLines(page, fonts, lines, y - 10, HEADER_SIZE, HEADER_SIZE + 7);
      return { page: drawn.page, y: drawn.y - 5 };
    }
    case "item": {
      const marker: StyledToken = { text: `${block.number}.`, bold: true, italic: false, gold: true };
      const lines = wrapTokens([marker, ...tokenizeStyled(block.text)], fonts, BODY_SIZE, MAX_WIDTH);
      const drawn = drawLines(page, fonts, lines, y - 4, BODY_SIZE, BODY_LINE);
      return { page: drawn.page, y: drawn.y };
    }
    case "bullet": {
      const marker: StyledToken = { text: "•", bold: true, italic: false, gold: true };
      const lines = wrapTokens([marker, ...tokenizeStyled(block.text)], fonts, BODY_SIZE, MAX_WIDTH);
      const drawn = drawLines(page, fonts, lines, y - 4, BODY_SIZE, BODY_LINE);
      return { page: drawn.page, y: drawn.y };
    }
    default: {
      const lines = wrapTokens(tokenizeStyled(block.text), fonts, BODY_SIZE, MAX_WIDTH);
      const drawn = drawLines(page, fonts, lines, y - 4, BODY_SIZE, BODY_LINE);
      return { page: drawn.page, y: drawn.y };
    }
  }
}

function drawHeader(page: PDFPage, fonts: Fonts, input: ReadingPdfInput): number {
  const kicker = "· STOIC ZODIAC · FREE READING";
  const title = sanitize(input.title ?? "Your Stoic Birthday Reading");
  const subtitle = sanitize(input.subtitle ?? "A Stoic Reflection on Your Nature");

  let y = PAGE_HEIGHT - MARGIN;
  page.drawText(kicker, { x: MARGIN, y, size: KICKER_SIZE, font: fonts.bold, color: GOLD });
  y -= KICKER_SIZE + 8;

  const titleLines = wrapTokens([{ text: title, bold: true, italic: false }], fonts, TITLE_SIZE, MAX_WIDTH);
  for (const line of titleLines) {
    page.drawText(line.map((t) => t.text).join(" "), { x: MARGIN, y, size: TITLE_SIZE, font: fonts.bold, color: INK });
    y -= TITLE_SIZE + 4;
  }

  page.drawText(subtitle, { x: MARGIN, y, size: SUBTITLE_SIZE, font: fonts.plain, color: MUTED });
  y -= SUBTITLE_SIZE + 12;

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: DIVIDER });
  return y - 16;
}

function drawFooter(page: PDFPage, fonts: Fonts, index: number, count: number): void {
  const y = 26;
  const text = "Symbolic reflection, not science — your future remains written by your choices.";
  page.drawText(text, { x: MARGIN, y, size: FOOTER_SIZE, font: fonts.italic, color: MUTED });
  const pageNumber = `${index + 1} / ${count}`;
  const w = fonts.plain.widthOfTextAtSize(pageNumber, FOOTER_SIZE);
  page.drawText(pageNumber, { x: PAGE_WIDTH - MARGIN - w, y, size: FOOTER_SIZE, font: fonts.plain, color: MUTED });
}