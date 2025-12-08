import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { storage } from '../storage';
import { insertPostSchema, insertActivitySchema } from '@shared/schema';
import { z } from 'zod';
import { YouTubeHelper } from './youtubeHelper';
import { VideoProcessor } from './videoProcessor';
import { MediaLinkDetector } from './mediaLinkDetector';
import { parseISTDateToUTC } from '../utils/timezoneUtils';

export interface ExcelPostData {
  content: string;
  scheduledFor: string;
  accountName?: string;
  customLabels?: string;
  language?: string;
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

export interface AnalysisResult {
  success: boolean;
  data?: any[];
  error?: string;
  details?: string;
  googleDriveVideos?: number;
  regularVideos?: number;
  estimatedSizes?: string[];
}

export class ExcelImportService {
  private static mediaDetector = new MediaLinkDetector();

  private static validatePostData(row: any, rowIndex: number): { isValid: boolean; errors: string[]; data?: ExcelPostData } {
    const errors: string[] = [];
    
    console.log(`Validating row ${rowIndex + 1}:`, row);
    
    // Handle different possible field names (Excel headers can vary)
    const content = row.content || row.Content || row.CONTENT || '';
    const scheduledFor = row.scheduledFor || row.scheduledfor || row['Scheduled Date'] || row.scheduled_for || '';
    const accountName = row.accountName || row.accountname || row['Account Name'] || row.account_name || '';
    const customLabels = row.customLabels || row.customlabels || row['Custom Labels'] || row.custom_labels || '';
    const language = row.language || row.Language || row.LANGUAGE || 'EN';
    const mediaUrl = row.mediaUrl || row.mediaurl || row['Media URL'] || row.media_url || '';
    const mediaType = row.mediaType || row.mediatype || row['Media Type'] || row.media_type || '';
    
    console.log(`Extracted fields for row ${rowIndex + 1}:`, {
      content, scheduledFor, accountName, customLabels, language, mediaUrl, mediaType
    });
    
    // Auto-detect media type if mediaUrl is provided but mediaType is not specified
    let detectedMediaInfo = null;
    if (mediaUrl && !mediaType) {
      detectedMediaInfo = this.mediaDetector.detectMediaLink(mediaUrl);
      console.log(`🔍 Row ${rowIndex + 1}: Auto-detected media type: ${detectedMediaInfo.type} for URL: ${mediaUrl}`);
    }
    
    // Log mediaType specifically for debugging
    if (mediaType) {
      console.log(`📝 Row ${rowIndex + 1}: User specified mediaType: "${mediaType}" (will be preserved)`);
    } else if (detectedMediaInfo && detectedMediaInfo.type !== 'unknown') {
      console.log(`🤖 Row ${rowIndex + 1}: Auto-detected mediaType: "${detectedMediaInfo.type}-${detectedMediaInfo.isVideo ? 'video' : 'file'}"`);
    }
    
    // Required fields validation
    if (!content || typeof content !== 'string' || content.trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Content is required`);
    }
    
    if (!scheduledFor || scheduledFor.toString().trim() === '') {
      errors.push(`Row ${rowIndex + 1}: Scheduled date is required`);
    } else {
      // Validate date format - be more flexible with date parsing
      let date: Date;
      if (typeof scheduledFor === 'number') {
        // Excel serial date number - handle time-only values (< 1) vs full dates
        if (scheduledFor < 1) {
          // Time-only value - use today's date
          const today = new Date();
          const totalSeconds = scheduledFor * 24 * 60 * 60;
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        } else if (scheduledFor < 100) {
          // Small value - use today's date with the time component
          const today = new Date();
          const fractionalDay = scheduledFor % 1;
          const totalSeconds = fractionalDay * 24 * 60 * 60;
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        } else {
          // Full Excel date serial number
          date = new Date((scheduledFor - 25569) * 86400 * 1000);
        }
      } else {
        const dateStr = scheduledFor.toString().trim();
        
        // Handle different date/time formats
        if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) {
          // Format: "2:30 PM" - time only, use today's date
          const today = new Date();
          const timeStr = dateStr.toUpperCase();
          let [time, period] = timeStr.split(/\s+/);
          let [hours, minutes] = time.split(':').map(Number);
          
          if (period === 'PM' && hours !== 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?$/)) {
          // Format: "2024-07-24 14:30" or "2024-07-24 14:30:00"
          const [datePart, timePart] = dateStr.split(' ');
          const [year, month, day] = datePart.split('-').map(Number);
          const timeParts = timePart.split(':').map(Number);
          const [hours, minutes, seconds = 0] = timeParts;
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else if (dateStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
          // Format: "7/24/2024 2:30 PM", "07/24/2024 14:30", or "28/07/2025  15:05:00 PM"
          const parts = dateStr.split(/\s+/).filter((p: string) => p.length > 0); // Remove extra spaces
          const [datePart, timePart, period] = parts;
          const dateParts = datePart.split('/').map(Number);
          const timeParts = timePart.split(':').map(Number);
          let [hours, minutes, seconds = 0] = timeParts;
          
          // Fix invalid 24-hour format with AM/PM (like "15:05:00 PM")
          if (period && hours > 12) {
            // If hour is >12 and has AM/PM, treat as 24-hour format and ignore AM/PM
            console.log(`Row ${rowIndex + 1}: Invalid format "${timePart} ${period}" - treating as 24-hour format`);
          } else {
            // Apply AM/PM logic only for valid 12-hour format
            if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
            if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }
          
          // Determine if it's DD/MM/YYYY or MM/DD/YYYY format
          let month, day, year;
          if (dateParts[0] > 12) {
            // First number > 12, must be DD/MM/YYYY
            [day, month, year] = dateParts;
          } else if (dateParts[1] > 12) {
            // Second number > 12, must be MM/DD/YYYY
            [month, day, year] = dateParts;
          } else {
            // Ambiguous case, default to DD/MM/YYYY for international format
            [day, month, year] = dateParts;
          }
          
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else if (dateStr.match(/^\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i)) {
          // Format: "7-24-2024 2:30 PM" or "07-24-2024 14:30"
          const parts = dateStr.split(/\s+/);
          const [datePart, timePart, period] = parts;
          const [month, day, year] = datePart.split('-').map(Number);
          const timeParts = timePart.split(':').map(Number);
          let [hours, minutes, seconds = 0] = timeParts;
          
          if (period && period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
          if (period && period.toUpperCase() === 'AM' && hours === 12) hours = 0;
          
          date = new Date(year, month - 1, day, hours, minutes, seconds);
        } else {
          // Try standard Date parsing as fallback
          date = new Date(dateStr);
        }
      }
      
      if (isNaN(date.getTime())) {
        const displayValue = typeof scheduledFor === 'string' ? scheduledFor : String(scheduledFor);
        errors.push(`Row ${rowIndex + 1}: Invalid date format for scheduledFor. Use format: DD/MM/YYYY HH:MM (e.g., "15/12/2024 14:30"). Your value: "${displayValue}"`);
      }
    }
    
    if (errors.length > 0) {
      return { isValid: false, errors };
    }
    
    // Convert IST time from Excel to UTC - NO double conversion!
    let parsedDate: Date;
    if (typeof scheduledFor === 'number') {
      // Excel serial date number - REJECT time-only values
      // IMPORTANT: Excel times are in IST, so we need to convert to UTC directly
      
      if (scheduledFor < 1) {
        // This is a time-only value - REJECT it
        const totalSeconds = scheduledFor * 24 * 60 * 60;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        errors.push(`Row ${rowIndex + 1}: Time-only value detected (${hours}:${String(minutes).padStart(2, '0')}). You MUST include both DATE and TIME. Use format: DD/MM/YYYY HH:MM (e.g., 15/12/2024 14:30)`);
        return { isValid: false, errors };
        
      } else if (scheduledFor < 100) {
        // Small number - REJECT, likely a time-only or invalid value
        errors.push(`Row ${rowIndex + 1}: Invalid date value detected. You MUST include both DATE and TIME. Use format: DD/MM/YYYY HH:MM (e.g., 15/12/2024 14:30)`);
        return { isValid: false, errors };
        
      } else {
        // Full Excel date serial number (days since Jan 1, 1900)
        // Excel stores as LOCAL time (IST), convert to UTC
        const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Excel epoch
        const excelMillis = scheduledFor * 24 * 60 * 60 * 1000;
        const utcDate = new Date(excelEpoch.getTime() + excelMillis);
        
        // This date is in UTC but represents IST time, so subtract 5.5 hours
        parsedDate = new Date(utcDate.getTime() - (5.5 * 60 * 60 * 1000));
        console.log(`Row ${rowIndex + 1}: Full Excel serial ${scheduledFor} -> UTC: ${parsedDate.toISOString()}`);
      }
    } else {
      // Use unified timezone conversion for all string date formats
      const dateStr = scheduledFor.toString().trim();
      
      // Reject time-only formats - require full date
      if (dateStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)?$/i)) {
        errors.push(`Row ${rowIndex + 1}: Time-only format "${dateStr}" is not allowed. You MUST include both DATE and TIME. Use format: DD/MM/YYYY HH:MM (e.g., 15/12/2024 14:30)`);
        return { isValid: false, errors };
      }
      
      parsedDate = parseISTDateToUTC(dateStr, `Row ${rowIndex + 1}`);
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
    
    // Process Google Drive links to convert to direct download format
    let processedMediaUrl = mediaUrl ? mediaUrl.toString().trim() : undefined;
    if (processedMediaUrl && processedMediaUrl.includes('drive.google.com')) {
      console.log(`Converting Google Drive link: ${processedMediaUrl}`);
      processedMediaUrl = ExcelImportService.convertGoogleDriveLink(processedMediaUrl);
      console.log(`Converted to: ${processedMediaUrl}`);
    }

    // Use detected media type if not provided by user
    let finalMediaType = mediaType ? mediaType.toString().trim() : undefined;
    if (!finalMediaType && detectedMediaInfo && detectedMediaInfo.type !== 'unknown') {
      finalMediaType = `${detectedMediaInfo.type}-${detectedMediaInfo.isVideo ? 'video' : 'file'}`;
      console.log(`🤖 Row ${rowIndex + 1}: Setting auto-detected mediaType: "${finalMediaType}"`);
    }

    const data: ExcelPostData = {
      content: content.trim(),
      scheduledFor: scheduledFor.toString(),
      accountName: accountName.toString().trim(),
      customLabels: customLabels.toString().trim(),
      language: language.toString().trim() || 'EN',
      mediaUrl: processedMediaUrl,
      mediaType: finalMediaType
    };
    
    return { isValid: true, errors: [], data };
  }

  // Analysis method for CSV preview functionality
  static async analyzeExcelFile(params: { fileBuffer: Buffer; filename: string }): Promise<AnalysisResult> {
    try {
      console.log('🔍 analyzeExcelFile method called');
      
      if (!params) {
        console.error('No parameters provided to analyzeExcelFile');
        return {
          success: false,
          error: 'No parameters provided',
          details: 'The analyzeExcelFile method requires fileBuffer and filename parameters'
        };
      }
      
      const { fileBuffer, filename } = params;
      
      if (!fileBuffer) {
        console.error('No fileBuffer provided');
        return {
          success: false,
          error: 'No file buffer provided',
          details: 'File buffer is required for analysis'
        };
      }
      
      if (!filename) {
        console.error('No filename provided');
        return {
          success: false,
          error: 'No filename provided',
          details: 'Filename is required for analysis'
        };
      }
      
      const isCSV = filename.toLowerCase().endsWith('.csv');
      console.log(`📁 Analyzing file: ${filename} (${isCSV ? 'CSV' : 'Excel'}), size: ${fileBuffer.length} bytes`);
      
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
            error: 'CSV parsing failed',
            details: parseResult.errors.map((err: any) => err.message).join(', ')
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
            error: 'No worksheets found in the Excel file'
          };
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length < 2) {
          return {
            success: false,
            error: 'File must contain headers and at least one data row'
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
      
      // Analyze posts for media types and other statistics
      let googleDriveVideos = 0;
      let facebookVideos = 0;
      let regularVideos = 0;
      const estimatedSizes: string[] = [];
      
      // Enhanced analysis with automatic media detection
      posts.forEach((post: any, index: number) => {
        const mediaUrl = post.mediaurl || post.mediaUrl || post['media url'] || post['Media URL'] || '';
        const mediaType = post.mediatype || post.mediaType || post['media type'] || post['Media Type'] || '';
        
        if (mediaUrl && typeof mediaUrl === 'string') {
          // Auto-detect media type using MediaLinkDetector
          const detectedMediaInfo = this.mediaDetector.detectMediaLink(mediaUrl);
          
          // Add detected media type to the post for preview
          if (!mediaType && detectedMediaInfo.type !== 'unknown') {
            post.detectedMediaType = `${detectedMediaInfo.type}-${detectedMediaInfo.isVideo ? 'video' : 'file'}`;
          }
          
          // Count by detected type
          if (detectedMediaInfo.type === 'google-drive') {
            googleDriveVideos++;
            estimatedSizes.push(`Row ${index + 1}: Google Drive ${detectedMediaInfo.isVideo ? 'video' : 'file'} (auto-detected)`);
          } else if (detectedMediaInfo.type === 'facebook') {
            facebookVideos++;
            estimatedSizes.push(`Row ${index + 1}: Facebook video (auto-detected - will be downloaded)`);
          } else if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') || 
                     mediaUrl.includes('vimeo.com') || mediaUrl.includes('dropbox.com')) {
            regularVideos++;
            estimatedSizes.push(`Row ${index + 1}: External video`);
          }
        } else {
          // Check for Facebook videos manually if detection didn't catch it
          if (mediaUrl.includes('facebook.com') && mediaUrl.includes('/videos/')) {
            facebookVideos++;
            estimatedSizes.push(`Row ${index + 1}: Facebook video (manual detection - will be downloaded)`);
          }
        }
      });
      
      console.log(`✅ Analysis complete: ${posts.length} posts, ${googleDriveVideos} Google Drive, ${facebookVideos} Facebook videos, ${regularVideos} other videos`);
      
      return {
        success: true,
        data: posts,
        googleDriveVideos,
        regularVideos: regularVideos + facebookVideos, // Include Facebook videos in regular count for compatibility
        estimatedSizes
      };
      
    } catch (error) {
      console.error('Analysis error:', error);
      return {
        success: false,
        error: 'File analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  static async parseExcelFile(fileBuffer: Buffer, userId: number, accountId?: number, useAiConverter: boolean = false): Promise<ImportResult> {
    try {
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
          errors: ['Excel file must contain headers and at least one data row']
        };
      }
      
      // Extract headers and convert to objects
      const headers = jsonData[0] as string[];
      const dataRows = jsonData.slice(1);
      
      console.log('Excel parsing - Headers:', headers);
      console.log('Excel parsing - DataRows type:', typeof dataRows, 'isArray:', Array.isArray(dataRows));
      console.log('Excel parsing - DataRows length:', dataRows?.length);
      
      if (!Array.isArray(dataRows)) {
        return {
          success: false,
          imported: 0,
          failed: 0,
          errors: ['Invalid Excel data format - expected array of rows']
        };
      }
      
      const posts = dataRows
        .filter((row: unknown): row is any[] => Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== ''))
        .map((row: any[], rowIndex: number) => {
          const obj: any = {};
          headers.forEach((header, index) => {
            if (header && typeof header === 'string') {
              obj[header.toLowerCase().replace(/\s+/g, '')] = row[index];
            }
          });
          console.log(`Row ${rowIndex + 1} parsed:`, obj);
          return obj;
        });
      
      return await this.processPostsData(posts, userId, accountId, useAiConverter);
    } catch (error) {
      console.error('Excel parsing error:', error);
      return {
        success: false,
        imported: 0,
        failed: 0,
        errors: [`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
  
  static async parseCSVFile(fileBuffer: Buffer, userId: number, accountId?: number, useAiConverter: boolean = false): Promise<ImportResult> {
    return new Promise((resolve) => {
      const csvText = fileBuffer.toString('utf-8');
      
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.toLowerCase().replace(/\s+/g, ''),
        complete: async (results) => {
          if (results.errors.length > 0) {
            resolve({
              success: false,
              imported: 0,
              failed: 0,
              errors: results.errors.map(err => `CSV parsing error: ${err.message}`)
            });
            return;
          }
          
          const result = await this.processPostsData(results.data, userId, accountId, useAiConverter);
          resolve(result);
        },
        error: (error: any) => {
          resolve({
            success: false,
            imported: 0,
            failed: 0,
            errors: [`Failed to parse CSV file: ${error.message}`]
          });
        }
      });
    });
  }
  
