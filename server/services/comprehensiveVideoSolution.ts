import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import FormData from 'form-data';

const execAsync = promisify(exec);

interface VideoUploadResult {
  success: boolean;
  method: string;
  sizeMB: number;
  facebookVideoId?: string;
  isActualVideo: boolean;
  quality: 'original' | 'optimized' | 'compressed';
  error?: string;
}

export class ComprehensiveVideoSolution {
  
  async downloadGoogleDriveVideo(fileId: string): Promise<string> {
    const outputFile = `/tmp/gdrive_${Date.now()}.mp4`;
    
    console.log('Downloading with gdown for reliable access');
    
    try {
      // Use gdown for reliable Google Drive downloads
      const gdownCmd = `gdown https://drive.google.com/uc?id=${fileId} -O "${outputFile}"`;
      await execAsync(gdownCmd, { timeout: 1800000 }); // 30 minutes
      
      if (!fs.existsSync(outputFile)) {
        throw new Error('Download failed - file not created');
      }
      
      const stats = fs.statSync(outputFile);
      const sizeMB = stats.size / (1024 * 1024);
      
      console.log(`Downloaded: ${sizeMB.toFixed(1)}MB`);
      
      if (sizeMB < 10) {
        fs.unlinkSync(outputFile);
        throw new Error('Download too small - likely failed');
      }
      
      return outputFile;
      
    } catch (error) {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
      throw error;
    }
  }
  
  async createOptimizedVersion(inputFile: string, targetSizeMB: number = 95): Promise<string> {
    const outputFile = `/tmp/optimized_${Date.now()}.mp4`;
    
    console.log(`Creating optimized version targeting ${targetSizeMB}MB`);
    
    try {
      const stats = fs.statSync(inputFile);
      const originalSizeMB = stats.size / (1024 * 1024);
      
      // Calculate bitrate for target size
      const targetBitrate = Math.floor((targetSizeMB * 8 * 1024) / 60); // Assume 60 seconds average
      
      const ffmpegCmd = `ffmpeg -i "${inputFile}" -c:v libx264 -preset medium -crf 23 -maxrate ${targetBitrate}k -bufsize ${targetBitrate * 2}k -c:a aac -b:a 128k "${outputFile}"`;
      
      await execAsync(ffmpegCmd, { timeout: 1800000 });
      
      if (!fs.existsSync(outputFile)) {
        throw new Error('Optimization failed');
      }
      
      const newStats = fs.statSync(outputFile);
      const newSizeMB = newStats.size / (1024 * 1024);
      
      console.log(`Optimized: ${originalSizeMB.toFixed(1)}MB → ${newSizeMB.toFixed(1)}MB`);
      
      return outputFile;
      
    } catch (error) {
      if (fs.existsSync(outputFile)) {
        fs.unlinkSync(outputFile);
      }
      throw error;
    }
  }
  
  async uploadToFacebook(
    filePath: string, 
    pageId: string, 
    accessToken: string,
    description: string
  ): Promise<VideoUploadResult> {
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    
    console.log(`Uploading ${sizeMB.toFixed(1)}MB to Facebook`);
    
    try {
      const formData = new FormData();
      const fileStream = fs.createReadStream(filePath);
      
      formData.append('access_token', accessToken);
      formData.append('title', `Video Upload - ${sizeMB.toFixed(1)}MB`);
      formData.append('description', description);
      formData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      formData.append('published', 'true');
      formData.append('source', fileStream, {
        filename: 'video.mp4',
        contentType: 'video/mp4'
      });
      
      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });
      
      if (response.ok) {
        const result = await response.json() as any;
        
        if (result.id) {
          // Verify if it's an actual video
          const verifyUrl = `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,attachments&access_token=${accessToken}&limit=5`;
          const verifyResponse = await fetch(verifyUrl);
          
          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json() as any;
            const recentPost = verifyData.data?.find((post: any) => 
              post.attachments?.data?.[0]?.type === 'video_inline'
            );
            
            const isActualVideo = !!recentPost;
            
            return {
              success: true,
              method: sizeMB > 100 ? 'large_file_upload' : 'standard_upload',
              sizeMB: sizeMB,
              facebookVideoId: result.id,
              isActualVideo: isActualVideo,
              quality: description.includes('Original') ? 'original' : 'optimized'
            };
          }
        }
      }
      
      const errorText = await response.text();
      console.log('Upload failed:', response.status, errorText);
      
      return {
        success: false,
        method: 'failed_upload',
        sizeMB: sizeMB,
        isActualVideo: false,
        quality: 'original',
        error: `Upload failed: ${response.status} - ${errorText}`
      };
      
    } catch (error) {
      return {
        success: false,
        method: 'upload_error',
        sizeMB: sizeMB,
        isActualVideo: false,
        quality: 'original',
        error: (error as Error).message
      };
    }
  }
  
  async processGoogleDriveVideo(
    fileId: string,
    pageId: string,
    accessToken: string,
    preserveQuality: boolean = true
  ): Promise<{
    originalResult?: VideoUploadResult;
    optimizedResult?: VideoUploadResult;
    recommendation: string;
  }> {
    
    console.log('Starting comprehensive video processing');
    
    let originalFile: string | null = null;
    let optimizedFile: string | null = null;
    
    try {
      // Download original file
      originalFile = await this.downloadGoogleDriveVideo(fileId);
      
      const stats = fs.statSync(originalFile);
      const originalSizeMB = stats.size / (1024 * 1024);
      
      console.log(`Processing ${originalSizeMB.toFixed(1)}MB video`);
      
      let originalResult: VideoUploadResult | undefined;
      let optimizedResult: VideoUploadResult | undefined;
      
      // Always try original first to test size limits
      console.log('Testing original file upload');
      originalResult = await this.uploadToFacebook(
        originalFile,
        pageId,
        accessToken,
        `Original Quality - ${originalSizeMB.toFixed(1)}MB - Quality Test`
      );
      
      // If original didn't work as video and user wants quality preservation
      if (!originalResult.isActualVideo && !preserveQuality) {
        console.log('Creating optimized version for actual video upload');
        optimizedFile = await this.createOptimizedVersion(originalFile, 95);
        
        optimizedResult = await this.uploadToFacebook(
          optimizedFile,
          pageId,
          accessToken,
          `Optimized Quality - Facebook Video Compatibility`
        );
      }
      
      // Determine recommendation
      let recommendation: string;
      
      if (originalResult.isActualVideo) {
        recommendation = `SUCCESS: ${originalSizeMB.toFixed(1)}MB uploaded as actual video with original quality preserved`;
      } else if (preserveQuality) {
        recommendation = `Large file uploaded as text post with video link - original quality preserved but not embedded video`;
      } else if (optimizedResult?.isActualVideo) {
        recommendation = `Optimized version uploaded as actual video - slight quality reduction for Facebook compatibility`;
      } else {
        recommendation = `Facebook size limitations prevent actual video upload - consider splitting or accepting link post`;
      }
      
      return {
        originalResult,
        optimizedResult,
        recommendation
      };
      
    } finally {
      // Cleanup
      if (originalFile && fs.existsSync(originalFile)) {
        fs.unlinkSync(originalFile);
      }
      if (optimizedFile && fs.existsSync(optimizedFile)) {
        fs.unlinkSync(optimizedFile);
      }
    }
  }
}