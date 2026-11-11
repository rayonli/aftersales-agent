// Builds the single-file web demo (dist/index.html) from the same source the CLI uses.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (src) => src.replace(/^import .*$/gm, "").replace(/^export /gm, "");

const data = [
  `const KB = ${read("../data/kb.json").trim()};`,
  `const FLEET = ${read("../data/fleet.json").trim()};`,
  `const PARTS = ${read("../data/parts.json").trim()};`,
  `const RULE_CASES = ${read("../evals/rule-cases.json").trim()};`,
].join("\n");
const core = ["../src/warranty.js", "../src/tools.js", "../src/prompt.js"].map((p) => strip(read(p))).join("\n");

const html = read("./template.html").replace("/*__DATA__*/", () => data).replace("/*__CORE__*/", () => core);
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/index.html", import.meta.url), html);
console.log(`dist/index.html written (${(html.length / 1024).toFixed(0)} KB)`);
