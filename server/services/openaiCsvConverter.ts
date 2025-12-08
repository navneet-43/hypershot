import OpenAI from 'openai';

// OpenAI service for intelligent CSV format conversion
export class OpenAICsvConverter {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for CSV conversion');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Converts any CSV format to the expected SocialFlow format
   */
  async convertCsvFormat(csvData: any[]): Promise<{
    success: boolean;
    convertedData?: any[];
    error?: string;
    originalFormat?: string;
    detectedColumns?: string[];
  }> {
    try {
      if (!csvData || csvData.length === 0) {
        return {
          success: false,
          error: 'No CSV data provided'
        };
      }

      // Get the first few rows for analysis (limit to 3 rows to save tokens)
      const sampleData = csvData.slice(0, Math.min(3, csvData.length));
      const headers = Object.keys(sampleData[0]);
      
      console.log('🤖 OpenAI CSV Converter: Analyzing CSV format...');
      console.log('📊 Sample headers:', headers);
      console.log('📝 Sample data (first row):', sampleData[0]);

      // Create the conversion prompt
      const prompt = this.createConversionPrompt(headers, sampleData);
      
      // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
      const response = await this.openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an expert CSV data converter for social media scheduling. Analyze the provided CSV format and convert it to the required SocialFlow format. Always respond with valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1 // Low temperature for consistent conversion
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      if (!result.columnMapping) {
        return {
          success: false,
          error: 'OpenAI failed to provide column mapping'
        };
      }

      console.log('🎯 OpenAI detected column mapping:', result.columnMapping);
      
      // Apply the conversion to all rows
      const convertedData = this.applyColumnMapping(csvData, result.columnMapping);
      
      return {
        success: true,
        convertedData,
        originalFormat: result.detectedFormat || 'Unknown',
        detectedColumns: headers
      };

    } catch (error) {
      console.error('❌ OpenAI CSV Converter error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during conversion'
      };
    }
  }

  private createConversionPrompt(headers: string[], sampleData: any[]): string {
    return `
Analyze this CSV data and convert it to SocialFlow format.

REQUIRED OUTPUT FORMAT (JSON):
{
  "columnMapping": {
    "content": "detected_content_column_name",
    "scheduledFor": "detected_date_column_name", 
    "accountName": "detected_account_column_name_or_null",
    "customLabels": "detected_labels_column_name_or_null",
    "language": "detected_language_column_name_or_null",
    "mediaUrl": "detected_media_url_column_name_or_null",
    "mediaType": "detected_media_type_column_name_or_null"
  },
  "detectedFormat": "brief_description_of_original_format",
  "confidence": "high|medium|low"
}

TARGET SOCIALFLOW COLUMNS:
- content (REQUIRED): Post text, caption, message, description
- scheduledFor (REQUIRED): Date/time to publish (any date/time column)
- accountName (optional): Facebook page, account name, social account
- customLabels (optional): Tags, labels, categories, hashtags
- language (optional): Language code, locale
- mediaUrl (optional): Media link, image URL, video URL, attachment
- mediaType (optional): Media type (post, image, video, reel)

CSV HEADERS: ${JSON.stringify(headers)}

SAMPLE DATA: ${JSON.stringify(sampleData, null, 2)}

Rules:
1. Map to the most appropriate SocialFlow column
2. Set null for columns that don't exist in source
3. "content" and "scheduledFor" are mandatory - if not found, mark confidence as "low"
4. Look for common variations (e.g., "post_text", "message", "caption" all map to "content")
5. Date columns might be named "date", "publish_time", "scheduled_date", etc.
6. Account columns might be "page", "account", "social_account", etc.
`;
  }

  private applyColumnMapping(csvData: any[], columnMapping: any): any[] {
    return csvData.map((row, index) => {
      const convertedRow: any = {};
      
      // Apply each mapping
      for (const [targetColumn, sourceColumn] of Object.entries(columnMapping)) {
        if (sourceColumn && sourceColumn !== 'null' && row[sourceColumn as string] !== undefined) {
          convertedRow[targetColumn] = row[sourceColumn as string];
        }
      }
      
      // Ensure required fields have some value
      if (!convertedRow.content) {
        convertedRow.content = `Imported post ${index + 1}`;
      }
      
      if (!convertedRow.scheduledFor) {
        // Set to 1 hour from now as fallback
        const oneHourFromNow = new Date();
        oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
        convertedRow.scheduledFor = oneHourFromNow.toISOString().slice(0, 16).replace('T', ' ');
      }
      
      // Set default language if not provided
      if (!convertedRow.language) {
        convertedRow.language = 'EN';
      }
      
      return convertedRow;
    });
  }

  /**
   * Analyzes CSV headers to suggest if AI conversion would be beneficial
   */
  async shouldUseAiConversion(headers: string[]): Promise<{
    recommended: boolean;
    reason: string;
    confidence: number;
  }> {
    const standardHeaders = ['content', 'scheduledFor', 'accountName', 'customLabels', 'language', 'mediaUrl', 'mediaType'];
    const lowercaseHeaders = headers.map(h => h.toLowerCase());
    const standardMatches = standardHeaders.filter(sh => 
      lowercaseHeaders.some(h => h.includes(sh.toLowerCase()))
    );
    
    const matchRatio = standardMatches.length / standardHeaders.length;
    
    if (matchRatio >= 0.7) {
      return {
        recommended: false,
        reason: 'CSV format appears to already match SocialFlow format',
        confidence: matchRatio
      };
    }
    
    if (matchRatio >= 0.3) {
      return {
        recommended: true,
        reason: 'CSV format partially matches - AI conversion recommended for better compatibility',
        confidence: matchRatio
      };
    }
    
    return {
      recommended: true,
      reason: 'CSV format appears to be different - AI conversion highly recommended',
      confidence: matchRatio
    };
  }
}