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

interface OptimizationResult {
  success: boolean;
  facebookVideoId?: string;
  facebookPostId?: string;
  publishedLink?: string;
  error?: string;
  originalSize?: number;
  finalSize?: number;
  compressionRatio?: string;
  processingTime?: number;
}

export class RobustVideoOptimizer {
  
  async optimizeAndUpload(
    sourceVideoPath: string,
    account: FacebookAccount
  ): Promise<OptimizationResult> {
    
    const startTime = Date.now();
    
    try {
      if (!fs.existsSync(sourceVideoPath)) {
        throw new Error('Source video not found: ' + sourceVideoPath);
      }
      
      const originalStats = fs.statSync(sourceVideoPath);
      const originalSizeMB = originalStats.size / (1024 * 1024);
      
      console.log(`Starting robust optimization of ${originalSizeMB.toFixed(1)}MB video`);
      
      // Progressive optimization approach - try multiple methods
      let optimizedPath = await this.createHighQualityOptimized(sourceVideoPath, originalSizeMB);
      
      if (!optimizedPath) {
        console.log('High quality optimization failed, trying standard optimization');
        optimizedPath = await this.createStandardOptimized(sourceVideoPath, originalSizeMB);
      }
      
      if (!optimizedPath) {
        console.log('Standard optimization failed, trying aggressive optimization');
        optimizedPath = await this.createAggressiveOptimized(sourceVideoPath, originalSizeMB);
      }
      
      if (!optimizedPath) {
        throw new Error('All optimization methods failed');
      }
      
      const finalStats = fs.statSync(optimizedPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);
      const compressionRatio = ((finalSizeMB / originalSizeMB) * 100).toFixed(1) + '%';
      
      console.log(`Optimization successful: ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB (${compressionRatio})`);
      
      // Upload optimized video
      const uploadResult = await this.uploadOptimizedVideo(optimizedPath, account, originalSizeMB, finalSizeMB);
      
      // Cleanup
      try {
        fs.unlinkSync(optimizedPath);
      } catch (cleanupError) {
        console.log('Cleanup note:', (cleanupError as Error).message);
      }
      
      const processingTime = (Date.now() - startTime) / 1000;
      
      return {
        ...uploadResult,
        originalSize: originalSizeMB,
        finalSize: finalSizeMB,
        compressionRatio: compressionRatio,
        processingTime: processingTime
      };
      
    } catch (error) {
      console.error('Robust optimization error:', error);
      return {
        success: false,
        error: (error as Error).message,
        originalSize: fs.existsSync(sourceVideoPath) ? fs.statSync(sourceVideoPath).size / (1024 * 1024) : undefined
      };
    }
  }
  
