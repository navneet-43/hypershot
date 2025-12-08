import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SmartUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  originalSizeMB?: number;
  finalSizeMB?: number;
  isActualVideo?: boolean;
  method?: string;
}

export class SmartVideoUploadService {
  static async uploadSmartVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<SmartUploadResult> {
    console.log('Starting smart video upload with size-based optimization');
    
    try {
      // Extract file ID
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/smart_upload_${Date.now()}.mp4`;
      
      console.log('Downloading Google Drive video');
      
      // Download with aria2c for speed
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `aria2c -x 8 -s 8 -k 1M --file-allocation=none --check-certificate=false -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand, { timeout: 600000 });
      
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
      let method = 'direct';
      
      // Smart optimization: only compress if over 95MB to ensure under 100MB
      if (originalSizeMB > 95) {
        console.log('File over 95MB - optimizing to stay under 100MB for actual video upload');
        
        const optimizedFile = `/tmp/smart_optimized_${Date.now()}.mp4`;
        
        // Get video duration for bitrate calculation
        const durationSeconds = await this.getVideoDuration(downloadFile);
        
        // Target 90MB to stay safely under 100MB
        const targetSizeMB = 90;
        const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / durationSeconds);
        
        console.log(`Optimizing to ${targetSizeMB}MB (${targetBitrate}kbps) to ensure actual video upload`);
        
        // Optimize with high quality settings but target size
        const optimizeCommand = `ffmpeg -i "${downloadFile}" -c:v libx264 -preset slow -crf 20 -b:v ${targetBitrate}k -maxrate ${Math.floor(targetBitrate * 1.1)}k -bufsize ${Math.floor(targetBitrate * 2)}k -c:a aac -b:a 128k -movflags +faststart "${optimizedFile}"`;
        
        await execAsync(optimizeCommand, { timeout: 900000 }); // 15 minute timeout
        
        if (fs.existsSync(optimizedFile)) {
          const optimizedStats = fs.statSync(optimizedFile);
          const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
          
          console.log(`Optimized to: ${optimizedSizeMB.toFixed(1)}MB`);
          
          if (optimizedSizeMB < 100) {
            fs.unlinkSync(downloadFile);
            finalVideoFile = optimizedFile;
            finalSizeMB = optimizedSizeMB;
            method = 'optimized_under_100mb';
          } else {
            console.log('Optimization still over 100MB, using original');
            fs.unlinkSync(optimizedFile);
            method = 'original_over_100mb';
          }
        }
      }
      
      console.log(`Uploading ${finalSizeMB.toFixed(1)}MB video using ${method} method`);
      
      // Upload to Facebook
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(finalVideoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Smart Video Upload - ${finalSizeMB.toFixed(1)}MB`);
      formData.append('description', `Smart Upload (${method}) - ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB`);
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
            content: `Smart Upload (${method}) - ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up
          fs.unlinkSync(finalVideoFile);
          
          // Wait for Facebook processing
          await new Promise(resolve => setTimeout(resolve, 15000));
          
          // Verify it's an actual video
          const isActualVideo = await this.verifyVideoUpload(pageId, accessToken);
          
          console.log('Upload verification complete');
          console.log('Is Actual Video:', isActualVideo ? 'YES' : 'NO');
          console.log('Method Used:', method);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            originalSizeMB: originalSizeMB,
            finalSizeMB: finalSizeMB,
            isActualVideo: isActualVideo,
            method: method
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
        isActualVideo: false,
        method: method
      };
      
    } catch (error) {
      console.log('Smart upload error:', (error as Error).message);
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
      return duration > 0 ? duration : 300; // Default to 5 minutes if detection fails
    } catch (error) {
      console.log('Duration detection failed, using default');
      return 300;
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
            post.message?.includes('Smart Upload') &&
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