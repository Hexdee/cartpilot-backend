import { logger } from "@/lib/logger";

/**
 * Senior Software Engineer Implementation:
 * A robust spell checker using Levenshtein distance for fuzzy matching.
 * This handles common product typos by comparing user input tokens against 
 * a dictionary of known keywords and product categories.
 */
export class SpellCheckService {
  private static readonly DICTIONARY = [
    "laptop", "iphone", "headphones", "headset", "blender", "airfryer", 
    "playstation", "ps5", "controller", "blender", "headphones", "camera",
    "monitor", "keyboard", "mouse", "chair", "desk", "phone", "tablet"
  ];

  private static readonly DIRECT_MAP: Record<string, string> = {
    "lap5op": "laptop",
    "ipone": "iphone",
    "iphne": "iphone",
    "i-phone": "iphone",
    "hedset": "headset",
    "hedphones": "headphones",
    "ps5": "ps5",
    "ps 5": "ps5",
    "playstation5": "ps5",
  };

  /**
   * Corrects typos in a search query using direct mapping and fuzzy matching.
   * @param query The raw user search query.
   * @returns The corrected query.
   */
  public fixTypos(query: string): string {
    const original = query.toLowerCase().trim();
    if (!original) return query;

    const tokens = original.split(/\s+/);
    const correctedTokens = tokens.map((token) => {
      // 1. Check direct map first (high confidence)
      if (SpellCheckService.DIRECT_MAP[token]) {
        return SpellCheckService.DIRECT_MAP[token];
      }

      // 2. Fuzzy match against dictionary
      let bestMatch = token;
      let minDistance = 2; // Maximum distance allowed for short tokens

      for (const word of SpellCheckService.DICTIONARY) {
        const distance = this.levenshteinDistance(token, word);
        
        // Dynamic threshold based on word length
        const threshold = token.length <= 4 ? 1 : 2;

        if (distance <= threshold && distance < minDistance) {
          minDistance = distance;
          bestMatch = word;
        }
      }

      return bestMatch;
    });

    const corrected = correctedTokens.join(" ");

    if (original !== corrected) {
      logger.info({ original, corrected }, "Search query fuzzy-corrected.");
    }

    return corrected;
  }

  /**
   * Calculates the Levenshtein distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
