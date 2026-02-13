// AskService — LLM agent orchestrator for natural language questions
// Two-step flow: PLAN (LLM picks CLI commands) → EXECUTE → SYNTHESIZE (LLM writes tweet)

import { EthosCliService } from "./ethos-cli-service.ts";
import type { CliCommandRequest } from "./ethos-cli-service.ts";

export interface AskResult {
  isEthosQuestion: boolean;
  replyText?: string;
  followUpText?: string;
  error?: string;
}

interface PlanStep {
  command: string;
  args: string[];
  purpose: string;
}

interface PlanResponse {
  isEthosQuestion: boolean;
  commands: PlanStep[];
  reasoning?: string;
}

interface SynthesisResponse {
  replyText: string;
  followUpText: string | null;
}

// Full SKILL.md from @trust-ethos/cli — embedded to avoid file I/O on Deno Deploy
const ETHOS_CLI_REFERENCE = `# Ethos CLI

Read-only CLI for querying Ethos Network reputation data.

## User Identification

All commands accept flexible identifiers:

| Format           | Example                                      |
|------------------|----------------------------------------------|
| Twitter username | sethgho, 0xNowater                           |
| ETH address      | 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045   |
| ENS name         | vitalik.eth                                  |

## Commands

### User
ethos user info <user>          # Profile with score level
ethos user summary <user>       # Profile + activity + vouches
ethos user activity <user>      # Recent reviews/vouches
ethos user search <query>       # Find users
ethos user invitations <user>   # Invitations sent

### Vouches
ethos vouch list <user>         # Vouches received
ethos vouch list --author <user> # Vouches given
ethos vouch info <id>           # Vouch details
ethos vouch mutual <u1> <u2>   # Mutual vouchers
ethos vouch votes <id>          # Votes on vouch

### Reviews
ethos review list <user>        # Reviews for user
ethos review info <id>          # Review details
ethos review votes <id>         # Votes on review

### Slashes
ethos slash list                # All slashes
ethos slash info <id>           # Slash details
ethos slash votes <id>          # Votes on slash

### XP
ethos xp rank <user>            # Leaderboard position
ethos xp rank <user> --season 2 # Specific season
ethos xp seasons                # List seasons

### Trust Markets
ethos market list               # All markets
ethos market info <user>        # User's market
ethos market holders <user>     # Trust/distrust holders
ethos market featured           # Top gainers/losers

### Projects/Listings
ethos listing list              # Active listings
ethos listing info <id>         # Project details
ethos listing voters <id>       # Bullish/bearish voters

### Broker Posts
ethos broker list               # All posts
ethos broker list --type hire   # Filter: sell|buy|hire|for-hire|bounty
ethos broker info <id>          # Post details

### Validators & Auctions
ethos validator list            # All validators
ethos validator info <tokenId>  # Validator details
ethos validator sales           # For sale on OpenSea
ethos auction list              # All auctions
ethos auction active            # Current auction
ethos auction info <id>         # Auction details

## Global Flags

All commands support:
- --json / -j    -- JSON output
- --limit / -l   -- Results limit (default: 10)
- --offset / -o  -- Pagination offset

## Score Levels

| Range      | Level        |
|------------|--------------|
| < 800      | UNTRUSTED    |
| 800-1199   | QUESTIONABLE |
| 1200-1599  | NEUTRAL      |
| 1600-1999  | REPUTABLE    |
| 2000+      | EXEMPLARY    |
`;

export class AskService {
  private apiKey: string | undefined;
  private baseUrl: string;
  private cliService: EthosCliService;

  constructor(cliService: EthosCliService) {
    this.apiKey = Deno.env.get("OPENROUTER_API_KEY");
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    this.cliService = cliService;
  }

