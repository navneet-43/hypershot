import fetch from 'node-fetch';
import { createWriteStream, unlinkSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';

/**
 * Video validation service to ensure files are valid before Facebook upload
 * Tests actual video file integrity and format compatibility
 */
export class VideoValidator {
  
  static readonly TEMP_DIR = join(process.cwd(), 'temp');
  static readonly MAX_SAMPLE_SIZE = 10 * 1024 * 1024; // Download first 10MB for validation
  
  /**
   * Validate video file by downloading and checking format
   */
  static async validateVideoFile(url: string): Promise<{
    isValid: boolean;
    fileSize: number;
    actualFormat: string | null;
    error?: string;
    recommendations?: string[];
  }> {
    console.log('🔍 VALIDATING VIDEO FILE:', url);
    
    // Convert cloud storage URLs to direct download format before validation
    let validationUrl = url;
    if (url.includes('vimeo.com')) {
      const { VimeoHelper } = await import('./vimeoHelper');
      const result = await VimeoHelper.getOptimizedVideoUrl(url);
      if (result.workingUrl && result.method === 'direct') {
        validationUrl = result.workingUrl;
        console.log('🔄 Using converted Vimeo URL for validation');
      } else {
        console.log('⚠️ Vimeo direct URL not available, using original');
      }
    } else if (url.includes('dropbox.com')) {
      const { DropboxHelper } = await import('./dropboxHelper');
      validationUrl = DropboxHelper.convertToDirectUrl(url);
      console.log('🔄 Using converted Dropbox URL for validation');
    } else if (url.includes('drive.google.com')) {
      const { GoogleDriveHelper } = await import('./googleDriveHelper');
      const result = await GoogleDriveHelper.findWorkingVideoUrl(url);
      if (result.workingUrl) {
        validationUrl = result.workingUrl;
        console.log('🔄 Using converted Google Drive URL for validation');
      } else {
        console.log('⚠️ Google Drive URL conversion failed, using original');
      }
    }
    
    let tempFile: string | null = null;
    
    try {
      // Download first portion of video for validation
      const response = await fetch(validationUrl, {
        headers: {
          'Range': `bytes=0-${this.MAX_SAMPLE_SIZE - 1}`,
          'User-Agent': 'Mozilla/5.0 (compatible; FacebookBot/1.0)'
        }
      });
      
      if (!response.ok) {
        return {
          isValid: false,
          fileSize: 0,
          actualFormat: null,
          error: `Failed to download video: ${response.status} ${response.statusText}`,
          recommendations: [
            'Check if the video URL is accessible',
            'Ensure sharing permissions are set to "Anyone with the link"',
            'Try using a different video hosting service'
          ]
        };
      }
      
      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      console.log('📥 DOWNLOADING VIDEO SAMPLE for validation...');
      
      // Ensure temp directory exists
      if (!existsSync(this.TEMP_DIR)) {
        mkdirSync(this.TEMP_DIR, { recursive: true });
      }
      
      // Create temp file for validation
      tempFile = join(this.TEMP_DIR, `validation_${Date.now()}.tmp`);
      const fileStream = createWriteStream(tempFile);
      
      if (response.body) {
        await pipeline(response.body, fileStream);
      }
      
      // Read first few bytes to determine actual format
      const fileDescriptor = openSync(tempFile, 'r');
      const buffer = Buffer.alloc(100);
      readSync(fileDescriptor, buffer, 0, 100, 0);
      closeSync(fileDescriptor);
      const actualFormat = this.detectVideoFormat(buffer);
      
      console.log('🎬 VIDEO VALIDATION RESULTS:', {
        size: `${(fileSize / 1024 / 1024).toFixed(2)}MB`,
        declaredType: contentType,
        actualFormat,
        isValid: actualFormat !== null
      });
      
      // Validate format compatibility with Facebook
      const isValid = this.isFacebookCompatible(actualFormat, contentType);
      
      if (!isValid) {
        return {
          isValid: false,
          fileSize,
          actualFormat: actualFormat || contentType,
          error: 'Video format not compatible with Facebook',
          recommendations: [
            'Convert video to MP4 format with H.264 codec',
            'Ensure video duration is at least 1 second',
            'Use standard frame rates (24, 25, 30, or 60 fps)',
            'Try re-exporting the video with compatible settings'
          ]
        };
      }
      
      return {
        isValid: true,
        fileSize,
        actualFormat: actualFormat || contentType
      };
      
    } catch (error) {
      console.error('❌ VIDEO VALIDATION ERROR:', error);
      
      return {
        isValid: false,
        fileSize: 0,
        actualFormat: null,
        error: error instanceof Error ? error.message : 'Video validation failed',
        recommendations: [
          'Check your internet connection',
          'Verify the video file is not corrupted',
          'Try uploading a different video file',
          'Contact support if the issue persists'
        ]
      };
      
    } finally {
      // Clean up temp file
      if (tempFile) {
        try {
          unlinkSync(tempFile);
        } catch (e) {
          console.warn('⚠️ Failed to clean up temp file:', tempFile);
        }
      }
    }
  }
  
  /**
   * Detect video format from file header bytes
   */
  private static detectVideoFormat(buffer: Buffer): string | null {
    // Check for common video format signatures
    const hex = buffer.toString('hex').toLowerCase();
    
    // MP4/MOV formats
    if (hex.includes('66747970') || hex.includes('6d6f6f76')) {
      return 'video/mp4';
    }
    
    // WebM format
    if (hex.includes('1a45dfa3')) {
      return 'video/webm';
    }
    
    // AVI format
    if (hex.includes('52494646') && hex.includes('41564920')) {
      return 'video/avi';
    }
    
    // MKV format
    if (hex.includes('1a45dfa3')) {
      return 'video/mkv';
    }
    
    // Check for HTML content (indicates URL issue)
    const text = buffer.toString('utf8').toLowerCase();
    if (text.includes('<html') || text.includes('<!doctype')) {
      return 'text/html';
    }
    
    return null;
  }
  
  /**
   * Check if format is compatible with Facebook
   */
  private static isFacebookCompatible(actualFormat: string | null, declaredType: string | null): boolean {
    const supportedFormats = [
      'video/mp4',
      'video/quicktime',
      'video/avi',
      'video/mkv',
      'video/webm',
      'application/octet-stream' // Sometimes video files are served as binary
    ];
    
    // If we detected HTML, the URL is definitely wrong
    if (actualFormat === 'text/html') {
      return false;
    }
    
    // If we have actual format, check it
    if (actualFormat) {
      return supportedFormats.some(format => actualFormat.includes(format));
    }
    
    // Fallback to declared type
    if (declaredType) {
      return supportedFormats.some(format => declaredType.includes(format));
    }
    
    return false;
  }
  
  /**
   * Generate validation report for user
   */
  static generateValidationReport(result: {
    isValid: boolean;
    fileSize: number;
    actualFormat: string | null;
    error?: string;
    recommendations?: string[];
  }): string {
    if (result.isValid) {
      return `✅ VIDEO VALIDATION PASSED
      
Size: ${(result.fileSize / 1024 / 1024).toFixed(2)}MB
Format: ${result.actualFormat}
Status: Ready for Facebook upload`;
    }
    
    let report = `❌ VIDEO VALIDATION FAILED

Error: ${result.error}
Format detected: ${result.actualFormat || 'Unknown'}
Size: ${(result.fileSize / 1024 / 1024).toFixed(2)}MB

🔧 RECOMMENDATIONS:`;
    
    if (result.recommendations) {
      result.recommendations.forEach((rec, index) => {
        report += `\n${index + 1}. ${rec}`;
      });
    }
    
    return report;
  }
}