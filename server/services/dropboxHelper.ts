/**
 * Dropbox video access helper
 * Handles Dropbox sharing URLs and converts them to direct download format
 */
export class DropboxHelper {
  
  /**
   * Check if URL is a Dropbox link
   */
  static isDropboxUrl(url: string): boolean {
    return url.includes('dropbox.com') || url.includes('dl.dropboxusercontent.com');
  }

  /**
   * Convert Dropbox sharing URL to direct download format
   */
  static convertToDirectUrl(url: string): string {
    console.log('🔄 CONVERTING DROPBOX URL for direct access');
    
    // Handle dropbox.com/s/ sharing links
    if (url.includes('dropbox.com/s/')) {
      const directUrl = url.replace('dropbox.com', 'dl.dropboxusercontent.com');
      console.log('✅ Converted Dropbox sharing URL to direct download');
      return directUrl;
    }
    
    // Handle dropbox.com/scl/fi/ new sharing format
    if (url.includes('dropbox.com/scl/fi/')) {
      // For the new scl/fi format, we need to keep the original domain but change parameters
      // Change dl=0 to dl=1 and remove st parameter that causes issues
      let directUrl = url.replace(/&dl=0/g, '&dl=1').replace(/\?dl=0/g, '?dl=1');
      
      // Remove st parameter which can cause authentication issues
      directUrl = directUrl.replace(/&st=[^&]+/g, '').replace(/\?st=[^&]+&/g, '?').replace(/\?st=[^&]+$/g, '');
      
      // Ensure dl=1 parameter exists
      if (!directUrl.includes('dl=1')) {
        const separator = directUrl.includes('?') ? '&' : '?';
        directUrl = directUrl + separator + 'dl=1';
      }
      
      console.log('✅ Converted new Dropbox scl/fi format for direct download');
      console.log('🔍 CONVERSION DEBUG:', {
        original: url,
        converted: directUrl
      });
      return directUrl;
    }
    
    // Handle existing dl.dropboxusercontent.com URLs
    if (url.includes('dl.dropboxusercontent.com')) {
      console.log('✅ Dropbox URL already in direct download format');
      return url;
    }
    
    // Handle dropbox.com/sh/ folder sharing (extract specific file)
    if (url.includes('dropbox.com/sh/')) {
      console.log('⚠️ Dropbox folder link detected - needs specific file URL');
      return url; // Return as-is, will need manual conversion
    }
    
    console.log('⚠️ Unknown Dropbox URL format, using original');
    return url;
  }

  /**
   * Test Dropbox URL accessibility and get file info
   */
  static async testDropboxAccess(url: string, timeout = 10000): Promise<{
    success: boolean;
    size: number;
    contentType: string | null;
    isVideo: boolean;
    error?: string;
  }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : 0;
      
      const isVideo = Boolean(
        contentType?.includes('video') ||
        contentType?.includes('application/octet-stream') ||
        // For Dropbox, if we get HTML, it might mean the URL isn't properly converted
        // Check file extension from URL to help determine if it's a video
        (url.match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v)(\?|$)/i)) ||
        (size > 100000 && !contentType?.includes('text/html'))
      );
      
      return {
        success: response.ok,
        size,
        contentType,
        isVideo
      };
      
    } catch (error) {
      return {
        success: false,
        size: 0,
        contentType: null,
        isVideo: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get optimized Dropbox URL for video download
   */
  static async getOptimizedVideoUrl(originalUrl: string): Promise<{
    workingUrl: string;
    size: number;
    contentType: string | null;
    verified: boolean;
  }> {
    console.log('🔍 OPTIMIZING DROPBOX URL for video access');
    
    const directUrl = this.convertToDirectUrl(originalUrl);
    
    // Test the converted URL
    const testResult = await this.testDropboxAccess(directUrl);
    
    if (testResult.success && testResult.isVideo && testResult.size > 0) {
      console.log(`✅ DROPBOX VIDEO VERIFIED: ${(testResult.size / 1024 / 1024).toFixed(2)}MB`);
      return {
        workingUrl: directUrl,
        size: testResult.size,
        contentType: testResult.contentType,
        verified: true
      };
    }
    
    // If initial conversion didn't work, try alternative conversion methods
    console.log('⚠️ Initial Dropbox conversion failed, trying alternative methods');
    
    // Try raw=1 parameter instead of dl=1
    if (originalUrl.includes('dropbox.com/scl/fi/')) {
      const rawUrl = directUrl.replace('dl=1', 'raw=1');
      const rawTest = await this.testDropboxAccess(rawUrl);
      
      if (rawTest.success && rawTest.isVideo) {
        console.log('✅ DROPBOX RAW URL WORKS');
        return {
          workingUrl: rawUrl,
          size: rawTest.size,
          contentType: rawTest.contentType,
          verified: true
        };
      }
    }
    
    // Force video content type if URL has video extension
    const hasVideoExtension = originalUrl.match(/\.(mp4|mov|avi|mkv|wmv|flv|webm|m4v)(\?|$)/i);
    if (hasVideoExtension) {
      console.log('🎬 FORCING VIDEO TYPE based on file extension');
      return {
        workingUrl: directUrl,
        size: testResult.size || 50000000, // Assume 50MB if unknown
        contentType: 'video/mp4', // Force video content type
        verified: false
      };
    }
    
    console.log('⚠️ Dropbox URL verification failed, using converted URL anyway');
    return {
      workingUrl: directUrl,
      size: testResult.size,
      contentType: testResult.contentType,
      verified: false
    };
  }

  /**
   * Generate Dropbox setup instructions
   */
  static getDropboxInstructions(): string {
    return `DROPBOX VIDEO SHARING SETUP:

1. **Upload to Dropbox**:
   • Upload your video file to Dropbox
   • Ensure the upload is complete

2. **Create Sharing Link**:
   • Right-click the video file
   • Select "Share" or "Copy link"
   • Choose "Anyone with the link can view"

3. **Use the Link**:
   • Copy the sharing link from Dropbox
   • Paste it directly in your Excel import or post form
   • System will automatically convert to direct download format

4. **Supported Formats**:
   • dropbox.com/s/ (standard sharing)
   • dropbox.com/scl/fi/ (new format)
   • dl.dropboxusercontent.com (direct links)

✅ ADVANTAGES:
• Supports large video files (up to Dropbox limits)
• Direct programmatic access (no authentication needed)
• Reliable for automated posting
• Works with Facebook's video upload system`;
  }
}