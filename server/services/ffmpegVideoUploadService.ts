import { FFmpegCompleteDownloadService } from './ffmpegCompleteDownloadService';
import { StandardFacebookUploadService } from './standardFacebookUploadService';
import { storage } from '../storage';
import * as fs from 'fs';

export class FFmpegVideoUploadService {
  
  static async uploadGoogleDriveVideoWithFFmpeg(
    googleDriveUrl: string,
    description: string = 'FFmpeg Complete Download - Google Drive Video Uploaded'
  ): Promise<{ success: boolean; videoId?: string; sizeMB?: number; error?: string; stage?: string }> {
    
    console.log('FFMPEG COMPLETE VIDEO UPLOAD PROCESS');
    console.log('URL:', googleDriveUrl);
    console.log('Approach: FFmpeg download + Standard Facebook upload');
    
    let downloadedFile: string | undefined;
    let optimizedFile: string | undefined;
    
    try {
      // Get Facebook account
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
      
      if (!tamilAccount) {
        return { success: false, error: 'Alright Tamil Facebook account not found', stage: 'account_lookup' };
      }
      
      console.log('Target page: Alright Tamil');
      
      // Step 1: Download complete video using FFmpeg
      console.log('Step 1: FFmpeg complete download');
      
      const downloadResult = await FFmpegCompleteDownloadService.downloadCompleteVideoWithFFmpeg(googleDriveUrl);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return { 
          success: false, 
          error: downloadResult.error || 'FFmpeg download failed', 
          stage: 'ffmpeg_download_failed',
          sizeMB: downloadResult.sizeMB
        };
      }
      
      downloadedFile = downloadResult.filePath;
      console.log(`FFmpeg download successful: ${downloadResult.sizeMB?.toFixed(1)}MB`);
      
      // Step 2: Optimize video for Facebook (optional)
      console.log('Step 2: Optimizing for Facebook');
      
      const optimizationResult = await FFmpegCompleteDownloadService.optimizeVideoForFacebook(downloadedFile);
      
      if (optimizationResult.success && optimizationResult.filePath) {
        optimizedFile = optimizationResult.filePath;
        console.log(`Video optimized: ${optimizationResult.sizeMB?.toFixed(1)}MB`);
        
        // Use optimized file if it's smaller and good quality
        if (optimizationResult.sizeMB && downloadResult.sizeMB && 
            optimizationResult.sizeMB < downloadResult.sizeMB * 0.8) {
          downloadedFile = optimizedFile;
          console.log('Using optimized version for upload');
        } else {
          console.log('Using original version for upload');
        }
      } else {
        console.log('Using original file (optimization failed)');
      }
      
      // Step 3: Upload to Facebook using standard method
      console.log('Step 3: Standard Facebook upload');
      
      const uploadResult = await StandardFacebookUploadService.uploadVideoStandard(
        downloadedFile,
        tamilAccount.pageId,
        tamilAccount.accessToken,
        `${description} (${downloadResult.sizeMB?.toFixed(1)}MB)`,
        ['google-drive', 'ffmpeg-download', 'complete-video']
      );
      
      if (!uploadResult.success) {
        return { 
          success: false, 
          error: uploadResult.error || 'Facebook upload failed', 
          stage: 'facebook_upload_failed',
          sizeMB: downloadResult.sizeMB
        };
      }
      
      console.log('Facebook upload successful');
      console.log('Video ID:', uploadResult.videoId);
      
      // Step 4: Save to database
      console.log('Step 4: Saving to database');
      
      await storage.createPost({
        userId: 3,
        accountId: tamilAccount.id,
        content: `${description} (${downloadResult.sizeMB?.toFixed(1)}MB)`,
        mediaUrl: googleDriveUrl,
        mediaType: 'video',
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });
      
      console.log('Saved to database');
      
      // Step 5: Clean up temporary files
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
        console.log('Cleaned up download file');
      }
      
      if (optimizedFile && fs.existsSync(optimizedFile) && optimizedFile !== downloadedFile) {
        fs.unlinkSync(optimizedFile);
        console.log('Cleaned up optimized file');
      }
      
      console.log('FFMPEG UPLOAD PROCESS COMPLETED');
      console.log('- Downloaded with FFmpeg:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      console.log('- Uploaded with standard method (no chunking)');
      console.log('- Facebook Video ID:', uploadResult.videoId);
      console.log('- Published at: https://facebook.com/101307726083031');
      
      return {
        success: true,
        videoId: uploadResult.videoId,
        sizeMB: downloadResult.sizeMB,
        stage: 'complete'
      };
      
    } catch (error) {
      console.log('Process error:', (error as Error).message);
      
      // Clean up on error
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
      }
      if (optimizedFile && fs.existsSync(optimizedFile)) {
        fs.unlinkSync(optimizedFile);
      }
      
      return { 
        success: false, 
        error: (error as Error).message, 
        stage: 'process_error' 
      };
    }
  }
  
  static async testFFmpegUpload(): Promise<any> {
    console.log('TESTING FFMPEG VIDEO UPLOAD');
    console.log('Method: FFmpeg download + Standard Facebook upload');
    console.log('Target: No chunked upload');
    
    const result = await this.uploadGoogleDriveVideoWithFFmpeg(
      'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link',
      'FFMPEG SUCCESS - Complete Google Drive Video with Standard Upload'
    );
    
    if (result.success) {
      console.log('FFMPEG TEST PASSED');
      console.log('FFmpeg approach working:');
      console.log('- FFmpeg download: Working');
      console.log('- Standard Facebook upload: Working (no chunking)');
      console.log('- Video size:', result.sizeMB?.toFixed(1) + 'MB');
      console.log('- Facebook Video ID:', result.videoId);
      
      return {
        success: true,
        method: 'ffmpeg_standard_upload',
        downloadSizeMB: result.sizeMB,
        facebookVideoId: result.videoId,
        uploadType: 'standard_no_chunking'
      };
    } else {
      console.log('FFMPEG TEST FAILED');
      console.log('Failed at stage:', result.stage);
      console.log('Error:', result.error);
      
      return {
        success: false,
        failedStage: result.stage,
        error: result.error,
        sizeMB: result.sizeMB
      };
    }
  }
}