// AI-powered intent resolver using OpenRouter
// Classifies natural language input into valid bot commands

export class IntentResolver {
  private apiKey: string | undefined;
  private baseUrl: string;
  private validCommands: string[];
  
  constructor() {
    this.apiKey = Deno.env.get("OPENROUTER_API_KEY");
    this.baseUrl = "https://openrouter.ai/api/v1/chat/completions";
    this.validCommands = ["profile", "grifter?", "save", "help"];
  }

  /**
   * Check if the resolver is configured and ready to use
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Resolve user input to a valid command using AI
   * @param input - The raw command text from the user
   * @returns The resolved command or null if unrecognized
   */
  async resolveIntent(input: string): Promise<string | null> {
    const normalizedInput = input.toLowerCase().trim();
    
    // 1. Try exact match first (free, instant)
    if (this.validCommands.includes(normalizedInput)) {
      console.log(`✅ Exact command match: "${normalizedInput}"`);
      return normalizedInput;
    }

    // 2. Try simple alias matching before hitting the API
    const aliasResult = this.checkAliases(normalizedInput);
    if (aliasResult) {
      console.log(`✅ Alias match: "${normalizedInput}" → "${aliasResult}"`);
      return aliasResult;
    }

    // 3. Use AI to classify intent
    if (!this.apiKey) {
      console.log(`⚠️ OpenRouter API key not configured, cannot resolve intent for: "${input}"`);
      return null;
    }

    try {
      console.log(`🤖 Using AI to resolve intent for: "${input}"`);
      
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ethos.network",
          "X-Title": "Ethos Twitter Agent"
        },
        body: JSON.stringify({
          model: "anthropic/claude-3-haiku",
          messages: [{
            role: "system",
            content: `You are a command classifier for a Twitter bot that checks user reputation on Ethos Network.

Available commands:
- profile: Get someone's Ethos credibility score and reputation info
- grifter?: Check if someone might be a grifter/scammer based on their reputation
- save: Save a tweet permanently onchain as a review (includes "save target @user" to save to a specific person)
- help: Show available commands

Respond with ONLY the single command name that best matches the user's intent, or "unknown" if it doesn't match any command. No explanation, just the command. If user wants to save/store something for or to someone specific, respond with "save".`
          }, {
            role: "user",
            content: input
          }],
          max_tokens: 20,
          temperature: 0
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenRouter API error: ${response.status} ${response.statusText}`);
        console.error(`❌ Error details: ${errorText}`);
        return null;
      }

      const result = await response.json();
      const intent = result.choices?.[0]?.message?.content?.trim().toLowerCase();
      
      console.log(`🤖 AI resolved intent: "${input}" → "${intent}"`);

      // Validate the AI response is a valid command
      if (intent && this.validCommands.includes(intent)) {
        return intent;
      }

      // Handle "grifter" without the question mark
      if (intent === "grifter") {
        return "grifter?";
      }

      console.log(`ℹ️ AI returned unknown/invalid intent: "${intent}"`);
      return null;

    } catch (error) {
      console.error("❌ Error calling OpenRouter API:", error);
      return null;
    }
  }

  /**
   * Check common aliases and typos before using AI
   */
  private checkAliases(input: string): string | null {
    const aliases: Record<string, string> = {
      // grifter? variations
      "grifter": "grifter?",
      "grfiter": "grifter?",
      "griftr": "grifter?",
      "grifter!": "grifter?",
      "scammer": "grifter?",
      "scammer?": "grifter?",
      "scam": "grifter?",
      "legit": "grifter?",
      "legit?": "grifter?",
      
      // profile variations
      "prof": "profile",
      "profle": "profile",
      "prfile": "profile",
      "proile": "profile",
      "check": "profile",
      "score": "profile",
      "rep": "profile",
      "reputation": "profile",
      
      // help variations
      "halp": "help",
      "hlp": "help",
      "commands": "help",
      "?": "help",
      
      // save variations
      "sve": "save",
      "sav": "save",
      "store": "save",
      "record": "save",
      "save this": "save",
      "store this": "save",
      "record this": "save",
    };

    return aliases[input] || null;
  }
}
