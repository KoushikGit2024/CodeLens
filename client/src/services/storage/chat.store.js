import { getDB } from '../analyzer/repository/persistence.store';

export const chatStore = {
  /**
   * Retrieves a chat session from IndexedDB.
   * @param {string} repoId 
   * @param {string} feature 
   * @returns {Promise<Array>} The messages array, or an empty array if none exists.
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
   * Saves or updates a chat session in IndexedDB.
   * @param {string} repoId 
   * @param {string} feature 
   * @param {Array} messages 
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
   * Deletes a specific chat session from IndexedDB.
   * @param {string} repoId 
   * @param {string} feature 
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

