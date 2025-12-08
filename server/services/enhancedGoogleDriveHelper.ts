import { createWriteStream, existsSync, unlinkSync, statSync } from 'fs';
import { pipeline } from 'stream/promises';

/**
 * Enhanced Google Drive helper specifically designed to handle large video files
 * Addresses the 0MB download issue with multiple access strategies
 */
export class EnhancedGoogleDriveHelper {
  
  /**
   * Extract file ID from Google Drive URLs with comprehensive pattern matching
   */
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/open\?id=([a-zA-Z0-9_-]+)/,
      /\/uc\?id=([a-zA-Z0-9_-]+)/,
      /drive\.google\.com\/.*\/([a-zA-Z0-9_-]{25,})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        console.log(`Found Google Drive file ID: ${match[1]}`);
        return match[1];
      }
    }
    
    console.log('Could not extract file ID from URL');
    return null;
  }

  /**
   * Generate multiple access URLs to bypass Google Drive restrictions
   */
  static generateAccessUrls(fileId: string): string[] {
    return [
      // Method 1: Direct usercontent URLs (bypasses many restrictions)
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      
      // Method 2: Standard download URLs with confirmation
      `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t&authuser=0`,
      `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      `https://drive.google.com/u/0/uc?id=${fileId}&export=download&confirm=t`,
      
      // Method 3: Alternative access patterns
      `https://docs.google.com/uc?export=download&id=${fileId}&confirm=t`,
      `https://drive.google.com/uc?id=${fileId}&export=download&authuser=0`,
      `https://drive.google.com/uc?id=${fileId}&export=download`,
      
      // Method 4: Fallback patterns
      `https://drive.google.com/file/d/${fileId}/view?usp=drive_link&export=download`,
      `https://googledrive.com/host/${fileId}`
    ];
  }

  /**
   * Test URL accessibility and get actual file size
   */
  static async testUrlAccess(url: string): Promise<{
    accessible: boolean;
    size: number;
    contentType?: string;
    error?: string;
  }> {
    try {
      console.log(`Testing URL access: ${url.substring(0, 60)}...`);
      
      // Use HEAD request to check without downloading
      const response = await fetch(url, { 
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return {
          accessible: false,
          size: 0,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      const contentLength = response.headers.get('content-length');
      const contentType = response.headers.get('content-type');
      const size = contentLength ? parseInt(contentLength, 10) : 0;

      console.log(`URL test result: ${size} bytes, type: ${contentType}`);

      return {
        accessible: true,
        size,
        contentType: contentType || undefined
      };

    } catch (error) {
      return {
        accessible: false,
        size: 0,
        error: `Request failed: ${error}`
      };
    }
  }

  /**
   * Download large video with progress tracking and validation
   */
  static async downloadLargeVideo(url: string): Promise<{
    success: boolean;
    filePath?: string;
    size?: number;
    error?: string;
    cleanup?: () => void;
  }> {
    const fileId = this.extractFileId(url);
    if (!fileId) {
      return {
        success: false,
        error: 'Invalid Google Drive URL format'
      };
    }

    console.log(`Starting enhanced Google Drive download for file ID: ${fileId}`);
    
    const accessUrls = this.generateAccessUrls(fileId);
    let bestUrl: string | null = null;
    let maxSize = 0;

    // Test all URLs to find the best one
    console.log('Testing access URLs for optimal download method...');
    for (const testUrl of accessUrls) {
      const test = await this.testUrlAccess(testUrl);
      if (test.accessible && test.size > maxSize) {
        bestUrl = testUrl;
        maxSize = test.size;
        console.log(`Better URL found: ${(test.size / 1024 / 1024).toFixed(2)}MB`);
      }
    }

    if (!bestUrl || maxSize === 0) {
      return {
        success: false,
        error: 'Google Drive file is not accessible or appears empty. Please ensure the file is set to "Anyone with the link can view" and try again.'
      };
    }

    console.log(`Using best URL with ${(maxSize / 1024 / 1024).toFixed(2)}MB detected size`);

    // Download the file with streaming to handle large files
    const outputPath = `/tmp/google_drive_${fileId}_${Date.now()}.mp4`;
    
    try {
      console.log('Starting streaming download...');
      const response = await fetch(bestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Download failed: ${response.status} ${response.statusText}`
        };
      }

      if (!response.body) {
        return {
          success: false,
          error: 'No response body received'
        };
      }

      // Stream to file
      console.log(`📁 Writing to: ${outputPath}`);
      const writeStream = createWriteStream(outputPath);
      await pipeline(response.body, writeStream);
      console.log('📥 Streaming completed');

      // Verify download
      if (!existsSync(outputPath)) {
        console.log('❌ Output file was not created');
        return {
          success: false,
          error: 'Download failed - output file not created'
        };
      }

      const stats = statSync(outputPath);
      const downloadedSize = stats.size;

      console.log(`Download completed: ${(downloadedSize / 1024 / 1024).toFixed(2)}MB`);

      if (downloadedSize === 0) {
        unlinkSync(outputPath);
        return {
          success: false,
          error: 'Downloaded file is empty (0 bytes). Google Drive may be restricting access to this file.'
        };
      }

      if (downloadedSize < 1024) {
        unlinkSync(outputPath);
        return {
          success: false,
          error: 'Downloaded file is too small and may be corrupted or restricted.'
        };
      }

      // Success
      const cleanup = () => {
        if (existsSync(outputPath)) {
          unlinkSync(outputPath);
          console.log('Google Drive download cleaned up');
        }
      };

      return {
        success: true,
        filePath: outputPath,
        size: downloadedSize,
        cleanup
      };

    } catch (error) {
      // Clean up on error
      if (existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
      
      return {
        success: false,
        error: `Download stream failed: ${error}`
      };
    }
  }

  /**
   * Check if URL is a Google Drive video link
   */
  static isGoogleDriveUrl(url: string): boolean {
    return url.includes('drive.google.com') || url.includes('docs.google.com');
  }
}