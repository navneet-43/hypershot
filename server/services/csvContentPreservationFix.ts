/**
 * CSV Content Preservation Fix
 * Ensures original content from CSV imports is preserved during Facebook video uploads
 * instead of being replaced with generic titles like "Enhanced Google Drive Video"
 */

export class CSVContentPreservationFix {
  /**
   * Ensures video processing services use the original CSV content instead of generic titles
   */
  static preserveOriginalContent(
    originalContent: string | undefined,
    fallbackDescription: string
  ): string {
    // If we have original content from CSV, use it
    if (originalContent && originalContent.trim().length > 0 && 
        originalContent.trim() !== 'Enhanced Google Drive Video' &&
        originalContent.trim() !== 'YouTube video upload' &&
        originalContent.trim() !== 'Local video upload') {
      return originalContent.trim();
    }
    
    // Only use fallback if no original content exists
    return fallbackDescription;
  }

  /**
   * Check if content appears to be a generic placeholder that should be replaced
   */
  static isGenericPlaceholder(content: string): boolean {
    const genericTitles = [
      'Enhanced Google Drive Video',
      'YouTube video upload',
      'Local video upload',
      'Video content',
      'Large Video Quality Preserved',
      'Large Video Chunked Upload'
    ];
    
    return genericTitles.some(title => 
      content.toLowerCase().includes(title.toLowerCase())
    );
  }

  /**
   * Extract meaningful content from what might be a mix of original and generic content
   */
  static extractOriginalContent(content: string): string {
    // If the content contains generic prefixes, try to extract the meaningful part
    const patterns = [
      /^(Enhanced Google Drive Video[:\-\s]*)(.*)/i,
      /^(YouTube video upload[:\-\s]*)(.*)/i,
      /^(Local video upload[:\-\s]*)(.*)/i,
      /^(Video content[:\-\s]*)(.*)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[2] && match[2].trim().length > 0) {
        return match[2].trim();
      }
    }

    return content;
  }
}