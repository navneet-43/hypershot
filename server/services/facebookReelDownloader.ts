import axios from 'axios';
import { promises as fs, statSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface ReelDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
  reelInfo?: {
    title?: string;
    duration?: string;
    quality?: string;
    reelId?: string;
  };
}

export class FacebookReelDownloader {
  private static readonly DOWNLOAD_DIR = path.join(process.cwd(), 'temp', 'fb_reels');
  private static readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Download Facebook reel in highest quality available
   */
  static async downloadReel(facebookReelUrl: string): Promise<ReelDownloadResult> {
    try {
      console.log('🎬 Starting Facebook reel download:', facebookReelUrl);

      // Validate Facebook reel URL
      if (!this.isValidFacebookReelUrl(facebookReelUrl)) {
        return { success: false, error: 'Invalid Facebook reel URL. Please use a valid reel URL like: https://facebook.com/reel/123456789' };
      }

      // Ensure download directory exists
      await this.ensureDownloadDirectory();

      // Extract reel ID from URL
      const reelId = this.extractReelId(facebookReelUrl);
      if (!reelId) {
        return { success: false, error: 'Could not extract reel ID from URL' };
      }

      console.log('🔍 Extracted reel ID:', reelId);

      // Try multiple extraction methods for reels
      let reelInfo = await this.extractReelInfo(facebookReelUrl, reelId);
      
      if (!reelInfo.success || !reelInfo.videoUrl) {
        console.log('🔄 Primary extraction failed, trying alternative methods...');
        reelInfo = await this.extractReelInfoAlternative(facebookReelUrl, reelId);
      }

      if (!reelInfo.success || !reelInfo.videoUrl) {
        return { 
          success: false, 
          error: `
Failed to extract reel video URL. This could be due to:

🔧 POSSIBLE CAUSES:
1. The reel is private or restricted to logged-in users
2. The reel has been deleted or is no longer available  
3. Facebook has updated their security measures
4. The reel requires special permissions to access

💡 SOLUTIONS TO TRY:
1. Ensure the reel is public and accessible without login
2. Copy the reel URL again from a public Facebook page
3. Try using a regular Facebook video instead of a reel
4. Download the reel manually and upload it directly

⚠️  FACEBOOK REEL RESTRICTIONS:
Facebook reels have stricter access controls than regular videos. Only public reels from verified pages may be accessible for download.`
        };
      }

      // Download the reel video file
      const downloadResult = await this.downloadReelFile(reelInfo.videoUrl, reelInfo.title, reelId);
      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error };
      }

