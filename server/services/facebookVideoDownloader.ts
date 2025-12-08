import puppeteer from 'puppeteer';
import axios from 'axios';
import { promises as fs, statSync, createWriteStream } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';
import { tempFileManager } from '../utils/tempFileManager';
import { DiskSpaceMonitor } from '../utils/diskSpaceMonitor';

interface VideoDownloadResult {
  success: boolean;
  filePath?: string;
  filename?: string;
  error?: string;
  videoInfo?: {
    title?: string;
    duration?: string;
    quality?: string;
  };
}

export class FacebookVideoDownloader {
  // PRODUCTION FIX: Use /tmp instead of persistent storage to avoid ENOSPC in production
  private static readonly DOWNLOAD_DIR = '/tmp/fb_videos';
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

  /**
   * Download Facebook video in highest quality available
   */
  static async downloadVideo(facebookUrl: string): Promise<VideoDownloadResult> {
    try {
      console.log('🎥 Starting Facebook video download:', facebookUrl);

      // PRODUCTION FIX: Check disk space BEFORE download
      console.log('💾 Pre-download disk space check...');
      try {
        await DiskSpaceMonitor.ensureMinimumSpace(150); // Facebook videos typically 50-150MB
      } catch (spaceError: any) {
        console.error('❌ Disk space error:', spaceError.message);
        // Try ultra-aggressive cleanup
        console.log('🚨 Attempting ultra-aggressive cleanup...');
        await DiskSpaceMonitor.ultraAggressiveCleanup();
        // Re-check
        const finalCheck = await DiskSpaceMonitor.hasEnoughSpace(100);
        if (!finalCheck.hasSpace) {
          return {
            success: false,
            error: `❌ INSUFFICIENT DISK SPACE: Only ${finalCheck.available.toFixed(0)}MB available in /tmp (need 100MB). Your environment has ${(await DiskSpaceMonitor.getDiskSpace()).totalMB.toFixed(0)}MB total disk space. Please use smaller videos or contact Replit support to upgrade your deployment tier.`
          };
        }
      }

      // Validate Facebook URL
      if (!this.isValidFacebookVideoUrl(facebookUrl)) {
        return { success: false, error: 'Invalid Facebook video URL' };
      }

      // Ensure download directory exists
      await this.ensureDownloadDirectory();

      // Try network-based extraction first (more reliable in server environments)
      console.log('🔄 Trying network-based extraction first...');
      let videoInfo: { success: boolean; videoUrl?: string; title?: string; error?: string } = await this.extractVideoUrlFromNetwork(facebookUrl);
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        console.log('🔄 Network extraction failed, trying mobile version...');
        const mobileUrl = facebookUrl.replace('www.facebook.com', 'm.facebook.com');
        videoInfo = await this.extractVideoUrlFromNetwork(mobileUrl);
      }
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        console.log('🔄 Network methods failed, trying browser extraction...');
        try {
          const browserResult = await this.extractVideoInfo(facebookUrl);
          // Additional .mp4 validation for browser results
          if (browserResult.success && browserResult.videoUrl && browserResult.videoUrl.includes('.mp4')) {
            videoInfo = browserResult;
          } else if (browserResult.success && browserResult.videoUrl) {
            console.log('⚠️ Browser result validation failed: URL does not contain .mp4');
            videoInfo = { success: false, error: 'Browser method found non-MP4 URL, skipping' };
          }
        } catch (error) {
          console.log('❌ Browser extraction also failed:', error);
          videoInfo = { 
            success: false, 
            error: 'Browser extraction failed: ' + (error instanceof Error ? error.message : 'Unknown error') 
          };
        }
      }
      
      if (!videoInfo.success || !videoInfo.videoUrl) {
        // Provide comprehensive error message with solutions
        const baseError = videoInfo.error || 'Failed to extract video URL from all methods';
        const solutionMessage = `

🔧 SOLUTIONS TO TRY:
1. Check if the Facebook video is public (not private/friends-only)
2. Verify the video URL is correct and complete
3. Try copying the video URL again from Facebook
4. Use a public Facebook page video instead of personal profile video
5. Download the video manually and upload it directly

⚠️  FACEBOOK RESTRICTIONS:
Facebook has tightened security for video downloads. Only public videos from pages can typically be accessed programmatically.`;
        
        return { 
          success: false, 
          error: baseError + solutionMessage
        };
      }

