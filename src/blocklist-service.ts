// Blocklist service to maintain a list of users to ignore
// Uses Deno KV for persistence across restarts

interface BlockedUser {
  username: string;
  userId?: string;
  reason?: string;
  blockedAt: string;
}

export class BlocklistService {
  private static instance: BlocklistService;
  private blockedUsers: Map<string, BlockedUser> = new Map(); // Key: username (lowercase)
  private blockedUserIds: Set<string> = new Set(); // For user ID blocking
  private kv: Deno.Kv | null = null;
  private initialized = false;

  private constructor() {
    this.initializeKV();
  }

  static getInstance(): BlocklistService {
    if (!BlocklistService.instance) {
      BlocklistService.instance = new BlocklistService();
    }
    return BlocklistService.instance;
  }

  /**
   * Initialize KV store and load existing blocklist
   */
  private async initializeKV(): Promise<void> {
    try {
      this.kv = await Deno.openKv();
      
      // Load existing blocklist from KV
      const result = await this.kv.get(["blocklist"]);
      if (result.value && Array.isArray(result.value)) {
        const blockedUsers = result.value as BlockedUser[];
        for (const user of blockedUsers) {
          this.blockedUsers.set(user.username.toLowerCase(), user);
          if (user.userId) {
            this.blockedUserIds.add(user.userId);
          }
        }
        console.log(`🚫 Loaded ${this.blockedUsers.size} blocked users from KV`);
      }
      
      this.initialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize KV for blocklist:", error);
      // Continue with in-memory only if KV fails
      this.initialized = true;
    }
  }

  /**
   * Ensure KV is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeKV();
    }
  }

  /**
   * Check if a user is blocked (by username or user ID)
   */
  async isBlocked(username: string, userId?: string): Promise<boolean> {
    await this.ensureInitialized();
    
    // Check by username (case insensitive)
    if (this.blockedUsers.has(username.toLowerCase())) {
      return true;
    }
    
    // Check by user ID if provided
    if (userId && this.blockedUserIds.has(userId)) {
      return true;
    }
    
    return false;
  }

  /**
   * Add a user to the blocklist
   */
  async blockUser(username: string, userId?: string, reason?: string): Promise<void> {
    await this.ensureInitialized();
    
    const blockedUser: BlockedUser = {
      username: username.toLowerCase(),
      userId,
      reason,
      blockedAt: new Date().toISOString()
    };
    
    this.blockedUsers.set(username.toLowerCase(), blockedUser);
    if (userId) {
      this.blockedUserIds.add(userId);
    }
    
    // Persist to KV store
    await this.saveToKV();
    
    console.log(`🚫 Blocked user: @${username}${userId ? ` (ID: ${userId})` : ''}${reason ? ` - ${reason}` : ''}`);
  }

  /**
   * Remove a user from the blocklist
   */
  async unblockUser(username: string): Promise<boolean> {
    await this.ensureInitialized();
    
    const key = username.toLowerCase();
    const blockedUser = this.blockedUsers.get(key);
    
    if (blockedUser) {
      this.blockedUsers.delete(key);
      if (blockedUser.userId) {
        this.blockedUserIds.delete(blockedUser.userId);
      }
      
      // Persist to KV store
      await this.saveToKV();
      
      console.log(`✅ Unblocked user: @${username}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get the list of blocked users
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    await this.ensureInitialized();
    return Array.from(this.blockedUsers.values());
  }

  /**
   * Get blocked user details
   */
  async getBlockedUser(username: string): Promise<BlockedUser | null> {
    await this.ensureInitialized();
    return this.blockedUsers.get(username.toLowerCase()) || null;
  }

  /**
   * Save blocklist to KV store
   */
  private async saveToKV(): Promise<void> {
    if (this.kv) {
      try {
        const blockedUsers = Array.from(this.blockedUsers.values());
        await this.kv.set(["blocklist"], blockedUsers);
      } catch (error) {
        console.error("❌ Failed to save blocklist to KV:", error);
      }
    }
  }

  /**
   * Get blocklist statistics
   */
  async getStats(): Promise<{ totalBlocked: number; withUserIds: number }> {
    await this.ensureInitialized();
    
    const withUserIds = Array.from(this.blockedUsers.values()).filter(user => user.userId).length;
    
    return {
      totalBlocked: this.blockedUsers.size,
      withUserIds
    };
  }

  /**
   * Clear the entire blocklist (for admin purposes)
   */
  async clearBlocklist(): Promise<void> {
    await this.ensureInitialized();
    
    this.blockedUsers.clear();
    this.blockedUserIds.clear();
    
    if (this.kv) {
      try {
        await this.kv.delete(["blocklist"]);
      } catch (error) {
        console.error("❌ Failed to clear blocklist from KV:", error);
      }
    }
    
    console.log("🧹 Cleared entire blocklist");
  }
} 