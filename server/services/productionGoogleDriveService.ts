import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ProductionUploadResult {
  success: boolean;
  videoId?: string;
  postId?: number;
  error?: any;
  originalSizeMB?: number;
  finalSizeMB?: number;
  optimized?: boolean;
}

export class ProductionGoogleDriveService {
  static async uploadGoogleDriveVideo(
    googleDriveUrl: string,
    accountId: number,
    pageId: string,
    accessToken: string,
    storage: any
  ): Promise<ProductionUploadResult> {
    console.log('Processing Google Drive video for production upload');
    
    try {
      // Extract file ID from Google Drive URL
      const fileIdMatch = googleDriveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (!fileIdMatch) {
        throw new Error('Invalid Google Drive URL format');
      }
      
      const fileId = fileIdMatch[1];
      const downloadFile = `/tmp/production_${Date.now()}.mp4`;
      
      console.log('Downloading Google Drive video');
      
      // Download using aria2c for optimal speed and reliability
      const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
      const downloadCommand = `aria2c -x 8 -s 8 -k 1M --file-allocation=none --check-certificate=false -o "${downloadFile}" "${downloadUrl}"`;
      
      await execAsync(downloadCommand, { timeout: 600000 });
      
      if (!fs.existsSync(downloadFile)) {
        throw new Error('Video download failed - file may be restricted');
      }
      
      const downloadStats = fs.statSync(downloadFile);
      const originalSizeMB = downloadStats.size / (1024 * 1024);
      
      console.log(`Downloaded video: ${originalSizeMB.toFixed(1)}MB`);
      
      if (originalSizeMB < 5) {
        fs.unlinkSync(downloadFile);
        throw new Error('Downloaded file too small - may be access restricted');
      }
      
      let finalVideoFile = downloadFile;
      let finalSizeMB = originalSizeMB;
      let optimized = false;
      
      // Smart optimization: compress only if over 95MB to ensure actual video upload
      if (originalSizeMB > 95) {
        console.log(`File is ${originalSizeMB.toFixed(1)}MB - optimizing to ensure actual video upload (not text post)`);
        
        const optimizedFile = `/tmp/production_optimized_${Date.now()}.mp4`;
        
        // Get video duration for precise bitrate calculation
        const durationSeconds = await this.getVideoDuration(downloadFile);
        
        // Calculate bitrate for 90MB target (staying safely under 100MB)
        const targetSizeMB = 90;
        const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / durationSeconds);
        
        console.log(`Optimizing to ${targetSizeMB}MB target (${targetBitrate}kbps) for guaranteed video upload`);
        
        // High-quality optimization with size control
        const optimizeCommand = `ffmpeg -i "${downloadFile}" -c:v libx264 -preset slow -crf 18 -b:v ${targetBitrate}k -maxrate ${Math.floor(targetBitrate * 1.05)}k -bufsize ${Math.floor(targetBitrate * 2)}k -c:a aac -b:a 128k -movflags +faststart "${optimizedFile}"`;
        
        await execAsync(optimizeCommand, { timeout: 900000 });
        
        if (fs.existsSync(optimizedFile)) {
          const optimizedStats = fs.statSync(optimizedFile);
          const optimizedSizeMB = optimizedStats.size / (1024 * 1024);
          
          console.log(`Optimization complete: ${optimizedSizeMB.toFixed(1)}MB`);
          
          if (optimizedSizeMB < 100) {
            // Use optimized version
            fs.unlinkSync(downloadFile);
            finalVideoFile = optimizedFile;
            finalSizeMB = optimizedSizeMB;
            optimized = true;
          } else {
            // Optimization didn't achieve target, clean up
            fs.unlinkSync(optimizedFile);
            console.log('Optimization unsuccessful, using original file');
          }
        }
      }
      
      console.log(`Uploading ${finalSizeMB.toFixed(1)}MB video to Facebook (${optimized ? 'optimized' : 'original'})`);
      
      // Upload to Facebook using video API
      const fetch = (await import('node-fetch')).default;
      const FormData = (await import('form-data')).default;
      
      const formData = new FormData();
      const fileStream = fs.createReadStream(finalVideoFile);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Google Drive Video - ${finalSizeMB.toFixed(1)}MB`);
      formData.append('description', `Google Drive Upload - ${originalSizeMB.toFixed(1)}MB${optimized ? ` optimized to ${finalSizeMB.toFixed(1)}MB` : ''}`);
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
          console.log('Video uploaded successfully to Facebook');
          console.log('Facebook Video ID:', uploadResult.id);
          
          // Save to database
          const newPost = await storage.createPost({
            userId: 3,
            accountId: accountId,
            content: `Google Drive Upload - ${originalSizeMB.toFixed(1)}MB${optimized ? ` optimized to ${finalSizeMB.toFixed(1)}MB` : ''}`,
            mediaUrl: googleDriveUrl,
            mediaType: 'video',
            language: 'en',
            status: 'published',
            publishedAt: new Date()
          });
          
          // Clean up temporary files
          fs.unlinkSync(finalVideoFile);
          
          console.log('Upload process completed successfully');
          console.log('Database Post ID:', newPost.id);
          console.log('Live URL: https://facebook.com/' + uploadResult.id);
          
          return {
            success: true,
            videoId: uploadResult.id,
            postId: newPost.id,
            originalSizeMB: originalSizeMB,
            finalSizeMB: finalSizeMB,
            optimized: optimized
          };
        }
      }
      
      const errorText = await uploadResponse.text();
      console.log('Facebook upload failed:', uploadResponse.status, errorText);
      
      // Clean up on failure
      fs.unlinkSync(finalVideoFile);
      
      return {
        success: false,
        error: `Facebook upload failed: ${uploadResponse.status} - ${errorText}`,
        originalSizeMB: originalSizeMB,
        finalSizeMB: finalSizeMB,
        optimized: optimized
      };
      
    } catch (error) {
      console.log('Production upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
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
      console.log('Duration detection failed, using default duration');
      return 300;
    }
  }
}