  private static async processPostsData(posts: any[], userId: number, accountId?: number, useAiConverter: boolean = false): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let failed = 0;
    
    // Apply AI conversion if requested
    if (useAiConverter && posts.length > 0) {
      try {
        const { OpenAICsvConverter } = await import('./openaiCsvConverter');
        const converter = new OpenAICsvConverter();
        
        console.log('🤖 Applying AI conversion during import...');
        const conversionResult = await converter.convertCsvFormat(posts);
        
        if (conversionResult.success && conversionResult.convertedData) {
          console.log('✅ AI conversion successful during import');
          posts = conversionResult.convertedData;
        } else {
          console.log('⚠️ AI conversion failed during import, using original data:', conversionResult.error);
          // Continue with original data
        }
      } catch (aiError) {
        console.error('❌ AI conversion error during import:', aiError);
        // Continue with original data
      }
    }
    
    // Get user's Facebook accounts
    const userAccounts = await storage.getFacebookAccounts(userId);
    console.log('User accounts:', userAccounts);
    const accountMap = new Map(Array.isArray(userAccounts) ? userAccounts.map((acc: any) => [acc.name.toLowerCase(), acc]) : []);
    
    // Get user's custom labels
    const userLabels = await storage.getCustomLabels(userId);
    console.log('User labels:', userLabels);
    const labelMap = new Map(Array.isArray(userLabels) ? userLabels.map((label: any) => [label.name.toLowerCase(), label]) : []);
    