      // Download the video file
      const downloadResult = await this.downloadVideoFile(videoInfo.videoUrl, videoInfo.title);
      if (!downloadResult.success) {
        return { success: false, error: downloadResult.error };
      }

      console.log('✅ Facebook video downloaded successfully:', downloadResult.filename);
      return {
        success: true,
        filePath: downloadResult.filePath,
        filename: downloadResult.filename,
        videoInfo: {
          title: videoInfo.title,
          duration: 'Unknown',
          quality: 'Original'
        }
      };

    } catch (error) {
      console.error('❌ Error downloading Facebook video:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Extract video information and download URL from Facebook page
   */
  private static async extractVideoInfo(facebookUrl: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    duration?: string;
    quality?: string;
    error?: string;
  }> {
    let browser;
    try {
      console.log('🔍 Extracting video info from Facebook page...');

      // Launch browser with stealth settings and additional Linux flags
      browser = await puppeteer.launch({
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--single-process',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent and viewport
      await page.setUserAgent(this.getRandomUserAgent());
      await page.setViewport({ width: 1920, height: 1080 });

      // Block unnecessary resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['stylesheet', 'font', 'image'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Navigate to Facebook video page
      await page.goto(facebookUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for video element to load
      await page.waitForSelector('video', { timeout: 10000 }).catch(() => null);

      // Extract video information using multiple selectors
      const videoInfo = await page.evaluate(() => {
        // Try multiple methods to find video elements
        const videoSelectors = [
          'video[src]',
          'video source[src]',
          '[data-video-id] video',
          '.spotlight video',
          'div[role="main"] video'
        ];

        let videoElement: HTMLVideoElement | null = null;
        let videoSrc = '';

        // Find video element
        for (const selector of videoSelectors) {
          const element = document.querySelector(selector) as HTMLVideoElement;
          if (element && element.src) {
            videoElement = element;
            videoSrc = element.src;
            break;
          }
        }

        // Try to find source elements
        if (!videoSrc) {
          const sources = Array.from(document.querySelectorAll('video source[src]'));
          for (const source of sources) {
            const src = (source as HTMLSourceElement).src;
            if (src && src.includes('video')) {
              videoSrc = src;
              break;
            }
          }
        }

        // Extract title from page
        const titleSelectors = [
          '[data-pagelet="VideoPlayerTitle"] h1',
          '[role="main"] h1',
          'h1[dir="auto"]',
          '.x1e558r4 h1',
          'title'
        ];

        let title = '';
        for (const selector of titleSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent) {
            title = element.textContent.trim();
            if (title && !title.includes('Facebook')) {
              break;
            }
          }
        }

        // Get video duration if available
        const duration = videoElement?.duration ? Math.floor(videoElement.duration).toString() + 's' : undefined;

        // Only return .mp4 URLs to ensure actual video downloads  
        if (videoSrc && videoSrc.startsWith('http') && videoSrc.includes('.mp4')) {
          console.log('✅ Browser method found valid .mp4 video URL');
          return {
            videoUrl: videoSrc,
            title: title || 'Facebook Video',
            duration,
            quality: 'HD'
          };
        } else if (videoSrc && videoSrc.startsWith('http')) {
          console.log(`⏭️ Browser method skipping non-MP4 URL: ${videoSrc.substring(0, 50)}...`);
        }
        
        return { videoUrl: '', title: '', duration: '', quality: '' };
      });

      await browser.close();

      if (!videoInfo.videoUrl) {
        // This code path should not be reached now since network extraction is done first
        return { success: false, error: 'Could not extract video URL from browser method' };
      }

      console.log('✅ Video info extracted:', { title: videoInfo.title, hasUrl: !!videoInfo.videoUrl });
      return {
        success: true,
        ...videoInfo
      };

    } catch (error) {
      if (browser) await browser.close();
      console.error('❌ Error extracting video info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract video info'
      };
    }
  }

  /**
   * Alternative method to extract video URL from network requests
   */
  private static async extractVideoUrlFromNetwork(facebookUrl: string): Promise<{
    success: boolean;
    videoUrl?: string;
    title?: string;
    error?: string;
  }> {
    try {
      console.log('🔍 Trying alternative extraction method...');

      // Try multiple URL variations with retry logic
      const urlVariations = [
        facebookUrl,
        facebookUrl.replace('www.facebook.com', 'm.facebook.com'),
        facebookUrl.replace('facebook.com', 'm.facebook.com'),
        facebookUrl + '?_rdr',
        facebookUrl.replace('/watch?v=', '/watch/?v='),
        facebookUrl.replace('watch/?v=', 'videos/')
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
                'Cache-Control': 'max-age=0'
              },
              timeout: 15000,
              maxRedirects: 3,
              validateStatus: function (status) {
                return status >= 200 && status < 400;
              }
            });

            const html = response.data;

            // Extract video URL using updated regex patterns for 2025
            const videoUrlPatterns = [
        // Latest Facebook video patterns (2025)
        /"hd_src":"([^"]+)"/,
        /"sd_src":"([^"]+)"/,
        /"browser_native_hd_url":"([^"]+)"/,
        /"browser_native_sd_url":"([^"]+)"/,
        /"playable_url":"([^"]+)"/,
        /"videoUrl":"([^"]+)"/,
        /hd_src:"([^"]+)"/,
        /sd_src:"([^"]+)"/,
        /"playable_url_quality_hd":"([^"]+)"/,
        /"playable_url_quality_sd":"([^"]+)"/,
        /\\"hd_src\\":\\"([^"]+)\\"/,
        /\\"sd_src\\":\\"([^"]+)\\"/,
        // New 2025 patterns
        /"dash_manifest":"([^"]+)"/,
        /"progressive_urls":\[.*?"([^"]+)".*?\]/,
        /"src":"([^"]+\.mp4[^"]*)"/, 
        /"video_url":"([^"]+)"/,
        /"media_url":"([^"]+)"/,
        /"src":"(https:\/\/[^"]*\.mp4[^"]*)"/,
        /"url":"(https:\/\/[^"]*\.mp4[^"]*)"/,
        /data-video-url="([^"]+)"/,
        /data-src="([^"]*\.mp4[^"]*)"/,
        // Mobile specific patterns
        /"src":"(https:\/\/[^"]*video_dash[^"]*)"/,
        /"progressive_url":"([^"]+)"/
      ];

      let videoUrl = '';
      for (const pattern of videoUrlPatterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          const candidateUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
          // Only accept .mp4 files to ensure actual video downloads
          if (candidateUrl.startsWith('http') && candidateUrl.includes('.mp4')) {
            videoUrl = candidateUrl;
            console.log('✅ Found valid .mp4 video URL');
            break;
          } else if (candidateUrl.startsWith('http')) {
            console.log(`⏭️ Skipping non-MP4 URL: ${candidateUrl.substring(0, 50)}...`);
          }
        }
      }
      
      // Additional validation to ensure we have a valid .mp4 URL
      if (videoUrl && !videoUrl.includes('.mp4')) {
        console.log('⚠️ Final validation failed: URL does not contain .mp4, clearing');
        videoUrl = '';
      }

      // Extract title
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : 'Facebook Video';

            if (videoUrl) {
              console.log('✅ Video URL extracted via network method');
              return {
                success: true,
                videoUrl,
                title
              };
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
        error: 'Could not extract video URL from Facebook page after trying all methods'
      };

    } catch (error) {
      console.error('❌ Error in network extraction:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network extraction failed'
      };
    }
  }

  /**
   * Download video file from extracted URL
   */
  private static async downloadVideoFile(videoUrl: string, title?: string): Promise<{
    success: boolean;
    filePath?: string;
    filename?: string;
    error?: string;
  }> {
    const filename = `fb_video_${randomUUID()}_${this.sanitizeFilename(title || 'video')}.mp4`;
    const filePath = path.join(this.DOWNLOAD_DIR, filename);
    const tempFilePath = filePath + '.part';
    
    // Register file with TempFileManager and get cleanup token
    const { token, cleanup } = tempFileManager.register(tempFilePath, {
      owner: 'FacebookVideoDownloader',
      ttlMs: 1 * 60 * 60 * 1000, // 1 hour TTL
      tags: ['facebook-video', 'downloading']
    });
    
    // Mark as in-use during download
    tempFileManager.markInUse(token);
    
    try {
      console.log('⬇️ Downloading video file...');
      
      // Preflight space check
      const preflightResult = await this.checkAvailableSpace();
      if (!preflightResult.hasSpace) {
        throw new Error(`Insufficient disk space: ${preflightResult.error}`);
      }

      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Referer': 'https://www.facebook.com/',
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5'
        },
        timeout: 120000 // 2 minutes timeout for large videos
      });

      const writer = await fs.open(tempFilePath, 'w');
      const writeStream = writer.createWriteStream();

      response.data.pipe(writeStream);

      // Use await to ensure Promise resolves BEFORE cleanup in finally block
      const result = await new Promise<{
        success: boolean;
        filePath?: string;
        filename?: string;
        error?: string;
      }>((resolve) => {
        writeStream.on('finish', async () => {
          await writer.close();
          
          try {
            // Check if the downloaded file is actually a video by reading file header
            const fileBuffer = await fs.readFile(tempFilePath, { encoding: null });
            const isValidVideo = this.isValidVideoFile(fileBuffer);
            
            if (!isValidVideo) {
              console.error('❌ Downloaded file is not a valid video: File header indicates HTML or text content');
              
              // Check if it's HTML content
              const textContent = fileBuffer.toString('utf8', 0, 500);
              if (textContent.includes('<html') || textContent.includes('<!DOCTYPE')) {
                console.error('🔍 Downloaded content is HTML page - likely access restricted or login required');
              }
              
              // Clean up the invalid .part file
              try {
                await fs.unlink(tempFilePath);
                console.log('🧹 Cleaned up invalid .part file');
              } catch (cleanupError) {
                console.warn('⚠️ Failed to cleanup invalid .part file:', cleanupError);
              }
              
              resolve({
                success: false,
                error: 'Downloaded content is not a video file. This usually means the Facebook video is private, requires login, or the URL extraction failed.'
              });
              return;
            }
            
            // Atomically move temp file to final location
            await fs.rename(tempFilePath, filePath);
            
            console.log('✅ Downloaded file validated as video content');
            const fileSize = statSync(filePath).size;
            console.log('✅ Video file downloaded and validated successfully');
            
            resolve({
              success: true,
              filePath,
              filename
            });
          } catch (error: any) {
            console.error('❌ Error processing downloaded file:', error);
            
            // Clean up the temp file on processing error
            try {
              await fs.unlink(tempFilePath);
              console.log('🧹 Cleaned up .part file after processing error');
            } catch (cleanupError) {
              console.warn('⚠️ Failed to cleanup .part file after processing error:', cleanupError);
            }
            
            resolve({
              success: false,
              error: error.message
            });
          }
        });

        writeStream.on('error', async (error: any) => {
          await writer.close();
          
          // Clean up the partial file immediately
          try {
            await fs.unlink(tempFilePath);
            console.log('🧹 Cleaned up partial .part file after write error');
          } catch (cleanupError) {
            console.warn('⚠️ Failed to cleanup partial .part file:', cleanupError);
          }
          
          // Handle ENOSPC errors specifically
          if (error.code === 'ENOSPC' || error.message?.includes('ENOSPC') || error.message?.includes('space left')) {
            console.error('💾 DISK SPACE ERROR: No space left on device');
            
            // Trigger immediate emergency cleanup
            console.log('🧹 Triggering emergency cleanup...');
            await tempFileManager.sweepTempDirs();
            
            resolve({
              success: false,
              error: 'No space left on device. Cleaned up temporary files. Please try again.'
            });
          } else {
            console.error('❌ Error writing video file:', error);
            resolve({
              success: false,
              error: error.message
            });
          }
        });
      });
      
      return result;

    } catch (error: any) {
      console.error('❌ Error downloading video file:', error);
      
      // Handle ENOSPC errors
      if (error.code === 'ENOSPC' || error.message?.includes('ENOSPC') || error.message?.includes('space left')) {
        console.log('🧹 Triggering emergency cleanup due to ENOSPC...');
        await tempFileManager.sweepTempDirs();
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed'
      };
    } finally {
      // Cleanup only executes AFTER the Promise resolves (due to await above)
      console.log('🧹 Executing finally block cleanup after Promise resolution');
      tempFileManager.release(token);
      await cleanup();
    }
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

    // Check for HTML content (common when video is private/inaccessible)
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
   * Validate Facebook video URL (excludes reels - handled by FacebookReelDownloader)
   */
  private static isValidFacebookVideoUrl(url: string): boolean {
    // Check if it's a reel URL (should be handled by FacebookReelDownloader)
    const isReelUrl = /\/reel\/\d+/.test(url);
    if (isReelUrl) {
      return false; // Reels are handled by FacebookReelDownloader
    }

    const facebookVideoPatterns = [
      /^https?:\/\/(www\.)?facebook\.com\/.*\/videos\/\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/watch\/\?v=\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/.*\/posts\/\d+/,
      /^https?:\/\/(www\.)?facebook\.com\/video\.php\?v=\d+/
    ];

    return facebookVideoPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Ensure download directory exists
   */
  private static async ensureDownloadDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.DOWNLOAD_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating download directory:', error);
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
   * Check available disk space before download using actual filesystem stats
   * Production-optimized with adaptive thresholds
   */
  private static async checkAvailableSpace(): Promise<{ hasSpace: boolean; error?: string }> {
    try {
      // PRODUCTION FIX: Check /tmp instead of persistent storage
      const fbVideoDir = this.DOWNLOAD_DIR; // Use /tmp/fb_videos
      
      // Check actual filesystem free space using statvfs-like approach
      let actualFreeSpace = 0;
      let totalSpace = 0;
      try {
        // Use df command to get actual filesystem space (Linux/Unix)
        const { execSync } = require('child_process');
        const dfOutput = execSync(`df -B1 "/tmp" | tail -n 1`, { encoding: 'utf8' });
        const dfParts = dfOutput.trim().split(/\s+/);
        
        if (dfParts.length >= 4) {
          totalSpace = parseInt(dfParts[1]); // Total space in bytes
          actualFreeSpace = parseInt(dfParts[3]); // Available space in bytes
          console.log(`💾 Disk space: ${Math.round(actualFreeSpace / 1024 / 1024)}MB free / ${Math.round(totalSpace / 1024 / 1024)}MB total`);
        }
      } catch (dfError: any) {
        console.warn('⚠️ Could not get filesystem stats via df:', dfError.message);
        // Fallback to simpler check
        actualFreeSpace = 2 * 1024 * 1024 * 1024; // Assume 2GB if can't check
        totalSpace = 10 * 1024 * 1024 * 1024; // Assume 10GB total
      }
      
      // Production-adaptive minimum space requirements
      const isProduction = process.env.NODE_ENV === 'production' || process.env.REPLIT_ENVIRONMENT === 'production';
      let minRequiredSpace: number;
      
      if (isProduction) {
        // More conservative requirements for production
        const totalSpaceGB = totalSpace / (1024 * 1024 * 1024);
        
        if (totalSpaceGB < 5) {
          // Very constrained environments (< 5GB total) - require only 50MB
          minRequiredSpace = 50 * 1024 * 1024; // 50MB
          console.log('🏭 Production: Using ultra-conservative space requirement (50MB) for constrained environment');
        } else if (totalSpaceGB < 20) {
          // Moderately constrained (< 20GB total) - require 150MB
          minRequiredSpace = 150 * 1024 * 1024; // 150MB
          console.log('🏭 Production: Using conservative space requirement (150MB)');
        } else {
          // More space available - require 300MB
          minRequiredSpace = 300 * 1024 * 1024; // 300MB
          console.log('🏭 Production: Using standard space requirement (300MB)');
        }
      } else {
        // Development - use higher requirement since we usually have more space
        minRequiredSpace = 500 * 1024 * 1024; // 500MB
        console.log('🛠️ Development: Using development space requirement (500MB)');
      }
      
      if (actualFreeSpace < minRequiredSpace) {
        console.log(`⚠️ Low disk space detected (${Math.round(actualFreeSpace / 1024 / 1024)}MB < ${Math.round(minRequiredSpace / 1024 / 1024)}MB), triggering progressive cleanup...`);
        
        // Progressive cleanup strategy
        console.log('🧹 Stage 1: Standard temp file cleanup...');
        await tempFileManager.sweepTempDirs();
        
        // Recheck after cleanup
        try {
          const dfOutput = execSync(`df -B1 "/tmp" | tail -n 1`, { encoding: 'utf8' });
          const dfParts = dfOutput.trim().split(/\s+/);
          if (dfParts.length >= 4) {
            actualFreeSpace = parseInt(dfParts[3]);
            console.log(`💾 After stage 1 cleanup: ${Math.round(actualFreeSpace / 1024 / 1024)}MB free`);
          }
        } catch (recheckError: any) {
          console.warn('⚠️ Could not recheck space after cleanup:', recheckError.message);
        }
        
        // If still insufficient, try aggressive cleanup
        if (actualFreeSpace < minRequiredSpace) {
          console.log('🧹 Stage 2: Aggressive cleanup (removing all temp files)...');
          try {
            // Remove all files from temp directories
            const tempDirs = [
              path.join(process.cwd(), 'temp', 'fb_videos'),
              path.join(process.cwd(), 'temp', 'fb_reels'),
              path.join(process.cwd(), 'temp')
            ];
            
            for (const dir of tempDirs) {
              try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                  if (file.endsWith('.mp4') || file.endsWith('.part') || file.startsWith('fb_')) {
                    const filePath = path.join(dir, file);
                    await fs.unlink(filePath);
                    console.log(`🗑️ Removed: ${file}`);
                  }
                }
              } catch (e) {
                // Directory might not exist, continue
              }
            }
            
            // Final recheck
            const dfOutput = execSync(`df -B1 "${process.cwd()}" | tail -n 1`, { encoding: 'utf8' });
            const dfParts = dfOutput.trim().split(/\s+/);
            if (dfParts.length >= 4) {
              actualFreeSpace = parseInt(dfParts[3]);
              console.log(`💾 After stage 2 cleanup: ${Math.round(actualFreeSpace / 1024 / 1024)}MB free`);
            }
          } catch (aggressiveError: any) {
            console.warn('⚠️ Aggressive cleanup failed:', aggressiveError.message);
          }
        }
        
        // Final check with potentially lowered threshold for production
        let finalThreshold = minRequiredSpace;
        if (isProduction && actualFreeSpace < minRequiredSpace) {
          // In production, if we're still short, try with emergency threshold
          finalThreshold = 25 * 1024 * 1024; // 25MB emergency threshold
          console.log('🚨 Using emergency threshold (25MB) for production');
        }
        
        if (actualFreeSpace < finalThreshold) {
          return {
            hasSpace: false,
            error: `Critical disk space shortage: ${Math.round(actualFreeSpace / 1024 / 1024)}MB free, need at least ${Math.round(finalThreshold / 1024 / 1024)}MB. Consider manual cleanup or increasing disk space.`
          };
        }
        
        if (actualFreeSpace < minRequiredSpace) {
          console.log(`⚠️ Running with emergency space allocation: ${Math.round(actualFreeSpace / 1024 / 1024)}MB`);
        }
      }
      
      // Additional directory-level safety check
      const maxDirBytes = 5 * 1024 * 1024 * 1024; // 5GB
      const safetyMargin = 0.8;
      const safeDirLimit = maxDirBytes * safetyMargin;
      
      let currentDirUsage = 0;
      try {
        const files = await fs.readdir(fbVideoDir);
        for (const file of files) {
          try {
            const stats = await fs.stat(path.join(fbVideoDir, file));
            currentDirUsage += stats.size;
          } catch (e) {
            // Ignore files that can't be accessed
          }
        }
      } catch (e) {
        currentDirUsage = 0;
      }
      
      if (currentDirUsage > safeDirLimit) {
        return {
          hasSpace: false,
          error: `Directory usage (${Math.round(currentDirUsage / 1024 / 1024)}MB) exceeds safe limit (${Math.round(safeDirLimit / 1024 / 1024)}MB)`
        };
      }
      
      return { hasSpace: true };
    } catch (error: any) {
      console.warn('⚠️ Could not check disk space:', error.message);
      // Continue anyway if we can't check
      return { hasSpace: true };
    }
  }

  /**
   * Clean up downloaded files using TempFileManager
   */
  static async cleanupFile(filePath: string): Promise<void> {
    await tempFileManager.cleanup(filePath);
  }
}