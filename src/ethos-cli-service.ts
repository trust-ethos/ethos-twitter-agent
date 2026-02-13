// Ethos CLI execution layer
// Wraps @trust-ethos/cli via Deno.Command to run CLI commands and capture JSON output

export interface CliCommandRequest {
  command: string; // e.g. "user info"
  args: string[]; // e.g. ["vitalik.eth"]
  purpose?: string; // description for logging
}

export interface CliCommandResult {
  success: boolean;
  data: unknown | null;
  rawOutput: string;
  error?: string;
}

export class EthosCliService {
  private timeout: number;

  constructor() {
    this.timeout = parseInt(Deno.env.get("ETHOS_CLI_TIMEOUT") || "15000", 10);
  }

  /**
   * Run a single CLI command with --json flag and parse the output
   */
  async executeCommand(request: CliCommandRequest): Promise<CliCommandResult> {
    const { command, args, purpose } = request;

    // Build the full command: ethos <command parts> <args> --json
    const commandParts = command.split(/\s+/);
    const fullArgs = [...commandParts, ...args, "--json"];

    console.log(
      `🔧 Ethos CLI: ethos ${fullArgs.join(" ")}${
        purpose ? ` (${purpose})` : ""
      }`,
    );

    try {
      const proc = new Deno.Command("ethos", {
        args: fullArgs,
        stdout: "piped",
        stderr: "piped",
      });

      const child = proc.spawn();

      // Apply timeout
      const result = await Promise.race([
        child.output(),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            try {
              child.kill();
            } catch { /* already exited */ }
            reject(new Error(`CLI command timed out after ${this.timeout}ms`));
          }, this.timeout)
        ),
      ]);

      const stdout = new TextDecoder().decode(result.stdout);
      const stderr = new TextDecoder().decode(result.stderr);

      if (!result.success) {
        console.error(
          `❌ Ethos CLI error (exit ${result.code}): ${stderr || stdout}`,
        );
        return {
          success: false,
          data: null,
          rawOutput: stdout || stderr,
          error: stderr || `CLI exited with code ${result.code}`,
        };
      }

      // Try to parse JSON output
      try {
        const data = JSON.parse(stdout);
        return { success: true, data, rawOutput: stdout };
      } catch {
        // JSON parse failed — return raw output
        console.log(`⚠️ Ethos CLI returned non-JSON output, using raw text`);
        return { success: true, data: null, rawOutput: stdout };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("timed out")) {
        console.error(`⏱️ Ethos CLI timeout: ethos ${fullArgs.join(" ")}`);
        return { success: false, data: null, rawOutput: "", error: "timeout" };
      }

      // Binary not found or other spawn error
      console.error(`❌ Ethos CLI spawn error:`, message);
      return {
        success: false,
        data: null,
        rawOutput: "",
        error: message.includes("NotFound") || message.includes("ENOENT")
          ? "cli_not_found"
          : message,
      };
    }
  }

  /**
   * Run multiple CLI commands in parallel (max 3)
   */
  async executeMultipleCommands(
    requests: CliCommandRequest[],
  ): Promise<CliCommandResult[]> {
    const limited = requests.slice(0, 3);
    return await Promise.all(limited.map((r) => this.executeCommand(r)));
  }
}