    for (let i = 0; i < posts.length; i++) {
      const validation = this.validatePostData(posts[i], i);
      
      if (!validation.isValid) {
        errors.push(...validation.errors);
        failed++;
        continue;
      }
      
      const postData = validation.data!;
      
      try {
        // Use the selected account ID from frontend, or find account by name if accountId not provided
        let finalAccountId = accountId;
        
        if (!finalAccountId) {
          // Fallback to old behavior for backward compatibility
          if (postData.accountName && postData.accountName.trim() !== '') {
            const account = accountMap.get(postData.accountName.toLowerCase());
            if (account) {
              finalAccountId = account.id;
            } else {
              // Try partial matching
              const partialMatch = userAccounts.find((acc: any) => 
                acc.name.toLowerCase().includes(postData.accountName!.toLowerCase()) ||
                postData.accountName!.toLowerCase().includes(acc.name.toLowerCase())
              );
              
              if (partialMatch) {
                finalAccountId = partialMatch.id;
                console.log(`Row ${i + 1}: Using partial match "${partialMatch.name}" for "${postData.accountName!}"`);
              } else if (userAccounts.length > 0) {
                // Use first available account as fallback
                finalAccountId = userAccounts[0].id;
                console.log(`Row ${i + 1}: Account "${postData.accountName!}" not found, using default account "${userAccounts[0].name}"`);
              } else {
                errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
                failed++;
                continue;
              }
            }
          } else if (userAccounts.length > 0) {
            // Use first available account if no account specified
            finalAccountId = userAccounts[0].id;
          } else {
            errors.push(`Row ${i + 1}: No Facebook accounts available. Please connect a Facebook account first.`);
            failed++;
            continue;
          }
        }
        
        // Process custom labels - store as label names for Meta Insights
        const labelNames: string[] = [];
        if (postData.customLabels && typeof postData.customLabels === 'string' && postData.customLabels.trim().length > 0) {
          const rawLabels = postData.customLabels.split(',').map(name => name.trim()).filter(name => name.length > 0);
          labelNames.push(...rawLabels);
          console.log(`Row ${i + 1}: Processing custom labels for Meta Insights:`, rawLabels);
        }
        
        // Process YouTube videos during import - download and prepare for Facebook upload
        let processedMediaUrl = postData.mediaUrl;
        let processedMediaType = postData.mediaType;
        
        if (postData.mediaUrl && YouTubeHelper.isYouTubeUrl(postData.mediaUrl)) {
          console.log(`🎥 Row ${i + 1}: Processing YouTube video for Excel import: ${postData.mediaUrl}`);
          
          try {
            // Use the video processor to handle YouTube download
            const videoResult = await VideoProcessor.processVideo(postData.mediaUrl);
            
            if (videoResult.success && videoResult.processedUrl) {
              console.log(`✅ Row ${i + 1}: YouTube video processed successfully`);
              processedMediaUrl = videoResult.processedUrl;
              // Preserve user's mediaType for YouTube videos (could be 'reel' for YouTube Shorts)
              processedMediaType = postData.mediaType || 'video';
              
              // Add cleanup function to the post metadata for later cleanup
              if (videoResult.cleanup) {
                // Store cleanup info in metadata for scheduled cleanup
                console.log(`📋 Row ${i + 1}: Video file will be cleaned up after Facebook upload`);
              }
            } else {
              console.log(`❌ Row ${i + 1}: YouTube video processing failed: ${videoResult.error}`);
              errors.push(`Row ${i + 1}: YouTube video processing failed: ${videoResult.error || 'Unknown video processing error'}`);
              failed++;
              continue;
            }
          } catch (videoError) {
            console.error(`Row ${i + 1}: Video processing error:`, videoError);
            errors.push(`Row ${i + 1}: Failed to process YouTube video: ${videoError instanceof Error ? videoError.message : 'Unknown error'}`);
            failed++;
            continue;
          }
        } else if (postData.mediaUrl && postData.mediaUrl.includes('facebook.com') && postData.mediaUrl.includes('/videos/')) {
          console.log(`📱 Row ${i + 1}: Facebook video detected for Excel import: ${postData.mediaUrl}`);
          
          try {
            // Download Facebook video first before creating the post
            const { FacebookVideoDownloader } = await import('./facebookVideoDownloader');
            const downloadResult = await FacebookVideoDownloader.downloadVideo(postData.mediaUrl);
            
            if (downloadResult.success && downloadResult.filePath) {
              console.log(`✅ Row ${i + 1}: Facebook video downloaded successfully: ${downloadResult.filename}`);
              processedMediaUrl = downloadResult.filePath;
              processedMediaType = postData.mediaType || 'facebook-video';
              
              console.log(`🎬 Row ${i + 1}: Facebook video ready for upload - File: ${downloadResult.filename}`);
            } else {
              console.log(`❌ Row ${i + 1}: Facebook video download failed: ${downloadResult.error}`);
              errors.push(`Row ${i + 1}: Facebook video download failed: ${downloadResult.error || 'Unknown download error'}`);
              failed++;
              continue;
            }
          } catch (fbError) {
            console.error(`Row ${i + 1}: Facebook video processing error:`, fbError);
            errors.push(`Row ${i + 1}: Failed to process Facebook video: ${fbError instanceof Error ? fbError.message : 'Unknown error'}`);
            failed++;
            continue;
          }
        } else if (postData.mediaUrl && (postData.mediaUrl.includes('drive.google.com') || postData.mediaUrl.includes('docs.google.com'))) {
          console.log(`🔄 Row ${i + 1}: Google Drive media detected for Excel import: ${postData.mediaUrl}`);
          console.log(`📝 Row ${i + 1}: User specified mediaType: ${postData.mediaType || 'auto-detect'}`);
          
          // For Google Drive media, preserve the user's specified mediaType
          // If no mediaType specified, default to 'video' for backward compatibility
          processedMediaUrl = postData.mediaUrl;
          processedMediaType = postData.mediaType || 'video';
          
          console.log(`✅ Row ${i + 1}: Google Drive media URL preserved with mediaType: ${processedMediaType}`);
        }
        
        // Parse date and convert from IST to UTC using unified timezone conversion
        const scheduledDate = parseISTDateToUTC(postData.scheduledFor, `Processing post ${i + 1}`);
        
        // Retry logic for database operations to handle connection issues
        let newPost;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
          try {
            newPost = await storage.createPost({
              content: postData.content,
              scheduledFor: scheduledDate,
              userId: userId,
              accountId: finalAccountId,
              status: 'scheduled',
              language: postData.language || 'EN',
              mediaUrl: processedMediaUrl,
              mediaType: processedMediaType,
              labels: labelNames  // Store custom labels for Meta Insights
            });
            break; // Success, exit retry loop
          } catch (dbError: any) {
            retryCount++;
            console.warn(`Row ${i + 1}: Database operation attempt ${retryCount} failed:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              throw new Error(`Database operation failed after ${maxRetries} attempts: ${dbError.message}`);
            }
            
            // Wait before retry (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
        
        // Log import activity with retry logic
        const isYouTubeVideo = postData.mediaUrl && YouTubeHelper.isYouTubeUrl(postData.mediaUrl);
        const isFacebookVideo = postData.mediaUrl && postData.mediaUrl.includes('facebook.com') && postData.mediaUrl.includes('/videos/');
        
        let activityDescription;
        if (isYouTubeVideo) {
          activityDescription = `Post imported from Excel/CSV with YouTube video: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`;
        } else if (isFacebookVideo) {
          activityDescription = `Post imported from Excel/CSV with Facebook video: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`;
        } else {
          activityDescription = `Post imported from Excel/CSV: "${postData.content.substring(0, 50)}${postData.content.length > 50 ? '...' : ''}"`;
        }
        retryCount = 0;
        while (retryCount < maxRetries) {
          try {
            await storage.createActivity({
              userId: userId,
              type: 'bulk_import',
              description: activityDescription,
              metadata: {
                postId: newPost!.id,
                source: 'excel_csv_import',
                scheduledFor: postData.scheduledFor,
                account: postData.accountName,
                labels: postData.customLabels,
                language: postData.language || 'EN',
                mediaType: processedMediaType || 'none',
                originalMediaUrl: postData.mediaUrl,
                processedMediaUrl: processedMediaUrl,
                youtubeProcessed: isYouTubeVideo
              }
            });
            break; // Success, exit retry loop
          } catch (dbError: any) {
            retryCount++;
            console.warn(`Row ${i + 1}: Activity logging attempt ${retryCount} failed:`, dbError.message);
            
            if (retryCount >= maxRetries) {
              console.error(`Activity logging failed after ${maxRetries} attempts, continuing without activity log`);
              break; // Don't fail the entire import for activity logging
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          }
        }
        
        imported++;
      } catch (error) {
        console.error('Error creating post:', error);
        errors.push(`Row ${i + 1}: Failed to create post - ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed++;
      }
    }
    
    // Create summary activity with retry logic
    let summaryRetryCount = 0;
    const maxSummaryRetries = 3;
    
    while (summaryRetryCount < maxSummaryRetries) {
      try {
        await storage.createActivity({
          userId: userId,
          type: 'bulk_import_summary',
          description: `Bulk import completed: ${imported} posts imported, ${failed} failed`,
          metadata: {
            imported,
            failed,
            errors: errors.length,
            source: 'excel_csv_import'
          }
        });
        break; // Success, exit retry loop
      } catch (dbError: any) {
        summaryRetryCount++;
        console.warn(`Summary activity creation attempt ${summaryRetryCount} failed:`, dbError.message);
        
        if (summaryRetryCount >= maxSummaryRetries) {
          console.error(`Summary activity creation failed after ${maxSummaryRetries} attempts, continuing without summary log`);
          break; // Don't fail the entire import for summary logging
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, summaryRetryCount) * 1000));
      }
    }
    
