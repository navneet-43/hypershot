import { storage } from '../storage';
import { schedulePostPublication } from './postService';

interface ImportParams {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  range: string;
  userId: number;
  accountId: number;
}

interface ImportResult {
  success: boolean;
  postsCreated?: number;
  error?: string;
}

interface SheetRow {
  [key: string]: string;
}

/**
 * Google Sheets Service for importing content
 */
export class GoogleSheetsService {
  
  /**
   * Import posts from Google Sheets
   */
  static async importFromSheet(params: ImportParams): Promise<ImportResult> {
    try {
      console.log(`📊 Starting Google Sheets import from ${params.spreadsheetId}`);
      
      // Fetch data from Google Sheets API
      const sheetData = await this.fetchSheetData(
        params.accessToken,
        params.spreadsheetId,
        params.sheetName,
        params.range
      );
      
      if (!sheetData || sheetData.length === 0) {
        return {
          success: false,
          error: 'No data found in the specified sheet range'
        };
      }
      
      // Parse and create posts
      const postsCreated = await this.createPostsFromData(
        sheetData,
        params.userId,
        params.accountId
      );
      
      console.log(`✅ Successfully imported ${postsCreated} posts from Google Sheets`);
      
      return {
        success: true,
        postsCreated
      };
      
    } catch (error) {
      console.error('Error importing from Google Sheets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
  
  /**
   * Fetch data from Google Sheets using the Sheets API
   */
  private static async fetchSheetData(
    accessToken: string,
    spreadsheetId: string,
    sheetName: string,
    range: string
  ): Promise<SheetRow[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}!${range}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Google Sheets API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.values || data.values.length === 0) {
      return [];
    }
    
    // Convert rows to objects using first row as headers
    const headers = data.values[0];
    const rows = data.values.slice(1);
    
    return rows.map((row: string[]) => {
      const rowObject: SheetRow = {};
      headers.forEach((header: string, index: number) => {
        rowObject[header] = row[index] || '';
      });
      return rowObject;
    });
  }
  
  /**
   * Create posts from sheet data
   */
  private static async createPostsFromData(
    data: SheetRow[],
    userId: number,
    accountId: number
  ): Promise<number> {
    let postsCreated = 0;
    
    for (const row of data) {
      try {
        // Skip empty rows
        if (!row.Content && !row.content) {
          continue;
        }
        
        // Extract post data from row
        const postData = this.extractPostData(row, userId, accountId);
        
        if (postData.content) {
          // Create the post
          const post = await storage.createPost(postData);
          
          // If scheduled, set up the scheduling job
          if (post.status === 'scheduled' && post.scheduledFor) {
            schedulePostPublication(post);
          }
          
          postsCreated++;
          console.log(`📝 Created post ${post.id}: ${postData.content.substring(0, 50)}...`);
        }
        
      } catch (error) {
        console.error('Error creating post from row:', error);
        // Continue with other rows even if one fails
      }
    }
    
    return postsCreated;
  }
  
  /**
   * Extract post data from a sheet row
   */
  private static extractPostData(row: SheetRow, userId: number, accountId: number) {
    // Support multiple column name variations
    const content = row.Content || row.content || row.MESSAGE || row.message || '';
    const mediaUrl = row.MediaURL || row.mediaUrl || row.MEDIA_URL || row.media_url || 
                    row.ImageURL || row.imageUrl || row.IMAGE_URL || row.image_url || '';
    const mediaType = row.MediaType || row.mediaType || row.MEDIA_TYPE || row.media_type || 'none';
    const link = row.Link || row.link || row.URL || row.url || '';
    const language = row.Language || row.language || row.LANGUAGE || 'en';
    const scheduledFor = row.ScheduledFor || row.scheduledFor || row.SCHEDULED_FOR || 
                        row.scheduled_for || row.Date || row.date || row.DATE || '';
    const labels = row.Labels || row.labels || row.LABELS || row.Tags || row.tags || row.TAGS || '';
    
    // Parse labels (comma-separated)
    const parsedLabels = labels ? labels.split(',').map(l => l.trim()).filter(l => l) : [];
    
    // Parse scheduled date
    let parsedScheduledDate: Date | undefined;
    let status = 'draft';
    
    if (scheduledFor) {
      try {
        parsedScheduledDate = new Date(scheduledFor);
        // Check if the date is valid and in the future
        if (parsedScheduledDate && !isNaN(parsedScheduledDate.getTime())) {
          if (parsedScheduledDate > new Date()) {
            status = 'scheduled';
          } else {
            status = 'draft'; // Past dates become drafts
          }
        }
      } catch (error) {
        console.warn('Invalid date format in sheet:', scheduledFor);
      }
    }
    
    // Determine media type from URL if not specified
    let finalMediaType = mediaType;
    if (mediaUrl && finalMediaType === 'none') {
      if (mediaUrl.includes('drive.google.com')) {
        // Assume photo for Google Drive links unless specified
        finalMediaType = 'photo';
      }
    }
    
    return {
      userId,
      accountId,
      content,
      mediaUrl: mediaUrl || null,
      mediaType: finalMediaType,
      link: link || null,
      language,
      labels: parsedLabels,
      scheduledFor: parsedScheduledDate,
      status,
      sheetRowId: null,
      errorMessage: null
    };
  }
  
  /**
   * Test Google Sheets connection
   */
  static async testConnection(accessToken: string, spreadsheetId: string): Promise<boolean> {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      return response.ok;
    } catch (error) {
      console.error('Google Sheets connection test failed:', error);
      return false;
    }
  }
  
  /**
   * Get spreadsheet metadata
   */
  static async getSpreadsheetInfo(accessToken: string, spreadsheetId: string) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch spreadsheet info: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        title: data.properties.title,
        sheets: data.sheets.map((sheet: any) => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
          rowCount: sheet.properties.gridProperties.rowCount,
          columnCount: sheet.properties.gridProperties.columnCount
        }))
      };
    } catch (error) {
      console.error('Error fetching spreadsheet info:', error);
      throw error;
    }
  }
}