      console.log('✅ Facebook reel downloaded successfully:', downloadResult.filename);
      return {
        success: true,
        filePath: downloadResult.filePath,
        filename: downloadResult.filename,
        reelInfo: {
          title: reelInfo.title,
          duration: reelInfo.duration,
          quality: 'Original',
          reelId
        }
      };

    } catch (error) {
      console.error('❌ Error downloading Facebook reel:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Primary method to extract reel information using mobile API patterns
   */
  private static async extractReelInfo(reelUrl: string, reelId: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    duration?: string;
    error?: string;
  }> {
    try {
      console.log('🔍 Extracting reel info using primary method...');

      // Try multiple URL variations for better success rate
      const urlVariations = [
        reelUrl,
        reelUrl.replace('www.facebook.com', 'm.facebook.com'),
        `https://m.facebook.com/reel/${reelId}`,
        `https://www.facebook.com/reel/${reelId}`,
        `https://facebook.com/reel/${reelId}`
      ];

      for (const url of urlVariations) {
        try {
          const response = await axios.get(url, {
            headers: {
              'User-Agent': this.USER_AGENT,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache'
            },
            timeout: 20000,
            maxRedirects: 5,
            validateStatus: function (status) {
              return status >= 200 && status < 400;
            }
          });

          const html = response.data;
          
          // Facebook Reel-specific video URL patterns (updated for 2025)
          const reelVideoPatterns = [
            // Latest Facebook reel patterns
            /"playable_url":"([^"]+)"/,
            /"browser_native_hd_url":"([^"]+)"/,
            /"browser_native_sd_url":"([^"]+)"/,
            /"hd_src":"([^"]+)"/,
            /"sd_src":"([^"]+)"/,
            /"video_url":"([^"]+)"/,
            /"media_url":"([^"]+)"/,
            /"src":"(https:\/\/[^"]*\.mp4[^"]*)"/,
            /"url":"(https:\/\/[^"]*\.mp4[^"]*)"/,
            // Reel-specific patterns
            /"reels_video_url":"([^"]+)"/,
            /"reel_video_url":"([^"]+)"/,
            /"dash_manifest":"([^"]+)"/,
            /"progressive_urls":\[.*?"([^"]+)".*?\]/,
            // Mobile-specific patterns
            /\\"playable_url\\":\\"([^"]+)\\"/,
            /\\"hd_src\\":\\"([^"]+)\\"/,
            /\\"sd_src\\":\\"([^"]+)\\"/,
            // New 2025 patterns for reels
            /"video_dash_url":"([^"]+)"/,
            /"video_hls_url":"([^"]+)"/,
            /"reels_media_url":"([^"]+)"/,
            /data-reel-video="([^"]+)"/,
            /data-video-src="([^"]+)"/
          ];

          let videoUrl = '';
          for (const pattern of reelVideoPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
              if (videoUrl.startsWith('http') && (videoUrl.includes('.mp4') || videoUrl.includes('video'))) {
                console.log('✅ Found reel video URL with pattern:', pattern.source);
                break;
              }
            }
          }

          // Extract title - reel-specific selectors
          const titlePatterns = [
            /<title[^>]*>([^<]+)<\/title>/i,
            /"title":"([^"]+)"/,
            /"reel_title":"([^"]+)"/,
            /"video_title":"([^"]+)"/,
            /"text":"([^"]+)"/
          ];

          let title = 'Facebook Reel';
          for (const pattern of titlePatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              title = match[1].trim();
              if (title && !title.includes('Facebook') && title.length > 5) {
                break;
              }
            }
          }

          if (videoUrl) {
            console.log('✅ Reel info extracted successfully from:', url);
            return {
              success: true,
              videoUrl,
              title,
              duration: 'Unknown'
            };
          }

        } catch (error) {
          console.log(`❌ Failed to extract from ${url}:`, error instanceof Error ? error.message : 'Unknown error');
          continue;
        }
      }

      return {
        success: false,
        error: 'Could not extract reel video URL from any URL variation'
      };

    } catch (error) {
      console.error('❌ Error in reel extraction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Reel extraction failed'
      };
    }
  }

  /**
   * Alternative extraction method using different approaches
   */
  private static async extractReelInfoAlternative(reelUrl: string, reelId: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    duration?: string;
    error?: string;
  }> {
    try {
      console.log('🔄 Trying alternative reel extraction method...');

      // Try Graph API approach (limited but sometimes works for public reels)
      const graphApiUrl = `https://graph.facebook.com/v23.0/${reelId}?fields=source,embed_html,title&access_token=public_token`;
      
      try {
        const response = await axios.get(graphApiUrl, {
          timeout: 10000,
          validateStatus: function (status) {
            return status >= 200 && status < 500; // Accept even errors to check response
          }
        });

        if (response.data && response.data.source) {
          console.log('✅ Alternative method found video URL via Graph API');
          return {
            success: true,
            videoUrl: response.data.source,
            title: response.data.title || 'Facebook Reel',
            duration: 'Unknown'
          };
        }
      } catch (error) {
        console.log('Graph API method failed, continuing with other alternatives...');
      }

      // Try oembed approach
      const oembedUrl = `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(reelUrl)}`;
      
      try {
        const response = await axios.get(oembedUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': this.USER_AGENT
          }
        });

        if (response.data && response.data.html) {
          // Extract video URL from embed HTML
          const embedHtml = response.data.html;
          const srcMatch = embedHtml.match(/src="([^"]+)"/);
          if (srcMatch && srcMatch[1]) {
            console.log('✅ Alternative method found video URL via oembed');
            return {
              success: true,
              videoUrl: srcMatch[1],
              title: response.data.title || 'Facebook Reel',
              duration: 'Unknown'
            };
          }
        }
      } catch (error) {
        console.log('OEmbed method failed, trying final alternative...');
      }

      return {
        success: false,
        error: 'All alternative extraction methods failed'
      };

    } catch (error) {
      console.error('❌ Error in alternative reel extraction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Alternative extraction failed'
      };
    }
  }

  /**
   * Download reel video file from extracted URL
   */
  private static async downloadReelFile(videoUrl: string, title?: string, reelId?: string): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
  }> {
    try {
      console.log('⬇️ Downloading reel video file...');

      const filename = `fb_reel_${reelId || randomUUID()}_${this.sanitizeFilename(title || 'reel')}.mp4`;
      const filePath = path.join(this.DOWNLOAD_DIR, filename);

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': this.USER_AGENT,
          'Referer': 'https://www.facebook.com/',
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5'
        },
        timeout: 120000 // 2 minutes timeout for large reels
      });

      const writer = await fs.open(filePath, 'w');
      const writeStream = writer.createWriteStream();

      response.data.pipe(writeStream);

      return new Promise((resolve) => {
        writeStream.on('finish', async () => {
          await writer.close();
          
          // Validate downloaded file
          const fileBuffer = await fs.readFile(filePath, { encoding: null });
          const isValidVideo = this.isValidVideoFile(fileBuffer);
          
          if (!isValidVideo) {
            console.error('❌ Downloaded reel file is not valid video content');
            
            // Clean up invalid file
            try {
              await fs.unlink(filePath);
            } catch (e) {
              console.warn('Failed to cleanup invalid reel file:', e);
            }
            
            resolve({
              success: false,
              error: 'Downloaded reel content is not a video file. The reel may be private, restricted, or the extraction method needs updating.'
            });
            return;
          }
          
          const fileSize = statSync(filePath).size;
          console.log('✅ Reel video file downloaded and validated successfully:', Math.round(fileSize / 1024 / 1024) + 'MB');
          resolve({
            success: true,
            filePath,
            filename
          });
        });

        writeStream.on('error', async (error) => {
          await writer.close();
          console.error('❌ Error writing reel file:', error);
          resolve({
            success: false,
            error: error.message
          });
        });
      });

    } catch (error) {
      console.error('❌ Error downloading reel file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Reel download failed'
      };
    }
  }

  /**
   * Validate Facebook reel URL
   */
  private static isValidFacebookReelUrl(url: string): boolean {
    const facebookReelPatterns = [
      /^https?:\/\/(www\.)?facebook\.com\/reel\/\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/.*\/reel\/\d+/,
      /^https?:\/\/m\.facebook\.com\/reel\/\d+/,
      /^https?:\/\/facebook\.com\/reel\/\d+/
    ];

    return facebookReelPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Extract reel ID from Facebook reel URL
   */
  private static extractReelId(url: string): string | null {
    const reelIdPatterns = [
      /\/reel\/(\d+)/,
      /reel\/(\d+)/,
      /\/reel\/(\d+)\//
    ];

    for (const pattern of reelIdPatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Check if a file buffer contains valid video content
   */
  private static isValidVideoFile(buffer: Buffer): boolean {
    // Check for common video file signatures
    const videoSignatures = [
      // MP4
      [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
      [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
      // AVI
      [0x52, 0x49, 0x46, 0x46],
      // MOV/QuickTime
      [0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74],
      // WebM
      [0x1A, 0x45, 0xDF, 0xA3],
      // FLV
      [0x46, 0x4C, 0x56]
    ];

    // Check for HTML content (common when reel is private/inaccessible)
    const text = buffer.toString('utf8', 0, Math.min(200, buffer.length));
    if (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('<head>')) {
      return false;
    }

    // Check video signatures
    for (const signature of videoSignatures) {
      if (buffer.length >= signature.length) {
        let matches = true;
        for (let i = 0; i < signature.length; i++) {
          if (buffer[i] !== signature[i]) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
    }

    return false;
  }

  /**
   * Ensure download directory exists
   */
  private static async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.DOWNLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating reel download directory:', error);
    }
  }

  /**
   * Sanitize filename for safe file system usage
   */
  private static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  }

  /**
   * Clean up downloaded reel files
   */
  static async cleanupFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      console.log('🗑️ Cleaned up temporary reel file:', filePath);
    } catch (error) {
      console.error('Error cleaning up reel file:', error);
    }
  }
}