    return {
      success: imported > 0,
      imported,
      failed,
      errors,
      data: posts
    };
  }
  
  static convertGoogleDriveLink(url: string): string {
    try {
      // Extract file ID from various Google Drive URL formats
      let fileId = '';
      
      if (url.includes('/file/d/')) {
        // Format: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      } else if (url.includes('id=')) {
        // Format: https://drive.google.com/open?id=FILE_ID
        const match = url.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) fileId = match[1];
      }
      
      if (fileId) {
        // Convert to direct download link
        return `https://drive.google.com/uc?export=download&id=${fileId}`;
      }
      
      return url; // Return original if couldn't parse
    } catch (error) {
      console.error('Error converting Google Drive link:', error);
      return url;
    }
  }

  static generateTemplate(): Buffer {
    // Generate example dates that are in the future
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    
    // Format dates as DD/MM/YYYY HH:MM in IST
    const formatDateIST = (date: Date, hours: number, minutes: number): string => {
      const d = new Date(date);
      d.setHours(hours, minutes, 0, 0);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const h = String(hours).padStart(2, '0');
      const m = String(minutes).padStart(2, '0');
      return `${day}/${month}/${year} ${h}:${m}`;
    };
    
    const templateData = [
      {
        content: 'Your post content here - this is the text that will be published',
        scheduledFor: formatDateIST(tomorrow, 14, 30), // Tomorrow at 2:30 PM
        customLabels: 'label1, label2',
        language: 'EN',
        mediaUrl: 'https://drive.google.com/file/d/1ABC123/view?usp=sharing',
        mediaType: 'image'
      },
      {
        content: 'Another example post with different scheduling',
        scheduledFor: formatDateIST(tomorrow, 10, 30), // Tomorrow at 10:30 AM
        customLabels: 'promotion, sale',
        language: 'HI',
        mediaUrl: 'https://drive.google.com/file/d/1XYZ789/view?usp=sharing',
        mediaType: 'video'
      },
      {
        content: 'Example Reel content - short vertical video perfect for Reels',
        scheduledFor: formatDateIST(dayAfter, 18, 0), // Day after at 6:00 PM
        customLabels: 'reel, trending',
        language: 'EN',
        mediaUrl: 'https://drive.google.com/file/d/1REEL456/view?usp=sharing',
        mediaType: 'reel'
      },
      {
        content: 'Example with Facebook video - will be automatically downloaded and re-uploaded',
        scheduledFor: formatDateIST(dayAfter, 20, 0), // Day after at 8:00 PM
        customLabels: 'facebook, video',
        language: 'EN',
        mediaUrl: 'https://www.facebook.com/PageName/videos/123456789/',
        mediaType: 'video'
      }
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Posts Template');
    
    // Set column widths
    const colWidths = [
      { wch: 50 }, // content
      { wch: 20 }, // scheduledFor
      { wch: 25 }, // accountName
      { wch: 20 }, // customLabels
      { wch: 10 }, // language
      { wch: 30 }, // mediaUrl
      { wch: 15 }  // mediaType
    ];
    worksheet['!cols'] = colWidths;
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}