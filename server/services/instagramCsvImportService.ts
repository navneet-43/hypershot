import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { storage } from '../storage';
import { z } from 'zod';
import { parseISTDateToUTC } from '../utils/timezoneUtils';
import { MediaLinkDetector } from './mediaLinkDetector';

export interface InstagramPostData {
  content: string;
  scheduledFor: string;
  customLabels?: string;
  mediaUrl?: string;
  mediaType?: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  failed: number;
  errors: string[];
  data?: any[];
}

/**
 * Instagram CSV Import Service
 * Handles bulk import of Instagram posts from CSV/Excel files
 */
export class InstagramCsvImportService {
  private static mediaDetector = new MediaLinkDetector();

  private static validatePostData(row: any, rowIndex: number): { isValid: boolean; errors: string[]; data?: InstagramPostData } {
    const errors: string[] = [];
    
    console.log(`Validating Instagram row ${rowIndex + 1}:`, row);
    
    // Handle different possible field names (Excel headers can vary)
    const content = row.content || row.Content || row.CONTENT || '';
    const scheduledFor = row.scheduledFor || row.scheduledfor || row['Scheduled Date'] || row.scheduled_for || '';
    const customLabels = row.customLabels || row.customlabels || row['Custom Labels'] || row.custom_labels || '';
    const mediaUrl = row.mediaUrl || row.mediaurl || row['Media URL'] || row.media_url || '';
    const mediaType = row.mediaType || row.mediatype || row['Media Type'] || row.media_type || '';
    
    console.log(`Extracted Instagram fields for row ${rowIndex + 1}:`, {
      content, scheduledFor, customLabels, mediaUrl, mediaType
    });
    
    // Auto-detect media type if mediaUrl is provided but mediaType is not specified
    let detectedMediaInfo = null;
    if (mediaUrl && !mediaType) {
      detectedMediaInfo = this.mediaDetector.detectMediaLink(mediaUrl);
      console.log(`🔍 Instagram Row ${rowIndex + 1}: Auto-detected media type: ${detectedMediaInfo.type} for URL: ${mediaUrl}`);
    }
    
    // Required fields validation
    if (!content || typeof content !== 'string' || content.trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Content is required`);
    }
    
    if (!scheduledFor || scheduledFor.toString().trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Scheduled date is required. Use format: DD/MM/YYYY HH:MM (e.g., 15/12/2024 14:30)`);
    }
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    // Parse the scheduled date - MUST include both date and time
    let parsedDate: Date;
    const dateStr = scheduledFor.toString().trim();
    
