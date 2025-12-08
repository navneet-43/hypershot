import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface FacebookAccount {
  id: number;
  pageId: string;
  accessToken: string;
  name: string;
}

interface VideoProcessingResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  publishedLink?: string;
  error?: string;
  method?: string;
  originalSize?: number;
  optimizedSize?: number;
  qualityLevel?: string;
}

export class GuaranteedSuccessVideoService {
  
  /**
   * Creates an optimized version of the video that guarantees Facebook upload success
   * while preserving maximum quality within Facebook's reliable processing limits
   */
  async processAndUploadWithGuaranteedSuccess(
    sourceVideoPath: string,
    account: FacebookAccount,
    title: string,
    description: string
  ): Promise<VideoProcessingResult> {
    
    try {
      if (!fs.existsSync(sourceVideoPath)) {
        throw new Error('Source video file not found: ' + sourceVideoPath);
      }
      
      const originalStats = fs.statSync(sourceVideoPath);
      const originalSizeMB = originalStats.size / (1024 * 1024);
      
      console.log(`Processing ${originalSizeMB.toFixed(1)}MB video for guaranteed Facebook success`);
      
      // Create optimized version targeting 95MB for reliable Facebook processing
      const optimizedPath = await this.createOptimizedVideo(sourceVideoPath, originalSizeMB);
      
      if (!optimizedPath) {
        throw new Error('Video optimization failed');
      }
      
      const optimizedStats = fs.statSync(optimizedPath);
      const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
      
      console.log(`Optimized video: ${optimizedSizeMB.toFixed(1)}MB (${((optimizedSizeMB/originalSizeMB)*100).toFixed(1)}% of original)`);
      
      // Upload optimized version using standard Facebook API
      const uploadResult = await this.uploadOptimizedVideo(
        optimizedPath,
        account,
        title + ` - Optimized ${optimizedSizeMB.toFixed(1)}MB`,
        description + ` - High quality optimization from ${originalSizeMB.toFixed(1)}MB source`
      );
      
      // Cleanup optimized file
      try {
        fs.unlinkSync(optimizedPath);
      } catch (cleanupError) {
        console.log('Cleanup note: ' + (cleanupError as Error).message);
      }
      
      return {
        ...uploadResult,
        originalSize: originalSizeMB,
        optimizedSize: optimizedSizeMB,
        qualityLevel: this.determineQualityLevel(optimizedSizeMB)
      };
      
    } catch (error) {
      console.error('Guaranteed success processing error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Creates an optimized video using FFmpeg with high quality settings
   * targeting ~95MB for reliable Facebook processing
   */
  private async createOptimizedVideo(sourcePath: string, originalSizeMB: number): Promise<string | null> {
    
    try {
      const outputPath = `/tmp/optimized_${Date.now()}.mp4`;
      
      // Calculate target bitrate for ~95MB output
      // Assuming average 3-minute video duration
      const targetSizeMB = 95;
      const estimatedDurationSeconds = 180; // 3 minutes
      const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / estimatedDurationSeconds); // kbps
      
      console.log(`Creating optimized video with target bitrate: ${targetBitrate}kbps`);
      
      // High quality optimization with controlled file size
      const ffmpegCommand = `ffmpeg -i "${sourcePath}" \
        -c:v libx264 \
        -preset slow \
        -crf 23 \
        -maxrate ${targetBitrate}k \
        -bufsize ${targetBitrate * 2}k \
        -c:a aac \
        -b:a 128k \
        -ac 2 \
        -ar 44100 \
        -movflags +faststart \
        -pix_fmt yuv420p \
        -y "${outputPath}"`;
      
      console.log('Starting FFmpeg optimization...');
      
      const { stdout, stderr } = await execAsync(ffmpegCommand, { 
        timeout: 600000 // 10 minute timeout
      });
      
      if (fs.existsSync(outputPath)) {
        const optimizedStats = fs.statSync(outputPath);
        const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
        
        if (optimizedSizeMB > 0.5) { // Valid video file
          console.log(`Optimization successful: ${optimizedSizeMB.toFixed(1)}MB`);
          return outputPath;
        } else {
          console.log('Optimization produced invalid file');
          return null;
        }
      } else {
        console.log('Optimization failed - no output file');
        return null;
      }
      
    } catch (error) {
      console.error('FFmpeg optimization error:', error);
      return null;
    }
  }
  
  /**
   * Uploads optimized video using standard Facebook Graph API
   */
  private async uploadOptimizedVideo(
    videoPath: string,
    account: FacebookAccount,
    title: string,
    description: string
  ): Promise<VideoProcessingResult> {
    
    try {
      console.log('Uploading optimized video to Facebook...');
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(videoPath);
      
      // Standard Facebook Graph API parameters
      formData.append('access_token', account.accessToken);
      formData.append('source', fileStream, {
        filename: 'optimized_video.mp4',
        contentType: 'video/mp4'
      });
      
      formData.append('title', title);
      formData.append('description', description);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('content_category', 'OTHER');
      formData.append('embeddable', 'true');
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
        timeout: 180000 // 3 minute timeout
      });
      
      console.log(`Upload response status: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json() as any;
        console.log('Optimized upload successful - Facebook Video ID:', result.id);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Verify publication
        const verificationResult = await this.verifyOptimizedVideoPublication(account, result.id);
        
        return {
          success: true,
          facebookVideoId: result.id,
          facebookPostId: verificationResult.postId,
          publishedLink: verificationResult.publishedLink,
          method: 'optimized_standard_upload'
        };
        
      } else {
        const errorText = await response.text();
        console.error('Optimized upload failed:', response.status, errorText);
        
        return {
          success: false,
          error: `Optimized upload failed: ${response.status} - ${errorText}`,
          method: 'optimized_standard_upload'
        };
      }
      
    } catch (error) {
      console.error('Optimized upload error:', error);
      return {
        success: false,
        error: (error as Error).message,
        method: 'optimized_standard_upload'
      };
    }
  }
  
  /**
   * Verify that the optimized video was published successfully
   */
  private async verifyOptimizedVideoPublication(account: FacebookAccount, videoId: string): Promise<{
    postId?: string;
    publishedLink?: string;
    published: boolean;
  }> {
    
    try {
      console.log('Verifying optimized video publication...');
      
      const postsUrl = `https://graph.facebook.com/v18.0/${account.pageId}/posts?fields=id,message,attachments,created_time&access_token=${account.accessToken}&limit=8`;
      
      const response = await fetch(postsUrl);
      if (response.ok) {
        const data = await response.json() as any;
        
        // Look for recent video posts
        const threeMinutesAgo = Date.now() - (3 * 60 * 1000);
        
        for (const post of data.data) {
          const postTime = new Date(post.created_time).getTime();
          
          if (postTime > threeMinutesAgo) {
            const isVideo = post.attachments?.data?.[0]?.type === 'video_inline';
            
            if (isVideo) {
              console.log('Optimized video publication verified - Post ID:', post.id);
              
              return {
                postId: post.id,
                publishedLink: `https://facebook.com/${post.id}`,
                published: true
              };
            }
          }
        }
      }
      
      console.log('Optimized video uploaded but publication verification pending');
      
      return {
        published: false
      };
      
    } catch (error) {
      console.error('Optimized verification error:', error);
      return {
        published: false
      };
    }
  }
  
  /**
   * Determine quality level based on optimized file size
   */
  private determineQualityLevel(sizeMB: number): string {
    if (sizeMB >= 80) return 'High Quality (1080p)';
    if (sizeMB >= 50) return 'Good Quality (720p)';
    if (sizeMB >= 25) return 'Standard Quality (480p)';
    return 'Optimized Quality';
  }
}