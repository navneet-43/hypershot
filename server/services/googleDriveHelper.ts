/**
 * Comprehensive Google Drive video access helper
 * Handles various sharing permission scenarios and URL formats
 */
export class GoogleDriveHelper {
  
  /**
   * Extract file ID from any Google Drive URL format
   */
  static extractFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/open\?id=([a-zA-Z0-9_-]+)/,
      /\/uc\?id=([a-zA-Z0-9_-]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Generate multiple Google Drive access URLs for testing
   */
  static generateAccessUrls(fileId: string): string[] {
    return [
      // Direct usercontent URLs (bypass redirects)
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`,
      
      // Standard download formats
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/u/0/uc?id=${fileId}&export=download`,
      `https://docs.google.com/uc?export=download&id=${fileId}`,
      
      // Alternative formats
      `https://drive.google.com/uc?id=${fileId}&authuser=0&export=download`,
      `https://drive.google.com/u/0/uc?export=download&confirm=t&id=${fileId}`
    ];
  }

  /**
   * Test URL and determine if it returns valid video data
   */
  static async testVideoUrl(url: string, timeout = 10000): Promise<{
    success: boolean;
    size: number;
    contentType: string | null;
    isVideo: boolean;
    needsAuth: boolean;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      // Try with range request to get accurate size for large files
      const response = await fetch(url, { 
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'video/*, application/octet-stream, */*',
          'Range': 'bytes=0-1023' // Get first 1KB to determine file type and size
        }
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const contentRange = response.headers.get('content-range');
      
      // For range requests, get total size from Content-Range header
      let size = 0;
      if (contentRange) {
        const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
        if (match) {
          size = parseInt(match[1], 10);
        }
      } else if (contentLength) {
        size = parseInt(contentLength, 10);
      }
      
      // Check if this is an authentication/permission issue
      const needsAuth = Boolean(
        contentType?.includes('text/html') && 
        (response.url.includes('accounts.google.com') || 
         response.url.includes('drive.google.com/file') ||
         size < 10000)
      );
      
      // Determine if this looks like video data
      const isVideo = Boolean(
        contentType?.includes('video') ||
        contentType?.includes('application/octet-stream') ||
        contentType?.includes('binary') ||
        (size > 100000 && !contentType?.includes('text/html'))
      );
      
      return {
        success: response.ok,
        size,
        contentType,
        isVideo,
        needsAuth,
      };
      
    } catch (error) {
      return {
        success: false,
        size: 0,
        contentType: null,
        isVideo: false,
        needsAuth: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Find the best working Google Drive URL for video access
   */
  static async findWorkingVideoUrl(originalUrl: string): Promise<{
    workingUrl: string | null;
    size: number;
    contentType: string | null;
    testedUrls: { url: string; result: any }[];
  }> {
    console.log('🔍 FINDING WORKING GOOGLE DRIVE URL for:', originalUrl);
    
    const fileId = this.extractFileId(originalUrl);
    if (!fileId) {
      console.log('❌ Could not extract file ID');
      return {
        workingUrl: null,
        size: 0,
        contentType: null,
        testedUrls: []
      };
    }
    
    console.log('✅ Extracted file ID:', fileId);
    
    const testUrls = this.generateAccessUrls(fileId);
    const testedUrls = [];
    
    for (const testUrl of testUrls) {
      console.log('🧪 Testing:', testUrl.split('?')[0] + '?...');
      
      const result = await this.testVideoUrl(testUrl);
      testedUrls.push({ url: testUrl, result });
      
      console.log(`   Result: ${result.success ? '✅' : '❌'} ${(result.size / 1024 / 1024).toFixed(2)}MB ${result.contentType || 'unknown'} ${result.isVideo ? '(VIDEO)' : '(NOT VIDEO)'}`);
      
      // Found a working video URL
      if (result.success && result.isVideo && result.size > 1000) {
        console.log('🎯 FOUND WORKING VIDEO URL:', testUrl);
        return {
          workingUrl: testUrl,
          size: result.size,
          contentType: result.contentType,
          testedUrls
        };
      }
    }
    
    console.log('❌ No working video URL found');
    return {
      workingUrl: null,
      size: 0,
      contentType: null,
      testedUrls
    };
  }

  /**
   * Generate detailed error message with Google Drive troubleshooting steps
   */
  static generateErrorMessage(fileId: string, testedUrls: { url: string; result: any }[]): string {
    const hasAuthIssues = testedUrls.some(t => t.result.needsAuth);
    
    let message = `Google Drive video access failed for file ID: ${fileId}\n\n`;
    
    if (hasAuthIssues) {
      message += `🔒 PERMISSION ISSUE DETECTED:\n`;
      message += `The video file requires authentication or has restricted sharing settings.\n\n`;
    }
    
    message += `🔧 REQUIRED STEPS TO FIX:\n`;
    message += `1. Open Google Drive and locate your video file\n`;
    message += `2. Right-click the video → "Share" or "Get link"\n`;
    message += `3. Change sharing from "Restricted" to "Anyone with the link"\n`;
    message += `4. Set permission level to "Viewer" (minimum required)\n`;
    message += `5. Copy the new link and use it in your post\n`;
    message += `6. Verify the file is fully uploaded (not showing "Processing...")\n\n`;
    
    message += `🔍 DIAGNOSTIC RESULTS:\n`;
    testedUrls.forEach(({ url, result }, i) => {
      const status = result.success ? '✅' : '❌';
      const size = (result.size / 1024 / 1024).toFixed(2);
      const authStatus = result.needsAuth ? '🔒 AUTH REQUIRED' : '';
      const videoStatus = result.isVideo ? '📹 VIDEO' : '📄 NOT VIDEO';
      message += `${i + 1}. ${status} ${size}MB - ${result.contentType || 'unknown'} ${authStatus} ${videoStatus}\n`;
    });
    
    message += `\n💡 QUICK SOLUTIONS:\n`;
    message += `• Download video → Upload directly to Facebook (most reliable)\n`;
    message += `• Use WeTransfer or Dropbox with public sharing\n`;
    message += `• Upload to YouTube → Share YouTube link in Facebook post\n`;
    message += `• Compress video with HandBrake if file is too large\n`;
    
    return message;
  }
}