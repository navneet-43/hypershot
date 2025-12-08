import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface OptimizedLargeVideoResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  originalSizeMB?: number;
  finalSizeMB?: number;
  isActualVideo?: boolean;
}

export class OptimizedLargeVideoService {
  static async uploadOptimizedLargeVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<OptimizedLargeVideoResult> {
    console.log('Processing large Google Drive video with optimization');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/large_video_${Date.now()}.mp4`;
      
      console.log('Downloading large Google Drive video');
      
      // Download with wget for reliability
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `wget --timeout=300 --tries=3 -O "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand);
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Download failed');
      }
      
      const downloadStats = fs.statSync(downloadFile);
      const originalSizeMB = downloadStats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${originalSizeMB.toFixed(1)}MB`);
      
      if (originalSizeMB < 5) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      let finalVideoFile = downloadFile;
      let finalSizeMB = originalSizeMB;
      
      // Optimize if over 95MB to stay safely under 100MB limit
      if (originalSizeMB > 95) {
        console.log('Optimizing large video to stay under 100MB limit');
        
        const optimizedFile = `/tmp/optimized_large_${Date.now()}.mp4`;
        
        // Calculate target bitrate to achieve ~90MB file size
        const targetSizeMB = 90;
        const durationSeconds = await this.getVideoDuration(downloadFile);
        const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / durationSeconds); // kbps
        
        console.log(`Target size: ${targetSizeMB}MB, Duration: ${durationSeconds}s, Target bitrate: ${targetBitrate}kbps`);
        
        // Optimize with calculated bitrate
        const optimizeCommand = `ffmpeg -i "${downloadFile}" -c:v libx264 -preset medium -b:v ${targetBitrate}k -maxrate ${Math.floor(targetBitrate * 1.2)}k -bufsize ${Math.floor(targetBitrate * 2)}k -c:a aac -b:a 128k -movflags +faststart "${optimizedFile}"`;
        
        await execAsync(optimizeCommand, { timeout: 600000 }); // 10 minute timeout
        
        if (fs.existsSync(optimizedFile)) {
          const optimizedStats = fs.statSync(optimizedFile);
          const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
          
          console.log(`Optimized to: ${optimizedSizeMB.toFixed(1)}MB`);
          
          if (optimizedSizeMB < 100) {
            fs.unlinkSync(downloadFile);
            finalVideoFile = optimizedFile;
            finalSizeMB = optimizedSizeMB;
          } else {
            console.log('Optimization did not achieve target size, using original');
            fs.unlinkSync(optimizedFile);
          }
        }
      }
      
      console.log(`Uploading ${finalSizeMB.toFixed(1)}MB video to Facebook`);
      
      // Upload to Facebook
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(finalVideoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Optimized Large Video - ${finalSizeMB.toFixed(1)}MB`);
      formData.append('description', `Large Video Optimized Upload - ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB`);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (uploadResponse.ok) {
        const uploadResult = await uploadResponse.json() as any;
        
        if (uploadResult.id) {
          console.log('Video uploaded successfully');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Large Video Optimized Upload - ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(finalVideoFile);
          
          // Wait for Facebook processing
          await new Promise(resolve => setTimeout(resolve, 10000));
          
          // Verify it's an actual video
          const isActualVideo = await this.verifyVideoUpload(pageId, accessToken);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            originalSizeMB: originalSizeMB,
            finalSizeMB: finalSizeMB,
            isActualVideo: isActualVideo
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Upload error:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(finalVideoFile);
      
      return {
        success: false,
        error: `Upload failed: ${uploadResponse.status} - ${errorText}`,
        originalSizeMB: originalSizeMB,
        finalSizeMB: finalSizeMB,
        isActualVideo: false
      };
      
    } catch (error) {
      console.log('Optimized large video error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        isActualVideo: false
      };
    }
  }
  
  private static async getVideoDuration(videoFile: string): Promise<number> {
    try {
      const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoFile}"`;
      const result = await execAsync(command);
      const duration = parseFloat(result.stdout.trim());
      return duration > 0 ? duration : 60; // Default to 60 seconds if detection fails
    } catch (error) {
      console.log('Duration detection failed, using default');
      return 60;
    }
  }
  
  private static async verifyVideoUpload(
    pageId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Check posts for video attachment
      const postsUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,attachments&access_token=${accessToken}&limit=5`;
      const response = await fetch(postsUrl);
      
      if (response.ok) {
        const data = await response.json() as any;
        
        if (data.data) {
          const videoPost = data.data.find((post: any) => 
            post.message?.includes('Large Video Optimized Upload') &&
            post.attachments &&
            post.attachments.data &&
            post.attachments.data[0].type === 'video_inline'
          );
          
          return !!videoPost;
        }
      }
      
      return false;
    } catch (error) {
      console.log('Verification error:', (error as Error).message);
      return false;
    }
  }
}