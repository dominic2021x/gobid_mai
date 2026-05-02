/**
 * Utility functions for ANAF processing
 */

export function safeJsonParse(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch {
    // încearcă să extragi doar blocul JSON dintre { }
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonSlice = content.slice(start, end + 1);
      try {
        return JSON.parse(jsonSlice);
      } catch {
        return null;
      }
    }
    return null;
  }
}