  /**
   * High quality optimization targeting 85-95MB
   */
  private async createHighQualityOptimized(sourcePath: string, originalSizeMB: number): Promise<string | null> {
    try {
      const outputPath = `/tmp/high_quality_${Date.now()}.mp4`;
      
      // Calculate target bitrate for ~90MB output
      const targetSizeMB = 90;
      const estimatedDurationSeconds = Math.max(180, originalSizeMB * 4); // Estimate duration
      const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / estimatedDurationSeconds);
      
      console.log(`High quality optimization: target ${targetBitrate}kbps for ${targetSizeMB}MB`);
      
      const command = `ffmpeg -i "${sourcePath}" \
        -c:v libx264 \
        -preset medium \
        -crf 22 \
        -maxrate ${targetBitrate}k \
        -bufsize ${targetBitrate * 2}k \
        -c:a aac \
        -b:a 128k \
        -ac 2 \
        -ar 44100 \
        -movflags +faststart \
        -pix_fmt yuv420p \
        -profile:v high \
        -level 4.0 \
        -y "${outputPath}"`;
      
      await execAsync(command, { timeout: 900000 }); // 15 minute timeout
      
      return this.validateOptimizedFile(outputPath, 50, 120);
      
    } catch (error) {
      console.log('High quality optimization failed:', (error as Error).message);
      return null;
    }
  }
  
  /**
   * Standard optimization targeting 70-85MB
   */
  private async createStandardOptimized(sourcePath: string, originalSizeMB: number): Promise<string | null> {
    try {
      const outputPath = `/tmp/standard_${Date.now()}.mp4`;
      
      const targetSizeMB = 75;
      const estimatedDurationSeconds = Math.max(180, originalSizeMB * 4);
      const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / estimatedDurationSeconds);
      
      console.log(`Standard optimization: target ${targetBitrate}kbps for ${targetSizeMB}MB`);
      
      const command = `ffmpeg -i "${sourcePath}" \
        -c:v libx264 \
        -preset fast \
        -crf 25 \
        -maxrate ${targetBitrate}k \
        -bufsize ${targetBitrate * 1.5}k \
        -c:a aac \
        -b:a 96k \
        -ac 2 \
        -ar 44100 \
        -movflags +faststart \
        -pix_fmt yuv420p \
        -y "${outputPath}"`;
      
      await execAsync(command, { timeout: 600000 }); // 10 minute timeout
      
      return this.validateOptimizedFile(outputPath, 30, 100);
      
    } catch (error) {
      console.log('Standard optimization failed:', (error as Error).message);
      return null;
    }
  }
  
  /**
   * Aggressive optimization targeting 50-70MB
   */
  private async createAggressiveOptimized(sourcePath: string, originalSizeMB: number): Promise<string | null> {
    try {
      const outputPath = `/tmp/aggressive_${Date.now()}.mp4`;
      
      const targetSizeMB = 60;
      const estimatedDurationSeconds = Math.max(180, originalSizeMB * 4);
      const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / estimatedDurationSeconds);
      
      console.log(`Aggressive optimization: target ${targetBitrate}kbps for ${targetSizeMB}MB`);
      
      const command = `ffmpeg -i "${sourcePath}" \
        -c:v libx264 \
        -preset veryfast \
        -crf 28 \
        -maxrate ${targetBitrate}k \
        -bufsize ${targetBitrate}k \
        -c:a aac \
        -b:a 64k \
        -ac 2 \
        -ar 44100 \
        -movflags +faststart \
        -pix_fmt yuv420p \
        -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
        -y "${outputPath}"`;
      
      await execAsync(command, { timeout: 300000 }); // 5 minute timeout
      
      return this.validateOptimizedFile(outputPath, 20, 80);
      
    } catch (error) {
      console.log('Aggressive optimization failed:', (error as Error).message);
      return null;
    }
  }
  
  /**
   * Validate that the optimized file is valid and within size range
   */
  private validateOptimizedFile(filePath: string, minSizeMB: number, maxSizeMB: number): string | null {
    if (!fs.existsSync(filePath)) {
      console.log('Optimized file does not exist');
      return null;
    }
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    if (sizeMB < minSizeMB) {
      console.log(`File too small: ${sizeMB.toFixed(1)}MB (min: ${minSizeMB}MB)`);
      try { fs.unlinkSync(filePath); } catch {}
      return null;
    }
    
    if (sizeMB > maxSizeMB) {
      console.log(`File too large: ${sizeMB.toFixed(1)}MB (max: ${maxSizeMB}MB)`);
      try { fs.unlinkSync(filePath); } catch {}
      return null;
    }
    
    console.log(`Optimization valid: ${sizeMB.toFixed(1)}MB`);
    return filePath;
  }
  
  /**
   * Upload optimized video to Facebook
   */
  private async uploadOptimizedVideo(
    videoPath: string,
    account: FacebookAccount,
    originalSizeMB: number,
    finalSizeMB: number
  ): Promise<OptimizationResult> {
    
    try {
      console.log('Uploading optimized video to Facebook...');
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(videoPath);
      
      formData.append('access_token', account.accessToken);
      formData.append('source', fileStream, {
        filename: 'optimized_video.mp4',
        contentType: 'video/mp4'
      });
      
      const title = `Google Drive Video - Optimized ${finalSizeMB.toFixed(1)}MB`;
      const description = `High quality optimized video from ${originalSizeMB.toFixed(1)}MB Google Drive source - Compression ratio: ${((finalSizeMB/originalSizeMB)*100).toFixed(1)}% - Preserved quality with guaranteed Facebook compatibility`;
      
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
        headers: formData.getHeaders()
      });
      
      console.log(`Upload response: ${response.status}`);
      
      if (response.ok) {
        const result = await response.json() as any;
        console.log('Upload successful - Facebook Video ID:', result.id);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Verify publication
        const verification = await this.verifyPublication(account, result.id);
        
        return {
          success: true,
          facebookVideoId: result.id,
          facebookPostId: verification.postId,
          publishedLink: verification.publishedLink
        };
        
      } else {
        const errorText = await response.text();
        console.error('Upload failed:', response.status, errorText);
        
        return {
          success: false,
          error: `Upload failed: ${response.status} - ${errorText}`
        };
      }
      
    } catch (error) {
      console.error('Upload error:', error);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Verify video publication on Facebook
   */
  private async verifyPublication(account: FacebookAccount, videoId: string): Promise<{
    postId?: string;
    publishedLink?: string;
  }> {
    
    try {
      const postsUrl = `https://graph.facebook.com/v18.0/${account.pageId}/posts?fields=id,message,attachments,created_time&access_token=${account.accessToken}&limit=5`;
      
      const response = await fetch(postsUrl);
      if (response.ok) {
        const data = await response.json() as any;
        
        const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
        
        for (const post of data.data) {
          const postTime = new Date(post.created_time).getTime();
          
          if (postTime > twoMinutesAgo && post.attachments?.data?.[0]?.type === 'video_inline') {
            console.log('Video publication verified - Post ID:', post.id);
            
            return {
              postId: post.id,
              publishedLink: `https://facebook.com/${post.id}`
            };
          }
        }
      }
      
      return {};
      
    } catch (error) {
      console.error('Verification error:', error);
      return {};
    }
  }
}