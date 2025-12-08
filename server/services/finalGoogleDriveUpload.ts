import { WorkingGoogleDriveService } from './workingGoogleDriveService';
import { SimplifiedFacebookUpload } from './simplifiedFacebookUpload';
import { storage } from '../storage';
import * as fs from 'fs';

export class FinalGoogleDriveUpload {
  
  static async processGoogleDriveVideo(url: string, accountId: number, pageId: string, accessToken: string): Promise<any> {
    console.log('🎯 FINAL GOOGLE DRIVE UPLOAD PROCESS');
    console.log('📁 URL:', url);
    console.log('📄 Page:', pageId);
    
    // Step 1: Download video using working service
    console.log('⬇️ Downloading video...');
    const downloadResult = await WorkingGoogleDriveService.downloadLargeFile(url);
    
    if (!downloadResult.success || !downloadResult.filePath) {
      console.log('❌ Download failed:', downloadResult.error);
      return { success: false, error: downloadResult.error, step: 'download' };
    }
    
    console.log('✅ Download successful:', downloadResult.sizeMB?.toFixed(1) + 'MB');
    
    // Step 2: Upload to Facebook
    console.log('⬆️ Uploading to Facebook...');
    const uploadResult = await SimplifiedFacebookUpload.uploadVideoFile(
      downloadResult.filePath,
      pageId,
      accessToken,
      'COMPLETE SOLUTION - Google Drive Video Uploaded as Actual Facebook Video File'
    );
    
    if (!uploadResult.success) {
      console.log('❌ Upload failed:', uploadResult.error);
      // Clean up downloaded file
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      return { success: false, error: uploadResult.error, step: 'upload' };
    }
    
    console.log('✅ Upload successful');
    console.log('🎬 Facebook Video ID:', uploadResult.videoId);
    
    // Step 3: Save to database
    console.log('💾 Saving to database...');
    try {
      await storage.createPost({
        userId: 3,
        accountId: accountId,
        content: 'COMPLETE SOLUTION - Google Drive Video Uploaded as Actual Facebook Video File',
        mediaUrl: url,
        mediaType: 'video',
        customLabels: ['complete-solution', 'google-drive', 'actual-video-file'],
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });
      
      console.log('✅ Saved to database');
      
      // Step 4: Clean up
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
        console.log('🧹 Temporary file cleaned up');
      }
      
      return {
        success: true,
        type: 'actual_video_file',
        downloadSizeMB: downloadResult.sizeMB,
        facebookVideoId: uploadResult.videoId,
        url: uploadResult.url,
        message: 'Google Drive video successfully uploaded as actual Facebook video file'
      };
      
    } catch (dbError) {
      console.log('❌ Database save failed:', (dbError as Error).message);
      // Clean up even if database save fails
      if (fs.existsSync(downloadResult.filePath)) {
        fs.unlinkSync(downloadResult.filePath);
      }
      return { 
        success: false, 
        error: (dbError as Error).message, 
        step: 'database',
        partialSuccess: {
          downloaded: true,
          uploaded: true,
          facebookVideoId: uploadResult.videoId
        }
      };
    }
  }
}