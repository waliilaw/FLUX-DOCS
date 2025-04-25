#!/usr/bin/env node
import { createSigner, message, spawn, result } from "@permaweb/aoconnect";
import fs from "node:fs";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Helper function to clean and standardize output
function cleanOutput(result: any): string {
  if (!result) return "";

  return JSON.stringify(result, null, 2)
    .replace(/\\u001b\[\d+m/g, "")
    .replace(/\\n/g, "\n");
}

// Create an MCP server
const server = new McpServer({
  name: "ao-mcp",
  version: "1.0.0",
});

const wallet = JSON.parse(
  fs.readFileSync("/Users/asrvd/dev/web3/ao-mcp/keyfile.json", "utf8")
);
const signer = createSigner(wallet);

// Add an addition tool
server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}));

server.tool(
  "spawn",
  {
    tags: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
    needsSqlite: z.boolean().optional(),
  },
  async ({ tags, needsSqlite }) => {
    const processId = await spawn({
      module: needsSqlite
        ? "33d-3X8mpv6xYBlVB-eXMrPfH5Kzf6Hiwhcv0UA10sw"
        : "JArYBF-D8q2OmZ4Mok00sD2Y_6SYEQ7Hjx-6VZ_jl3g",
      signer,
      scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
      tags,
    });
    return {
      content: [{ type: "text", text: processId }],
    };
  }
);

server.tool(
  "send-message-to-process",
  {
    processId: z.string(),
    data: z.string(),
    tags: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  },
  async ({ processId, data, tags }) => {
    const messageId = await message({
      process: processId,
      signer,
      data,
      tags,
    });
    await sleep(100);
    const output = await result({
      message: messageId,
      process: processId,
    });

    if (output.Error) {
      return {
        content: [{ type: "text", text: cleanOutput(output.Error) }],
      };
    }

    return {
      content: [{ type: "text", text: cleanOutput(output.Messages[0].Data) }],
    };
  }
);

async function installPackage(packageName: string, processId: string) {
  const code = `apm.install("${packageName}")`;
  const result = await runLuaCode(code, processId);
  return result;
}

server.tool(
  "apm-install",
  { packageName: z.string(), processId: z.string() },
  async ({ packageName, processId }) => {
    const result = await installPackage(packageName, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result) }],
    };
  }
);

server.tool(
  "create-sqlite-based-handler",
  { processId: z.string(), handlerCode: z.string() },
  async ({ processId, handlerCode }) => {
    const code = `local sqlite = require('lsqlite3')\nDb = sqlite.open_memory()\n${handlerCode}`;
    const result = await runLuaCode(code, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result) }],
    };
  }
);

server.tool(
  "transaction",
  { transactionId: z.string() },
  async ({ transactionId }) => {
    try {
      const metadataResponse = await fetch(
        `https://arweave.net/tx/${transactionId}`
      );
      const metadata = await metadataResponse.json();

      const dataResponse = await fetch(
        `https://arweave.net/raw/${transactionId}`
      );
      const data = await dataResponse.text();

      const transactionInfo = {
        id: metadata.id,
        owner: metadata.owner,
        recipient: metadata.target,
        quantity: metadata.quantity,
        fee: metadata.reward,
        data_size: metadata.data_size,
        data: data.substring(0, 1000),
        tags: metadata.tags || [],
      };

      return {
        content: [{ type: "text", text: cleanOutput(transactionInfo) }],
      };
    } catch (error: any) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLuaCode(
  code: string,
  processId: string,
  tags?: { name: string; value: string }[]
) {
  const messageId = await message({
    process: processId,
    signer,
    data: code,
    tags: [{ name: "Action", value: "Eval" }, ...(tags || [])],
  });

  await sleep(100);

  const outputResult = await result({
    message: messageId,
    process: processId,
  });

  if (outputResult.Error) {
    return JSON.stringify(outputResult.Error);
  }

  return JSON.stringify(outputResult.Output.data);
}

async function fetchBlueprintCode(url: string) {
  const response = await fetch(url);
  const code = await response.text();
  return code;
}

async function listHandlers(processId: string) {
  const messageId = await message({
    process: processId,
    signer,
    data: `
      local handlers = Handlers.list
      local result = {}
      for i, handler in ipairs(handlers) do
        table.insert(result, {
          name = handler.name,
          type = type(handler.pattern),
        })
      end
      return result
    `,
    tags: [{ name: "Action", value: "Eval" }],
  });
  const outputResult = await result({
    message: messageId,
    process: processId,
  });
  if (outputResult.Error) {
    return outputResult.Error;
  }
  return outputResult.Output.data;
}

async function addHandler(processId: string, handlerCode: string) {
  const messageId = await message({
    process: processId,
    signer,
    data: handlerCode,
    tags: [{ name: "Action", value: "Eval" }],
  });

  await sleep(100);

  const outputResult = await result({
    message: messageId,
    process: processId,
  });

  return outputResult.Output
    ? outputResult.Output.data
    : outputResult.Messages[0].Data;
}

async function runHandler(
  processId: string,
  handlerName: string,
  data: string
) {
  const messageId = await message({
    process: processId,
    signer,
    data,
    tags: [{ name: "Action", value: handlerName }],
  });

  await sleep(100);

  const outputResult = await result({
    message: messageId,
    process: processId,
  });

  return outputResult;
}

server.tool(
  "run-lua-in-process",
  {
    code: z.string(),
    processId: z.string(),
    tags: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  },
  async ({ code, processId, tags }) => {
    const result = await runLuaCode(code, processId, tags);
    return {
      content: [
        {
          type: "text",
          text: cleanOutput(result),
        },
      ],
    };
  }
);

server.tool(
  "load-blueprint",
  { url: z.string(), processId: z.string() },
  async ({ url, processId }) => {
    const code = await fetchBlueprintCode(url);
    const result = await runLuaCode(code, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result) }],
    };
  }
);

async function addBlueprint(blueprintName: string, processId: string) {
  const url = `https://raw.githubusercontent.com/permaweb/aos/refs/heads/main/blueprints/${blueprintName}.lua`;
  const code = await fetchBlueprintCode(url);
  const result = await runLuaCode(code, processId);
  return result;
}

server.tool(
  "load-official-blueprint",
  { blueprintName: z.string(), processId: z.string() },
  async ({ blueprintName, processId }) => {
    const result = await addBlueprint(blueprintName, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result) }],
    };
  }
);

server.tool(
  "list-available-handlers",
  { processId: z.string() },
  async ({ processId }) => {
    const handlers = await listHandlers(processId);
    return {
      content: [{ type: "text", text: cleanOutput(handlers) }],
    };
  }
);

server.tool(
  "create-handler",
  { processId: z.string(), handlerCode: z.string() },
  async ({ processId, handlerCode }) => {
    const result = await addHandler(processId, handlerCode);
    return {
      content: [{ type: "text", text: cleanOutput(result) }],
    };
  }
);

server.tool(
  "run-handler-using-handler-name",
  { processId: z.string(), handlerName: z.string(), data: z.string() },
  async ({ processId, handlerName, data }) => {
    const result = await runHandler(processId, handlerName, data);
    if (result.Error) {
      return {
        content: [{ type: "text", text: cleanOutput(result.Error) }],
      };
    }
    return {
      content: [{ type: "text", text: cleanOutput(result.Messages[0].Data) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