    // Check for DD/MM/YYYY HH:MM format (preferred)
    const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
    if (ddmmyyyyMatch) {
      const [, day, month, year, hours, minutes] = ddmmyyyyMatch.map(Number);
      const istDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      console.log(`Row ${rowIndex + 1}: DD/MM/YYYY format "${dateStr}" -> IST: ${istDateStr}`);
      parsedDate = parseISTDateToUTC(istDateStr, `Row ${rowIndex + 1}`);
    }
    // Check for YYYY-MM-DD HH:MM format
    else if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?$/)) {
      parsedDate = parseISTDateToUTC(dateStr, `Row ${rowIndex + 1}`);
    }
    // Check for DD/MM/YYYY HH:MM AM/PM format
    else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
      const parts = dateStr.split(/\s+/);
      const [datePart, timePart, period] = parts;
      const [day, month, year] = datePart.split('/').map(Number);
      let [hours, minutes] = timePart.split(':').map(Number);
      
      if (period?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
      if (period?.toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      const istDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
      console.log(`Row ${rowIndex + 1}: DD/MM/YYYY AM/PM format "${dateStr}" -> IST: ${istDateStr}`);
      parsedDate = parseISTDateToUTC(istDateStr, `Row ${rowIndex + 1}`);
    }
    // Handle Excel serial number (full date with time)
    else if (typeof scheduledFor === 'number' && scheduledFor > 100) {
      // Full Excel date serial number (days since Jan 1, 1900)
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const excelMillis = scheduledFor * 24 * 60 * 60 * 1000;
      const utcDate = new Date(excelEpoch.getTime() + excelMillis);
      // Excel stores as IST, subtract 5.5 hours to get UTC
      parsedDate = new Date(utcDate.getTime() - (5.5 * 60 * 60 * 1000));
      console.log(`Row ${rowIndex + 1}: Excel serial ${scheduledFor} -> UTC: ${parsedDate.toISOString()}`);
    }
    else {
      // Reject time-only formats - require full date
      errors.push(`Row ${rowIndex + 1}: Invalid date format "${dateStr}". You MUST include both DATE and TIME. Use format: DD/MM/YYYY HH:MM (e.g., 15/12/2024 14:30)`);
      return { isValid: false, errors };
    }
    
    // CRITICAL: Validate that the scheduled time is in the FUTURE
    const now = new Date();
    const minScheduleTime = new Date(now.getTime() + 60 * 1000); // At least 1 minute in future
    
    if (parsedDate <= minScheduleTime) {
      const nowIST = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
      const scheduledIST = parsedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
      errors.push(`Row ${rowIndex + 1}: Scheduled time (${scheduledIST} IST) must be in the FUTURE. Current time is ${nowIST} IST. Please update the date/time.`);
      return { isValid: false, errors };
    }
    
    console.log(`✅ Row ${rowIndex + 1}: Valid future date - IST: ${parsedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}, UTC: ${parsedDate.toISOString()}`);
    
    // Process media URL
    let processedMediaUrl = mediaUrl ? mediaUrl.toString().trim() : undefined;

    // Use detected media type if not provided by user
    let finalMediaType = mediaType ? mediaType.toString().trim() : undefined;
    if (!finalMediaType && detectedMediaInfo && detectedMediaInfo.type !== 'unknown') {
      // For Instagram, map to appropriate types
      if (detectedMediaInfo.type === 'google-drive' && detectedMediaInfo.isVideo) {
        finalMediaType = 'video'; // or 'reel' based on user preference
      } else if (detectedMediaInfo.type === 'google-drive') {
        finalMediaType = 'image';
      }
      console.log(`🤖 Instagram Row ${rowIndex + 1}: Setting auto-detected mediaType: "${finalMediaType}"`);
    }

    const data: InstagramPostData = {
      content: content.trim(),
      scheduledFor: parsedDate.toISOString(),
      customLabels: customLabels ? customLabels.toString().trim() : undefined,
      mediaUrl: processedMediaUrl,
      mediaType: finalMediaType
    };
    
    return { isValid: true, errors: [], data };
  }

  static async analyzeFile(params: { fileBuffer: Buffer; filename: string }): Promise<ImportResult> {
    try {
      const { fileBuffer, filename } = params;
      
      const isCSV = filename.toLowerCase().endsWith('.csv');
      console.log(`📁 Analyzing Instagram file: ${filename} (${isCSV ? 'CSV' : 'Excel'})`);
      
      let posts: any[] = [];
      
      if (isCSV) {
        // Parse CSV file
        const csvText = fileBuffer.toString('utf-8');
        const parseResult = await new Promise<any>((resolve) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.toLowerCase().replace(/\s+/g, ''),
            complete: (results) => resolve(results),
            error: (error: any) => resolve({ errors: [error] })
          });
        });
        
        if (parseResult.errors && parseResult.errors.length > 0) {
          return {
            success: false,
            imported: 0,
            failed: 0,
            errors: parseResult.errors.map((err: any) => err.message)
          };
        }
        
        posts = parseResult.data || [];
      } else {
        // Parse Excel file
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        
        if (!sheetName) {
          return {
            success: false,
            imported: 0,
            failed: 0,
            errors: ['No worksheets found in the Excel file']
          };
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          return {
            success: false,
            imported: 0,
            failed: 0,
            errors: ['File must contain headers and at least one data row']
          };
        }
        
        // Extract headers and convert to objects
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1);
        
        posts = dataRows
          .filter((row: unknown): row is any[] => Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== ''))
          .map((row: any[]) => {
            const obj: any = {};
            headers.forEach((header, index) => {
              if (header && typeof header === 'string') {
                obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
              }
            });
            return obj;
          });
      }
      
      return {
        success: true,
        imported: 0,
        failed: 0,
        errors: [],
        data: posts
      };
    } catch (error) {
      console.error('❌ Instagram file analysis failed:', error);
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error during file analysis']
      };
    }
  }

  static async importFromFile(params: { 
    fileBuffer: Buffer; 
    filename: string; 
    userId: number; 
    accountId: number;
    useAiConverter?: boolean;
  }): Promise<ImportResult> {
    try {
      console.log(`📥 Starting Instagram CSV import for user ${params.userId}, account ${params.accountId}`);
      
      // First analyze the file
      const analysisResult = await this.analyzeFile({
        fileBuffer: params.fileBuffer,
        filename: params.filename
      });
      
      if (!analysisResult.success || !analysisResult.data) {
        return analysisResult;
      }
      
      let posts = analysisResult.data;
      
      // Apply AI conversion if requested
      if (params.useAiConverter && posts.length > 0) {
        console.log('🤖 Applying AI conversion to Instagram CSV...');
        const { OpenAICsvConverter } = await import('./openaiCsvConverter');
        const converter = new OpenAICsvConverter();
        const conversionResult = await converter.convertCsvFormat(posts);
        
        if (conversionResult.success && conversionResult.convertedData) {
          console.log(`✅ AI conversion successful. Detected format: ${conversionResult.originalFormat}`);
          posts = conversionResult.convertedData;
        } else {
          console.warn(`⚠️ AI conversion failed: ${conversionResult.error}. Using original format.`);
        }
      }
      
      // Process the posts
      const errors: string[] = [];
      let imported = 0;
      let failed = 0;
      
      // Get Instagram account details
      const instagramAccount = await storage.getInstagramAccount(params.accountId);
      if (!instagramAccount) {
        return {
          success: false,
          imported: 0,
          failed: posts.length,
          errors: ['Instagram account not found']
        };
      }
      
      console.log(`📝 Processing ${posts.length} Instagram posts...`);
      console.log(`📝 First row data:`, posts[0]);
      
      for (let i = 0; i < posts.length; i++) {
        const row = posts[i];
        console.log(`\n🔍 Processing row ${i + 1}/${posts.length}:`, JSON.stringify(row));
        
        const validation = this.validatePostData(row, i);
        
        if (!validation.isValid || !validation.data) {
          console.log(`❌ Row ${i + 1} validation FAILED:`, validation.errors);
          errors.push(...validation.errors);
          failed++;
          continue;
        }
        console.log(`✅ Row ${i + 1} validation PASSED`);
        
        try {
          const postData = validation.data;
          
          // Create the post in database with platform set to 'instagram'
          const createdPost = await storage.createPost({
            userId: params.userId,
            content: postData.content,
            scheduledFor: new Date(postData.scheduledFor),
            status: 'scheduled',
            platform: 'instagram',
            instagramAccountId: params.accountId, // Use instagramAccountId for Instagram posts
            customLabels: postData.customLabels || null,
            mediaType: postData.mediaType || null,
            mediaUrl: postData.mediaUrl || null
          });
          
          // Schedule the post for precise timing
          const { schedulePostPublication } = await import('./postService');
          schedulePostPublication(createdPost);
          
          imported++;
          console.log(`✅ Instagram post ${i + 1} imported and scheduled for ${new Date(postData.scheduledFor).toISOString()}`);
        } catch (error) {
          const errorMsg = `Row ${i + 1}: ${error instanceof Error ? error.message : 'Failed to create post'}`;
          errors.push(errorMsg);
          failed++;
          console.error(`❌ Failed to import Instagram post ${i + 1}:`, error);
        }
      }
      
      console.log(`📊 Instagram import complete: ${imported} succeeded, ${failed} failed`);
      
      return {
        success: imported > 0,
        imported,
        failed,
        errors
      };
    } catch (error) {
      console.error('❌ Instagram CSV import failed:', error);
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error during Instagram import']
      };
    }
  }
}
