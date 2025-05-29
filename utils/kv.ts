import type { ValidationRecord, ValidationStats } from "../types.ts";

class KVService {
  private kv: Deno.Kv | null = null;

  async init(): Promise<void> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
  }

  async getRecentValidations(limit = 50): Promise<ValidationRecord[]> {
    await this.init();
    if (!this.kv) throw new Error("KV not initialized");

    const validations: ValidationRecord[] = [];
    
    // Get validations sorted by timestamp (newest first)
    const iter = this.kv.list({ prefix: ["validation"] }, { 
      limit,
      reverse: true 
    });
    
    for await (const entry of iter) {
      validations.push(entry.value as ValidationRecord);
    }
    
    // Sort by timestamp in memory as backup
    return validations.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async getValidationStats(): Promise<ValidationStats> {
    await this.init();
    if (!this.kv) throw new Error("KV not initialized");

    // Count total validations
    let totalValidations = 0;
    const iter = this.kv.list({ prefix: ["validation"] });
    
    for await (const _ of iter) {
      totalValidations++;
    }

    return {
      totalValidations,
      lastUpdated: new Date().toISOString()
    };
  }

  async storeValidation(validation: ValidationRecord): Promise<void> {
    await this.init();
    if (!this.kv) throw new Error("KV not initialized");

    // Store the validation
    await this.kv.set(["validation", validation.id], validation);
    
    // Also store in time-sorted index for efficient querying
    await this.kv.set(
      ["validations_by_time", validation.timestamp, validation.id], 
      validation.id
    );
  }
}

export const kvService = new KVService(); 