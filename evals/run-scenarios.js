// End-to-end evals with the real model: npm run eval (needs ANTHROPIC_API_KEY).
// Each scenario checks behaviour, not wording: which tools were called, the
// warranty decision the rules returned, whether and how the case was escalated.
import { readFileSync } from "node:fs";
import { createTools } from "../src/tools.js";
import { buildInstructions } from "../src/prompt.js";
import { runTurn, MODEL } from "../src/agent.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const scenarios = load("./scenarios.json");
const AS_OF = "2026-11-12";

let passed = 0;
for (const s of scenarios) {
  const { tools, cases } = createTools({ kb: load("../data/kb.json"), fleet: load("../data/fleet.json"), parts: load("../data/parts.json"), asOf: () => new Date(AS_OF + "T00:00:00Z") });
  const { text, trace } = await runTurn({ system: buildInstructions(AS_OF), tools, messages: [{ role: "user", content: s.message }] });

  const called = trace.map((t) => t.tool);
  const decision = trace.filter((t) => t.tool === "check_warranty" && !t.isError).map((t) => t.output.decision).pop();
  const escalation = cases.find((c) => c.status === "Escalated to human");
  const fails = [];
  for (const tool of s.expect.must_call || []) if (!called.includes(tool)) fails.push(`did not call ${tool}`);
  if (s.expect.warranty_decision && decision !== s.expect.warranty_decision) fails.push(`decision ${decision} ≠ ${s.expect.warranty_decision}`);
  if ("escalated" in s.expect && Boolean(escalation) !== s.expect.escalated) fails.push(`escalated=${Boolean(escalation)}`);
  if (s.expect.priority && escalation?.priority !== s.expect.priority) fails.push(`priority ${escalation?.priority} ≠ ${s.expect.priority}`);
  if (s.expect.mentions_any && !s.expect.mentions_any.some((w) => text.toLowerCase().includes(w.toLowerCase()))) fails.push(`reply mentions none of ${s.expect.mentions_any.join(", ")}`);

  if (fails.length === 0) passed++;
  console.log(`${fails.length ? "✗" : "✓"} ${s.name}${fails.length ? "\n    " + fails.join("\n    ") : ""}`);
}
console.log(`\n${passed}/${scenarios.length} scenarios passed (${MODEL})`);
process.exitCode = passed === scenarios.length ? 0 : 1;
