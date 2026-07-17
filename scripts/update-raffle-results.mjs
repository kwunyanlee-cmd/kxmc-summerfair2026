#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const dash = "\u2014";

const drawConfigs = {
  "2pm": {
    id: "draw2pm",
    pendingEn: "To be drawn at 2pm",
    pendingZh: "下午2時開獎",
  },
  "330pm": {
    id: "draw330pm",
    pendingEn: "To be drawn at 3:30pm",
    pendingZh: "下午3時30分開獎",
  },
};

const usage = `
Usage:
  node scripts/update-raffle-results.mjs results.json
  node scripts/update-raffle-results.mjs '{"2pm":{"1":["045","178"]}}'
  Get-Content results.json | node scripts/update-raffle-results.mjs

Top-level draw keys: 2pm, draw2pm, 330pm, 3:30pm, 3.30pm, draw330pm.
Use string ticket numbers to preserve leading zeroes.
`;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write(usage.trimStart());
  process.exit(0);
}

const htmlPath = resolveHtmlPath();
const input = readInput();
const rawPayload = parseJson(input);
const payload = rawPayload.draws && typeof rawPayload.draws === "object" ? rawPayload.draws : rawPayload;

let html = readFileSync(htmlPath, "utf8");
let updatedDrawCount = 0;

for (const [rawKey, rawValue] of Object.entries(payload)) {
  const drawKey = normalizeDrawKey(rawKey);
  if (!drawKey) {
    throw new Error(`Unknown draw key "${rawKey}". Expected 2pm or 330pm.`);
  }

  const { prizes, status } = normalizeDrawPayload(rawValue);
  html = updateDraw(html, drawConfigs[drawKey], prizes, status);
  updatedDrawCount += 1;
}

if (updatedDrawCount === 0) {
  throw new Error("No draw results found in input.");
}

writeFileSync(htmlPath, html, "utf8");
process.stdout.write(`Updated ${updatedDrawCount} draw(s) in ${htmlPath}\n`);

function resolveHtmlPath() {
  const configuredPath = process.env.RAFFLE_INDEX_PATH;
  if (!configuredPath) {
    return resolve(repoRoot, "index.html");
  }

  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);
}

function readInput() {
  const [arg] = process.argv.slice(2).filter((value) => !value.startsWith("-"));

  if (!arg) {
    const stdin = readFileSync(0, "utf8").trim();
    if (!stdin) {
      throw new Error(`Missing input.\n\n${usage}`);
    }
    return stdin;
  }

  const possiblePath = resolve(process.cwd(), arg);
  if (existsSync(possiblePath)) {
    return readFileSync(possiblePath, "utf8");
  }

  return arg;
}

function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch (error) {
    throw new Error(`Could not parse raffle results JSON: ${error.message}`);
  }
}

function normalizeDrawKey(value) {
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "2pm" || compact === "draw2pm") {
    return "2pm";
  }
  if (
    compact === "330pm" ||
    compact === "3:30pm" ||
    compact === "3.30pm" ||
    compact === "draw330pm"
  ) {
    return "330pm";
  }

  return null;
}

function normalizeDrawPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Each draw value must be an object.");
  }

  const status = typeof value.status === "string" ? value.status : undefined;
  const rawPrizes = value.prizes && typeof value.prizes === "object" ? value.prizes : value;
  const prizes = {};

  for (const [key, rawNumbers] of Object.entries(rawPrizes)) {
    if (key === "status") {
      continue;
    }
    prizes[key] = normalizeNumbers(rawNumbers);
  }

  return { prizes, status };
}

function normalizeNumbers(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeTicketNumber).filter(Boolean);
  }

  if (typeof value === "number") {
    return [String(value)];
  }

  if (typeof value === "string") {
    return value
      .split(/[,+&/]| and /i)
      .map(normalizeTicketNumber)
      .filter(Boolean);
  }

  throw new Error("Prize results must be a string, number, or array.");
}

function normalizeTicketNumber(value) {
  return String(value).trim();
}

function updateDraw(sourceHtml, config, prizes, status) {
  const startNeedle = `<div class="raffle-card" id="${config.id}">`;
  const start = sourceHtml.indexOf(startNeedle);
  if (start === -1) {
    throw new Error(`Could not find raffle card "${config.id}".`);
  }

  const nextCard = sourceHtml.indexOf('<div class="raffle-card"', start + startNeedle.length);
  const sectionEnd = sourceHtml.indexOf("</section>", start);
  const end = nextCard === -1 || nextCard > sectionEnd ? sectionEnd : nextCard;
  if (end === -1) {
    throw new Error(`Could not determine the end of raffle card "${config.id}".`);
  }

  let block = sourceHtml.slice(start, end);
  for (const [prizeNumber, numbers] of Object.entries(prizes)) {
    block = updatePrizeRow(block, prizeNumber, numbers);
  }
  block = updateStatus(block, status, config);

  return `${sourceHtml.slice(0, start)}${block}${sourceHtml.slice(end)}`;
}

function updatePrizeRow(block, prizeNumber, numbers) {
  const rowPattern = new RegExp(
    `(<li class="raffle-row"><span class="prize"><span class="en-only">${escapeRegExp(
      prizeNumber,
    )} \u00b7[\\s\\S]*?<span class="raffle-nums">)([\\s\\S]*?)(</span></li>)`,
  );
  const match = block.match(rowPattern);
  if (!match) {
    throw new Error(`Could not find prize ${prizeNumber} in the target draw.`);
  }

  const existingSlotCount = (match[2].match(/class="raffle-num/g) || []).length;
  const slotCount = Math.max(existingSlotCount, numbers.length);
  const chips = Array.from({ length: slotCount }, (_, index) => {
    const number = numbers[index];
    if (number) {
      return `<span class="raffle-num won">${escapeHtml(number)}</span>`;
    }
    return `<span class="raffle-num">${dash}</span>`;
  }).join("");

  return block.replace(rowPattern, `$1${chips}$3`);
}

function updateStatus(block, status, config) {
  const statusPattern =
    /<div class="raffle-status(?: done)?"><span class="en-only">[\s\S]*?<\/span><span class="zh-only">[\s\S]*?<\/span><\/div>/;
  const existingStatus = block.match(statusPattern)?.[0];
  if (!existingStatus) {
    throw new Error(`Could not find status for raffle card "${config.id}".`);
  }

  const requestedStatus = status?.toLowerCase().trim();
  const shouldMarkDone =
    requestedStatus === "done" ||
    requestedStatus === "drawn" ||
    (!requestedStatus && allSlotsFilled(block));

  if (shouldMarkDone) {
    return block.replace(
      statusPattern,
      '<div class="raffle-status done"><span class="en-only">Drawn \u2713</span><span class="zh-only">已開獎 \u2713</span></div>',
    );
  }

  if (requestedStatus === "pending" || requestedStatus === "todo" || requestedStatus === "to be drawn") {
    return block.replace(
      statusPattern,
      `<div class="raffle-status"><span class="en-only">${config.pendingEn}</span><span class="zh-only">${config.pendingZh}</span></div>`,
    );
  }

  return block;
}

function allSlotsFilled(block) {
  return !new RegExp(`<span class="raffle-num(?: won)?">\\s*${dash}\\s*</span>`).test(block);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
