// Tools the agent can call. Each tool is { name, description, inputSchema, execute }.
// The same definitions run in the browser demo and in the Node CLI.
import { checkWarranty, COMPONENTS, CAUSES, USAGE } from "./warranty.js";

const REGION = { ES: "EU", PT: "EU", FR: "EU", IT: "EU", DE: "EU", NL: "EU", US: "NA", CA: "NA", AU: "AU" };
const STOP = new Set("a an the is it my of to and or for in on at with what how do does can i we our this that be are was".split(" "));
const tokens = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));

export function searchKb(kb, query, k = 3) {
  const q = tokens(query);
  return kb
    .map((a) => {
      const title = tokens(a.title), tags = tokens(a.tags.join(" ")), body = tokens(a.body);
      let score = 0;
      for (const t of q) {
        if (title.includes(t)) score += 3;
        if (tags.includes(t)) score += 2;
        score += Math.min(body.filter((b) => b === t).length, 3);
      }
      return { a, score };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, k)
    .map(({ a }) => ({ id: a.id, title: a.title, text: a.body }));
}

export function createTools({ kb, fleet, parts, asOf = () => new Date(), onCase = () => {} }) {
  const cases = [];
  let next = 1;
  const findVehicle = (vin) => {
    const v = String(vin || "").trim().toUpperCase();
    return fleet.find((b) => b.vin === v);
  };
  const addCase = (c) => {
    const rec = { id: `CASE-${String(1000 + next++)}`, created: asOf().toISOString(), ...c };
    cases.push(rec);
    onCase(rec, cases);
    return rec;
  };

  const tools = [
    {
      name: "search_knowledge_base",
      description: "Search the aftersales knowledge base (warranty policy, legal guarantee, dash warning codes, safety rules, service schedule, charging, parts ordering, washing, competition use). Returns up to 3 articles with their id and text. Use it before answering any policy or how-to question, and cite the article id.",
      inputSchema: { type: "object", properties: { query: { type: "string", description: "Keywords, e.g. 'B12 warning code' or 'brake pads warranty'" } }, required: ["query"] },
      execute: ({ query }) => {
        const hits = searchKb(kb, query);
        return hits.length ? hits : "No article matched. Try other keywords, or escalate if the question is not covered.";
      },
    },
    {
      name: "get_vehicle",
      description: "Look up a bike by its 17-character VIN. Returns owner type, country, delivery date, mileage, service history, recorded modifications, usage flags, battery health and live telemetry alerts. Always check telemetry_alerts and mention any relevant alert proactively.",
      inputSchema: { type: "object", properties: { vin: { type: "string" } }, required: ["vin"] },
      execute: ({ vin }) => {
        const v = findVehicle(vin);
        if (!v) throw new Error(`No bike found with VIN ${vin}. Ask the customer to check it (17 characters, on the steering head or in the app).`);
        return { ...v, region: REGION[v.country] || "EU" };
      },
    },
    {
      name: "check_warranty",
      description: "The ONLY way to decide warranty coverage. Runs the deterministic warranty rules for one component and returns decision (covered, not_covered, needs_human, needs_diagnosis, escalate_safety, offer_replacement), the reasons, the policy clauses and next steps. Pass cause 'unknown' unless the customer's description makes the cause clear.",
      inputSchema: {
        type: "object",
        properties: {
          vin: { type: "string" },
          component: { type: "string", enum: COMPONENTS },
          cause: { type: "string", enum: CAUSES, description: "defect = part failed in normal use; wear = normal wear; crash = fall or impact; pressure_washing = water forced into connectors; unknown = not clear yet" },
          usage: { type: "string", enum: USAGE, description: "How the bike was used when the fault appeared" },
          safety_symptom: { type: "boolean", description: "true for battery smoke, smell, swelling or B30, brake failure or S01, steering or structural failures" },
        },
        required: ["vin", "component", "cause"],
      },
      execute: (input) => checkWarranty({
        vehicle: findVehicle(input.vin),
        component: String(input.component),
        cause: String(input.cause || "unknown"),
        usage: String(input.usage || "unknown"),
        safety_symptom: Boolean(input.safety_symptom),
        asOf: asOf(),
      }),
    },
    {
      name: "check_parts",
      description: "Check stock of a spare part in a region (EU, NA or AU). Returns part number, stock and next restock date. If you know the VIN, pass it and the region is taken from the bike.",
      inputSchema: { type: "object", properties: { part: { type: "string" }, region: { type: "string", enum: ["EU", "NA", "AU"] }, vin: { type: "string" } }, required: ["part"] },
      execute: ({ part, region, vin }) => {
        const q = String(part).toLowerCase();
        const p = parts.find((x) => x.aliases.includes(q) || x.name.toLowerCase() === q)
          || parts.find((x) => x.aliases.some((a) => q.includes(a)))
          || parts.find((x) => x.name.toLowerCase().includes(q) || x.aliases.some((a) => a.includes(q)));
        if (!p) throw new Error(`No part matches "${part}".`);
        const v = vin ? findVehicle(vin) : null;
        const r = region || (v && REGION[v.country]) || "EU";
        const stock = p.stock[r] ?? 0;
        return { part_no: p.part_no, name: p.name, region: r, in_stock: stock, next_restock: stock ? null : (p.next_restock[r] || "unknown"),
          shipping: r === "EU" ? "2-4 working days" : "3-5 working days" };
      },
    },
    {
      name: "log_case",
      description: "Record a request that YOU resolved end to end (question answered, claim approved with a clear rule, replacement offered, inspection booked). Call it once, at the end, with a one-line summary and the resolution.",
      inputSchema: { type: "object", properties: {
        vin: { type: "string" }, category: { type: "string", enum: ["question", "warranty", "parts", "service", "telemetry"] },
        summary: { type: "string" }, resolution: { type: "string" } }, required: ["category", "summary", "resolution"] },
      execute: (c) => {
        const rec = addCase({ status: "Resolved by agent", vin: c.vin || null, category: c.category, summary: c.summary, resolution: c.resolution, priority: "P3" });
        return { case_id: rec.id, status: rec.status };
      },
    },
    {
      name: "escalate_to_human",
      description: "Hand the case to a person on the aftersales team. Required when check_warranty returns needs_human or escalate_safety, for anything safety-critical, for disputes or legal questions, and when you are not sure. Write a summary the human can act on without re-reading the chat.",
      inputSchema: { type: "object", properties: {
        vin: { type: "string" }, category: { type: "string", enum: ["warranty", "safety", "parts", "service", "complaint", "other"] },
        priority: { type: "string", enum: ["P1", "P2", "P3"] }, summary: { type: "string" }, reason: { type: "string" } },
        required: ["category", "priority", "summary", "reason"] },
      execute: (c) => {
        const rec = addCase({ status: "Escalated to human", vin: c.vin || null, category: c.category, summary: c.summary, resolution: c.reason, priority: c.priority });
        return { case_id: rec.id, status: rec.status, message: "A specialist will contact the customer. P1 within 1 hour, P2 within 1 working day, P3 within 3 working days." };
      },
    },
  ];
  return { tools, cases };
}
