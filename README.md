# Arc Aftersales Agent

A working prototype of an AI-first aftersales desk for an electric motorcycle brand. The agent talks to riders and dealers, reads each bike's telemetry to act before the rider notices a problem, and settles warranty claims through a deterministic rules engine. Safety issues and doubtful cases go to a person with a summary they can act on.

I built it as part of my application to Stark Future's aftersales role. **Arc Moto, its bikes, customers and warranty policy are fictional**; the policy is modelled on EU and Spanish consumer law, which I applied for years as a Genius at Apple (I wrote the warranty decision playbook my store adopted).

**Live demo:** published as a Claude artifact (link in my application). It runs on the viewer's own Claude account.

## Design decisions

| Decision | Why |
|---|---|
| **The model never decides coverage.** `check_warranty` runs fixed rules in [`src/warranty.js`](src/warranty.js) and returns the decision, reasons and policy clauses. | Warranty decisions must be consistent, explainable and auditable. The LLM gathers facts and explains the outcome; code decides. |
| **Safety overrides everything.** Battery smoke, B30, brake failure and similar symptoms skip troubleshooting and go to a person at P1. | Automating the easy 90% only works if the risky 10% always reaches a human fast. |
| **Escalation is a first-class outcome**, not a failure. `needs_human` covers legal-guarantee evidence, possible modifications, overdue services and goodwill. | Missed services or modifications are reviewed case by case, never refused automatically by a bot. |
| **Proactive telemetry.** `get_vehicle` returns live alerts (e.g. a rising B12 cell imbalance) and the agent must mention them. | The best support is the one the customer never has to ask for. |
| **Low-value parts get a new part, not a repair.** | Faster and cheaper for the customer, with a fresh parts warranty. |
| **Every request is logged** as resolved by the agent or escalated, so autonomy rate and escalation reasons can be measured. | You can only improve what you measure. |

## Tools

| Tool | What it does |
|---|---|
| `search_knowledge_base` | Searches 11 policy and how-to articles ([`data/kb.json`](data/kb.json)) and cites them. |
| `get_vehicle` | Bike record by VIN: owner type, country, mileage, services, modifications, battery health, telemetry alerts. |
| `check_warranty` | Deterministic coverage decision: `covered`, `not_covered`, `offer_replacement`, `needs_diagnosis`, `needs_human`, `escalate_safety`. |
| `check_parts` | Stock and restock dates by region (EU, NA, AU). |
| `log_case` / `escalate_to_human` | Close the case, or hand it to a person with priority and a summary. |

## Run it

```bash
npm install
npm test                 # 16 warranty rule tests, no API key needed
export ANTHROPIC_API_KEY=...
npm run chat             # chat with the agent in the terminal
npm run eval             # 8 end-to-end scenarios on the Claude API
npm run build            # builds the web demo into dist/index.html
```

## Evals

- **Rule tests** ([`evals/rule-cases.json`](evals/rule-cases.json)): 16 cases covering the commercial warranty, the battery capacity threshold, the Spanish 3-year legal guarantee and its 2-year presumption, business buyers, competition use, modifications, wear items, crash damage and safety.
- **Scenario evals** ([`evals/scenarios.json`](evals/scenarios.json)): the full agent on the Claude API. They check behaviour, not wording: which tools it called, the warranty decision, whether it escalated and at what priority, including a prompt-injection attempt.

## Structure

```
data/      knowledge base, test fleet with telemetry, parts catalogue
src/       warranty rules, tools, instructions, Node agent loop, CLI
evals/     rule tests and end-to-end scenarios
web/       single-file demo (template + build script)
```

Author: Luis Rayón · [linkedin.com/in/luis-rayón](https://www.linkedin.com/in/luis-ray%C3%B3n)
