import { RobustGoogleDriveService } from './robustGoogleDriveService';
import { FacebookVideoUploadService } from './facebookVideoUploadService';
import { storage } from '../storage';
import * as fs from 'fs';

export class FinalSolutionService {
  
  static async executeGoogleDriveToFacebookFlow(
    googleDriveUrl: string,
    description: string = 'Google Drive Video - Uploaded as Actual Facebook Video File'
  ): Promise<{ success: boolean; videoId?: string; sizeMB?: number; error?: string; step?: string }> {
    
    console.log('🎯 EXECUTING COMPLETE GOOGLE DRIVE TO FACEBOOK FLOW');
    console.log('📁 Google Drive URL:', googleDriveUrl);
    console.log('💬 Description:', description);
    
    let downloadedFile: string | undefined;
    
    try {
      // Get Facebook account
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
      
      if (!tamilAccount) {
        return { success: false, error: 'Alright Tamil Facebook account not found', step: 'account_lookup' };
      }
      
      console.log('📄 Using Facebook page:', tamilAccount.name);
      
      // Step 1: Download video from Google Drive
      console.log('⬇️ Step 1: Downloading video from Google Drive...');
      
      const downloadResult = await RobustGoogleDriveService.downloadVideo(googleDriveUrl);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return { 
          success: false, 
          error: downloadResult.error || 'Download failed', 
          step: 'google_drive_download' 
        };
      }
      
      downloadedFile = downloadResult.filePath;
      console.log('✅ Download successful:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      
      // Step 2: Upload to Facebook as actual video
      console.log('⬆️ Step 2: Uploading to Facebook as actual video...');
      
      const uploadResult = await FacebookVideoUploadService.uploadVideoFile(
        downloadedFile,
        tamilAccount.pageId,
        tamilAccount.accessToken,
        description,
        ['google-drive', 'actual-video', 'final-solution']
      );
      
      if (!uploadResult.success) {
        return { 
          success: false, 
          error: uploadResult.error || 'Facebook upload failed', 
          step: 'facebook_upload' 
        };
      }
      
      console.log('✅ Facebook upload successful');
      console.log('🎬 Video ID:', uploadResult.videoId);
      
      // Step 3: Save to database
      console.log('💾 Step 3: Saving to database...');
      
      await storage.createPost({
        userId: 3,
        accountId: tamilAccount.id,
        content: description,
        mediaUrl: googleDriveUrl,
        mediaType: 'video',
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });
      
      console.log('✅ Saved to database');
      
      // Step 4: Clean up
      if (fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
        console.log('🧹 Temporary file cleaned up');
      }
      
      console.log('🎉 COMPLETE FLOW SUCCESSFUL');
      console.log('- Video downloaded from Google Drive:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      console.log('- Video uploaded to Facebook as actual video file (not link)');
      console.log('- Facebook Video ID:', uploadResult.videoId);
      console.log('- Facebook Page: https://facebook.com/101307726083031');
      
      return {
        success: true,
        videoId: uploadResult.videoId,
        sizeMB: downloadResult.sizeMB
      };
      
    } catch (error) {
      console.log('❌ Process error:', (error as Error).message);
      
      // Clean up on error
      if (downloadedFile && fs.existsSync(downloadedFile)) {
        fs.unlinkSync(downloadedFile);
        console.log('🧹 Cleaned up temporary file after error');
      }
      
      return { 
        success: false, 
        error: (error as Error).message, 
        step: 'process_error' 
      };
    }
  }
  
  static async testCompleteFlow(): Promise<any> {
    console.log('🧪 TESTING COMPLETE GOOGLE DRIVE TO FACEBOOK FLOW');
    
    const result = await this.executeGoogleDriveToFacebookFlow(
      'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link',
      'FINAL SOLUTION - Google Drive Video Uploaded as Actual Facebook Video File'
    );
    
    if (result.success) {
      console.log('✅ TEST PASSED');
      console.log('Flow working correctly:');
      console.log('- Google Drive download: Working');
      console.log('- Facebook upload: Working (actual video file)');
      console.log('- No link posts created');
      console.log('- Video size:', result.sizeMB?.toFixed(1) + 'MB');
      console.log('- Facebook Video ID:', result.videoId);
      
      return {
        success: true,
        flow: 'google_drive_to_facebook',
        downloadSizeMB: result.sizeMB,
        facebookVideoId: result.videoId,
        uploadType: 'actual_video_file'
      };
    } else {
      console.log('❌ TEST FAILED');
      console.log('Failed at step:', result.step);
      console.log('Error:', result.error);
      
      return {
        success: false,
        failedStep: result.step,
        error: result.error
      };
    }
  }
}