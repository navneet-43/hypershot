/**
 * Facebook Custom Labels Validator
 * Handles Facebook's strict username validation for custom labels
 */

export class CustomLabelValidator {
  /**
   * Validates and transforms custom labels to avoid Facebook's username restrictions
   * @param labels Array of custom label strings
   * @returns Array of validated and safe custom labels
   */
  static validateAndTransformLabels(labels: string[]): string[] {
    if (!labels || labels.length === 0) {
      return [];
    }

    const validatedLabels = labels
      .map(label => label.toString().trim())
      .map(label => {
        // Basic validation
        if (label.length === 0 || label.length > 25) {
          console.warn(`⚠️ CUSTOM LABEL FILTERED: "${label}" - length invalid (max 25 chars)`);
          return false;
        }
        
        // Avoid username-like patterns that Facebook rejects
        const lowerLabel = label.toLowerCase();
        
        // Comprehensive list of patterns Facebook considers as usernames
        const restrictedPatterns = [
          /^label\d+$/,           // label1, label2, etc.
          /^user\d*$/,            // user, user1, user2, etc.
          /^admin\d*$/,           // admin, admin1, etc.
          /^test\d*$/,            // test, test1, etc.
          /^@/,                   // Starting with @
          /^[a-z]+\d+$/,          // Single word + numbers (username pattern)
          /^(facebook|meta|instagram|whatsapp)$/i,  // Platform names
          /^(promotion|sale|offer|deal|discount|buy|sell|shop|store|product|service|business|company|brand)$/i,  // Commercial terms
          /^(hello|hi|hey|welcome|thanks|thank|please|yes|no|ok|okay)$/i,  // Common words
          /^[a-z]{1,8}$/,         // Very short single words (likely to be usernames)
          /^(di|l3m|campaign|marketing|ad|ads|content|post|social|media)$/i  // More specific terms that Facebook rejects
        ];
        
        const isRestricted = restrictedPatterns.some(pattern => pattern.test(lowerLabel));
        if (isRestricted) {
          console.warn(`⚠️ CUSTOM LABEL FILTERED: "${label}" matches restricted pattern, using prefixed version`);
          
          // Instead of filtering out, create a prefixed version that's less likely to be rejected
          const prefixedLabel = `tag_${label}`;
          if (prefixedLabel.length <= 25) {
            console.log(`✅ CUSTOM LABEL CONVERTED: "${label}" → "${prefixedLabel}"`);
            return prefixedLabel;
          } else {
            // Try shorter prefix
            const shortPrefixedLabel = `t_${label}`;
            if (shortPrefixedLabel.length <= 25) {
              console.log(`✅ CUSTOM LABEL CONVERTED: "${label}" → "${shortPrefixedLabel}"`);
              return shortPrefixedLabel;
            } else {
              console.warn(`⚠️ CUSTOM LABEL FILTERED: "${label}" - prefixed version too long, skipping`);
              return false;
            }
          }
        }
        
        return label; // Return original label if not restricted
      })
      .filter((label): label is string => label !== false && typeof label === 'string') // Remove filtered labels
      .slice(0, 10); // Facebook limit: max 10 labels per post

    if (validatedLabels.length > 0) {
      console.log(`✅ META INSIGHTS: Validated ${validatedLabels.length} custom labels:`, validatedLabels);
    } else {
      console.log('⚠️ META INSIGHTS: All custom labels were filtered out due to Facebook restrictions');
    }

    return validatedLabels;
  }

  /**
   * Creates the Facebook API parameter for custom labels
   * @param labels Array of validated custom labels
   * @returns JSON string for Facebook custom_labels parameter
   */
  static createFacebookParameter(labels: string[]): string | null {
    const validatedLabels = this.validateAndTransformLabels(labels);
    
    if (validatedLabels.length === 0) {
      return null;
    }

    return JSON.stringify(validatedLabels);
  }
}