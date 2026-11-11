// Interactive chat in the terminal: npm run chat (needs ANTHROPIC_API_KEY).
import { readFileSync } from "node:fs";
import readline from "node:readline/promises";
import { createTools } from "./tools.js";
import { buildInstructions } from "./prompt.js";
import { runTurn, MODEL } from "./agent.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const { tools, cases } = createTools({ kb: load("kb.json"), fleet: load("fleet.json"), parts: load("parts.json") });
const system = buildInstructions(new Date().toISOString().slice(0, 10));

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY first (https://console.anthropic.com).");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const messages = [];
console.log(`Arc Moto aftersales agent (${MODEL}). Type your message, or "cases" to list cases, "exit" to quit.`);
console.log("Test VINs: ARCE1ES25A0001842, ARCE1ES23A0000417, ARCE1ES24B0000925, ARCE1AU25C0000311, ARCE1US26D0000058, ARCE1ES24E0001203, ARCE1ES26F0000212\n");

while (true) {
  const line = (await rl.question("you › ")).trim();
  if (!line) continue;
  if (line === "exit") break;
  if (line === "cases") { console.table(cases.map(({ id, status, priority, category, summary }) => ({ id, status, priority, category, summary }))); continue; }
  messages.push({ role: "user", content: line });
  const { text } = await runTurn({
    system, tools, messages,
    onTool: (name, input, output, isError) => console.log(`  ⚙ ${name}(${JSON.stringify(input)}) ${isError ? "✗ " + output : "✓"}`),
  });
  console.log(`\nagent › ${text}\n`);
}
rl.close();
