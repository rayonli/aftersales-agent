// Agent loop for Node, using the Claude API (Messages API with tool use).
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.ARC_MODEL || "claude-sonnet-5-5";

export async function runTurn({ client = new Anthropic(), system, tools, messages, onTool = () => {}, maxRounds = 8 }) {
  const apiTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const trace = [];

  for (let round = 0; round < maxRounds; round++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 1024, system, tools: apiTools, messages });
    messages.push({ role: "assistant", content: res.content });

    const calls = res.content.filter((b) => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text, trace };
    }

    const results = [];
    for (const call of calls) {
      let output, isError = false;
      try {
        const tool = byName[call.name];
        if (!tool) throw new Error(`Unknown tool ${call.name}`);
        output = await tool.execute(call.input || {});
      } catch (e) {
        output = `Error: ${e.message}`;
        isError = true;
      }
      trace.push({ tool: call.name, input: call.input, output, isError });
      onTool(call.name, call.input, output, isError);
      results.push({ type: "tool_result", tool_use_id: call.id, content: typeof output === "string" ? output : JSON.stringify(output), is_error: isError });
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "(Stopped: too many tool rounds. Escalating is the safe option.)", trace };
}