  /**
   * Main entry point: understand a question, query the CLI, and synthesize a tweet-length answer
   */
  async handleQuestion(
    questionText: string,
    mentionedUsernames: string[],
    tweetAuthor: string,
    replyToUser?: string,
  ): Promise<AskResult> {
    if (!this.apiKey) {
      console.error("❌ AskService: OPENROUTER_API_KEY not configured");
      return {
        isEthosQuestion: false,
        error: "llm_not_configured",
        replyText:
          "I'm having trouble understanding that. Try @ethosAgent help.",
      };
    }

    // Step 1: PLAN — ask LLM which CLI commands to run
    let plan: PlanResponse;
    try {
      plan = await this.planCommands(
        questionText,
        mentionedUsernames,
        tweetAuthor,
        replyToUser,
      );
    } catch (error) {
      console.error("❌ AskService planning failed:", error);
      return {
        isEthosQuestion: true,
        error: "planning_failed",
        replyText:
          "I'm having trouble understanding that. Try @ethosAgent help.",
      };
    }

    if (!plan.isEthosQuestion) {
      return {
        isEthosQuestion: false,
        replyText:
          "I can only answer questions about Ethos reputation data. Try @ethosAgent help.",
      };
    }

    if (plan.commands.length === 0) {
      return {
        isEthosQuestion: true,
        replyText:
          "I couldn't figure out which data to look up for that question. Try being more specific, like \"what's @user's Ethos score?\"",
      };
    }

    // Step 2: EXECUTE — run the planned CLI commands
    const cliRequests: CliCommandRequest[] = plan.commands.map((cmd) => ({
      command: cmd.command,
      args: cmd.args,
      purpose: cmd.purpose,
    }));

    const cliResults = await this.cliService.executeMultipleCommands(
      cliRequests,
    );

    // Check for critical failures
    const allFailed = cliResults.every((r) => !r.success);
    if (allFailed) {
      const firstError = cliResults[0]?.error || "unknown";
      if (firstError === "cli_not_found") {
        return {
          isEthosQuestion: true,
          error: "cli_not_found",
          replyText: "I'm having trouble looking that up. Try again later.",
        };
      }
      if (firstError === "timeout") {
        return {
          isEthosQuestion: true,
          error: "timeout",
          replyText: "That query is taking too long. Try a simpler question.",
        };
      }
      return {
        isEthosQuestion: true,
        error: "cli_failed",
        replyText: "I'm having trouble looking that up. Try again later.",
      };
    }

    // Step 3: SYNTHESIZE — ask LLM to compose a tweet from the results
    try {
      const synthesis = await this.synthesizeAnswer(
        questionText,
        plan,
        cliResults.map((r) => ({
          success: r.success,
          data: r.data,
          rawOutput: r.rawOutput,
          error: r.error,
        })),
      );

      return {
        isEthosQuestion: true,
        replyText: synthesis.replyText,
        followUpText: synthesis.followUpText || undefined,
      };
    } catch (error) {
      console.error("❌ AskService synthesis failed:", error);

      // Fallback: truncate raw CLI data to 270 chars
      const rawFallback = cliResults
        .filter((r) => r.success)
        .map((r) => r.rawOutput)
        .join("\n");
      const truncated = rawFallback.length > 270
        ? rawFallback.substring(0, 267) + "..."
        : rawFallback;

      return {
        isEthosQuestion: true,
        replyText: truncated ||
          "I found some data but had trouble formatting it. Try again later.",
      };
    }
  }

