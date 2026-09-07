/**
 * chat.store.js
 *
 * It initiates the chat storage module, then extracts the IndexedDB connection, 
 * and then it applies persistence methods for AI conversational history.
 */
import { getDB } from '../analyzer/repository/persistence.store.js';

export const chatStore = {
  /**
   * It evaluates the repository and feature identifiers, then extracts the stored session payload, 
   * and then it applies a fallback array if no history exists.
   */
  async getChat(repoId, feature) {
    if (!repoId || !feature) return [];
    try {
      const db = await getDB();
      const session = await db.get('chatSessions', [repoId, feature]);
      return session?.messages || [];
    } catch (err) {
      console.error('Failed to get chat from IDB:', err);
      return [];
    }
  },

  /**
   * It intercepts the updated message array, then extracts the active database transaction, 
   * and then it applies an upsert operation to the chatSessions store.
   */
  async saveChat(repoId, feature, messages) {
    if (!repoId || !feature) return;
    try {
      const db = await getDB();
      await db.put('chatSessions', {
        repoId,
        feature,
        messages,
        updatedAt: Date.now()
      });
    } catch (err) {
      console.error('Failed to save chat to IDB:', err);
    }
  },

  /**
   * It receives the target session keys, then extracts the database reference, 
   * and then it applies a deletion command to clear the local history.
   */
  async clearChat(repoId, feature) {
    if (!repoId || !feature) return;
    try {
      const db = await getDB();
      await db.delete('chatSessions', [repoId, feature]);
    } catch (err) {
      console.error('Failed to clear chat from IDB:', err);
    }
  }
};