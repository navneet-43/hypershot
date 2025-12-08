import axios from 'axios';
import { promises as fs, statSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { tempFileManager } from '../utils/tempFileManager';

interface EnhancedReelDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
  reelInfo?: {
    title?: string;
    duration?: string;
    quality?: string;
    reelId?: string;
    author?: string;
    thumbnail?: string;
  };
  method?: 'extraction' | 'apify-api';
}

export class EnhancedFacebookReelDownloader {
  private static readonly DOWNLOAD_DIR = path.join(process.cwd(), 'temp', 'fb_reels');
  private static readonly USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0'
  ];

  private static getRandomUserAgent(): string {
    return this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
  }
  
  // Apify API configuration - using free tier initially
  private static readonly APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
  private static readonly APIFY_ACTOR_ID = 'pocesar/download-facebook-video'; // Reliable general-purpose actor

  /**
   * Enhanced Facebook reel download with Apify API fallback
   */
  static async downloadReel(facebookReelUrl: string): Promise<EnhancedReelDownloadResult> {
    try {
      console.log('🎬 Starting enhanced Facebook reel download:', facebookReelUrl);

      // Validate Facebook reel URL
      if (!this.isValidFacebookReelUrl(facebookReelUrl)) {
        return { success: false, error: 'Invalid Facebook reel URL. Please use a valid reel URL like: https://facebook.com/reel/123456789' };
      }

      // Ensure download directory exists
      await this.ensureDownloadDirectory();

      // Method 1: Try our extraction method first (free)
      console.log('🔄 METHOD 1: Trying direct extraction first...');
      const extractionResult = await this.tryDirectExtraction(facebookReelUrl);
      
      if (extractionResult.success) {
        console.log('✅ METHOD 1 SUCCESS: Direct extraction worked');
        return { ...extractionResult, method: 'extraction' };
      }

      console.log('❌ METHOD 1 FAILED:', extractionResult.error);

      // Method 2: Use Apify API as fallback (paid but reliable)
      if (this.APIFY_API_TOKEN) {
        console.log('🔄 METHOD 2: Trying Apify API fallback...');
        const apifyResult = await this.tryApifyAPI(facebookReelUrl);
        
        if (apifyResult.success) {
          console.log('✅ METHOD 2 SUCCESS: Apify API worked');
          return { ...apifyResult, method: 'apify-api' };
        }

        console.log('❌ METHOD 2 FAILED:', apifyResult.error);
      } else {
        console.log('⚠️ METHOD 2 SKIPPED: No Apify API token configured');
      }

      // Both methods failed
      return {
        success: false,
        error: `
🚫 ENHANCED FACEBOOK REEL DOWNLOAD FAILED

METHOD 1 (Direct Extraction): ${extractionResult.error}

METHOD 2 (Apify API): ${this.APIFY_API_TOKEN ? 'Failed - see logs' : 'Skipped - no API token'}

🔧 RECOMMENDED SOLUTIONS:
1. Verify the reel is completely public and accessible
2. Set up Apify API token for reliable downloads:
   - Sign up at https://console.apify.com/ (free tier available)
   - Get API token from Integrations → API tokens
   - Add APIFY_API_TOKEN to environment variables
3. Try with a different public Facebook reel URL
4. Download the reel manually and upload it directly

⚠️  FACEBOOK REEL LIMITATIONS (2025):
Facebook has implemented stronger anti-scraping measures. Third-party APIs like Apify provide the most reliable access.`
      };

    } catch (error) {
      console.error('❌ Enhanced reel download error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Method 1: Direct extraction (original implementation)
   */
  private static async tryDirectExtraction(reelUrl: string): Promise<EnhancedReelDownloadResult> {
    try {
      const reelId = this.extractReelId(reelUrl);
      if (!reelId) {
        return { success: false, error: 'Could not extract reel ID from URL' };
      }

      // Try multiple URL variations and access methods
      const urlVariations = [
        reelUrl,
        reelUrl.replace('www.facebook.com', 'm.facebook.com'),
        reelUrl.replace('facebook.com', 'm.facebook.com'),
        `https://m.facebook.com/reel/${reelId}`,
        `https://www.facebook.com/reel/${reelId}`,
        `https://facebook.com/reel/${reelId}`,
        reelUrl.replace('reel/', 'watch/?v='),
        reelUrl + '?_rdr'
      ];

      // Try each URL variation with retry logic
      for (const url of urlVariations) {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            console.log(`🔄 Trying URL variation ${urlVariations.indexOf(url) + 1}/${urlVariations.length}, attempt ${attempt}/3: ${url.substring(0, 50)}...`);
            
            const response = await axios.get(url, {
            headers: {
              'User-Agent': this.getRandomUserAgent(),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Cache-Control': 'max-age=0',
            },
            timeout: 15000,
            maxRedirects: 3,
            validateStatus: function (status) {
              return status >= 200 && status < 400;
            }
          });

          const html = response.data;

          // Enhanced extraction patterns for 2025 Facebook security
          const videoUrlPatterns = [
            // Standard Facebook video URL patterns
            /"playable_url":"([^"]+)"/,
            /"browser_native_hd_url":"([^"]+)"/,
            /"browser_native_sd_url":"([^"]+)"/,
            /"video_url":"([^"]+)"/,
            /playable_url:"([^"]+)"/,
            /hd_src:"([^"]+)"/,
            /sd_src:"([^"]+)"/,
            
            // Updated 2025 patterns
            /"src":"(https:\/\/[^"]*\.mp4[^"]*)"/,
            /videoUrl":"([^"]+)"/,
            /"video":{[^}]*"src":"([^"]+)"/,
            /"progressive_urls":\[{[^}]*"url":"([^"]+)"/,
            /"dash_manifest":"([^"]+)"/,
            /"playable_duration_in_ms":[^,]*,"src":"([^"]+)"/,
            
            // Alternative patterns for different Facebook layouts
            /data-video-url="([^"]+)"/,
            /videoSrc":"([^"]+)"/,
            /video-src="([^"]+)"/,
            /<video[^>]*src="([^"]+)"/,
            /"url":"(https:\/\/[^"]*fbcdn[^"]*\.mp4[^"]*)"/,
            
            // Fallback patterns
            /(https:\/\/[^"\s]*video[^"\s]*\.mp4[^"\s]*)/,
            /(https:\/\/[^"\s]*fbcdn[^"\s]*\.mp4[^"\s]*)/,
            /(https:\/\/[^"\s]*facebook[^"\s]*\.mp4[^"\s]*)/
          ];

          let videoUrl = '';
          for (const pattern of videoUrlPatterns) {
            const match = html.match(pattern);
            if (match && match[1]) {
              videoUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
              if (videoUrl.startsWith('http') && videoUrl.includes('.mp4')) {
                break;
              }
            }
          }

          if (videoUrl) {
            // Download the video file
            const downloadResult = await this.downloadVideoFile(videoUrl, `Facebook Reel ${reelId}`, reelId);
            return downloadResult;
          }

          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.log(`❌ Attempt ${attempt}/3 failed for ${url.substring(0, 50)}...: ${errorMsg}`);
            
            if (attempt === 3) {
              console.log(`🚫 All attempts failed for ${url.substring(0, 50)}...`);
              break; // Move to next URL variation
            } else {
              // Wait before retry with exponential backoff
              const delay = attempt * 2000; // 2s, 4s
              console.log(`⏱️ Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      }

      return {
        success: false,
        error: 'Could not extract video URL from Facebook reel page'
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Direct extraction failed'
      };
    }
  }

  /**
   * Method 2: Apify API fallback (reliable but paid)
   */
  private static async tryApifyAPI(reelUrl: string): Promise<EnhancedReelDownloadResult> {
    try {
      console.log('🔗 Using Apify API for reliable reel download');

      const apiUrl = `https://api.apify.com/v2/acts/${this.APIFY_ACTOR_ID}/run-sync-get-dataset-items`;
      
      const payload = {
        startUrls: [{ url: reelUrl }],
        downloadVideo: true,
        preferredResolution: '720p',
        maxRetries: 2
      };

      const response = await axios.post(apiUrl, payload, {
        headers: {
          'Authorization': `Bearer ${this.APIFY_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 1 minute timeout for API
      });

      const results = response.data;
      
      if (!results || results.length === 0) {
        return {
          success: false,
          error: 'Apify API returned no results for this reel'
        };
      }

      const reelData = results[0];
      
      // Check if we got a valid video URL
      const videoUrl = reelData.videoUrl || reelData.downloadUrl || reelData.url;
      
      if (!videoUrl) {
        return {
          success: false,
          error: 'Apify API did not return a valid video URL'
        };
      }

      // Download the video file from Apify's extracted URL
      const downloadResult = await this.downloadVideoFile(
        videoUrl, 
        reelData.title || 'Facebook Reel',
        this.extractReelId(reelUrl) || undefined
      );

      if (downloadResult.success) {
        // Enhance result with Apify metadata
        downloadResult.reelInfo = {
          ...downloadResult.reelInfo,
          title: reelData.title,
          author: reelData.author,
          duration: reelData.duration,
          thumbnail: reelData.thumbnail
        };
      }

      return downloadResult;

    } catch (error) {
      console.error('Apify API error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Apify API failed'
      };
    }
  }

  /**
   * Download video file from extracted URL
   */
  private static async downloadVideoFile(videoUrl: string, title?: string, reelId?: string): Promise<EnhancedReelDownloadResult> {
    try {
      console.log('⬇️ Downloading reel video file from:', videoUrl.substring(0, 100) + '...');

      const filename = `fb_reel_${reelId || randomUUID()}_${this.sanitizeFilename(title || 'reel')}.mp4`;
      const filePath = path.join(this.DOWNLOAD_DIR, filename);

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Referer': 'https://www.facebook.com/',
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
          'Sec-Fetch-Dest': 'video',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
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
              error: 'Downloaded reel content is not a video file. The reel may be private, geo-restricted, or the extraction method needs updating.'
            });
            return;
          }
          
          const fileSize = statSync(filePath).size;
          console.log('✅ Enhanced reel download completed successfully:', Math.round(fileSize / 1024 / 1024) + 'MB');
          
          // Register file with TempFileManager for automatic cleanup
          const { token, cleanup } = tempFileManager.register(filePath, {
            owner: 'EnhancedFacebookReelDownloader',
            ttlMs: 6 * 60 * 60 * 1000, // 6 hours
            tags: ['facebook-reel', 'downloaded-media']
          });
          
          resolve({
            success: true,
            filePath,
            filename,
            reelInfo: {
              title: title || 'Facebook Reel',
              quality: 'Original',
              reelId: reelId || 'unknown'
            }
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
      console.error('Error creating enhanced reel download directory:', error);
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
   * Clean up downloaded reel files using TempFileManager
   */
  static async cleanupFile(filePath: string): Promise<void> {
    await tempFileManager.cleanup(filePath);
  }

  /**
   * Get setup instructions for Apify API
   */
  static getApifySetupInstructions(): string {
    return `
🔧 APIFY API SETUP FOR RELIABLE FACEBOOK REEL DOWNLOADS

1. Create Free Apify Account:
   • Visit: https://console.apify.com/
   • Sign up (free tier includes $5/month credit)

2. Get API Token:
   • Go to: Integrations → API tokens
   • Create new token
   • Copy the token

3. Add to Environment:
   • Add APIFY_API_TOKEN=your_token_here to environment variables

4. Benefits:
   • Reliable Facebook reel downloads (works in 2025)
   • Handles Facebook's anti-scraping measures
   • Professional-grade with metadata extraction
   • ~$0.25 per 1000 operations (very affordable)

5. Usage:
   • System will automatically use Apify when direct extraction fails
   • No code changes needed - works as fallback
`;
  }
}