  /**
   * Step 1: Ask LLM to plan which CLI commands to run
   */
  private async planCommands(
    question: string,
    mentionedUsernames: string[],
    tweetAuthor: string,
    replyToUser?: string,
  ): Promise<PlanResponse> {
    const contextParts: string[] = [];
    if (mentionedUsernames.length > 0) {
      contextParts.push(
        `Mentioned usernames: ${mentionedUsernames.join(", ")}`,
      );
    }
    contextParts.push(`Tweet author: ${tweetAuthor}`);
    if (replyToUser) {
      contextParts.push(
        `This tweet is replying to: ${replyToUser} (if the question is about "this person" or "them", it refers to ${replyToUser})`,
      );
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ethos.network",
        "X-Title": "Ethos Twitter Agent",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content:
              `You are a planning assistant for an Ethos Network Twitter bot. Given a user's question, decide which Ethos CLI commands to run to answer it.

${ETHOS_CLI_REFERENCE}

RULES:
- If the question is NOT about Ethos reputation data (scores, vouches, reviews, slashes, XP, markets, listings, broker posts, validators, auctions), set isEthosQuestion to false.
- Output 1-3 CLI commands max.
- Use Twitter usernames without the @ symbol as user identifiers.
- If the question refers to "this person" or "them" and a replyToUser is provided, use that username.
- Do NOT include --json in args — it is added automatically.
- Respond with ONLY valid JSON, no markdown or explanation.

JSON format:
{
  "isEthosQuestion": true/false,
  "commands": [
    { "command": "user info", "args": ["username"], "purpose": "Get profile score" }
  ],
  "reasoning": "brief explanation"
}`,
          },
          {
            role: "user",
            content: `Question: "${question}"\n${contextParts.join("\n")}`,
          },
        ],
        max_tokens: 300,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter API error: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Empty response from planning LLM");
    }

    // Parse JSON — strip markdown code fences if present
    const cleaned = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as PlanResponse;

    console.log(
      `🧠 AskService plan: isEthosQuestion=${parsed.isEthosQuestion}, commands=${
        parsed.commands?.length || 0
      }`,
    );

    return {
      isEthosQuestion: !!parsed.isEthosQuestion,
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      reasoning: parsed.reasoning,
    };
  }

  /**
   * Step 3: Ask LLM to synthesize CLI results into a tweet-length answer
   */
  private async synthesizeAnswer(
    question: string,
    plan: PlanResponse,
    results: Array<{
      success: boolean;
      data: unknown;
      rawOutput: string;
      error?: string;
    }>,
  ): Promise<SynthesisResponse> {
    // Build results summary, truncating each to 2000 chars
    const resultSummaries = results.map((r, i) => {
      const cmd = plan.commands[i];
      const label = cmd
        ? `Command: ethos ${cmd.command} ${cmd.args.join(" ")} (${cmd.purpose})`
        : `Command ${i + 1}`;

      if (!r.success) {
        return `${label}\nError: ${r.error || "failed"}`;
      }

      const output = r.data ? JSON.stringify(r.data, null, 2) : r.rawOutput;
      const truncated = output.length > 2000
        ? output.substring(0, 2000) + "\n... (truncated)"
        : output;
      return `${label}\nResult:\n${truncated}`;
    });

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ethos.network",
        "X-Title": "Ethos Twitter Agent",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-haiku",
        messages: [
          {
            role: "system",
            content:
              `You are the Ethos Network Twitter bot. Synthesize CLI query results into a concise tweet reply.

RULES:
- replyText MUST be ≤ 270 characters (this is critical — tweets have character limits)
- Be factual and concise. Only state what the data shows.
- If data shows a user wasn't found, say so clearly.
- Include Ethos profile links when relevant: https://app.ethos.network/profile/{username}
- If there's additional detail worth sharing, put it in followUpText (also ≤ 270 chars). Otherwise set followUpText to null.
- Respond with ONLY valid JSON, no markdown or explanation.

JSON format:
{
  "replyText": "the main answer tweet",
  "followUpText": "optional follow-up tweet or null"
}`,
          },
          {
            role: "user",
            content: `Original question: "${question}"\n\nPlan reasoning: ${
              plan.reasoning || "N/A"
            }\n\nResults:\n${resultSummaries.join("\n\n")}`,
          },
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenRouter synthesis error: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Empty response from synthesis LLM");
    }

    const cleaned = content.replace(/^```json?\s*/, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as SynthesisResponse;

    // Enforce character limits
    let replyText = parsed.replyText ||
      "I found some data but couldn't format a response.";
    if (replyText.length > 270) {
      replyText = replyText.substring(0, 267) + "...";
    }

    let followUpText = parsed.followUpText || null;
    if (followUpText && followUpText.length > 270) {
      followUpText = followUpText.substring(0, 267) + "...";
    }

    return { replyText, followUpText };
  }
}
