import { CompleteDownloadService } from './completeDownloadService';
import { FacebookVideoUploadService } from './facebookVideoUploadService';
import { storage } from '../storage';
import * as fs from 'fs';

export class FullVideoUploadService {
  
  static async uploadCompleteGoogleDriveVideo(
    googleDriveUrl: string,
    description: string = 'COMPLETE 400MB Google Drive Video - Full Download and Upload'
  ): Promise<{ success: boolean; videoId?: string; sizeMB?: number; error?: string; stage?: string }> {
    
    console.log('🎯 FULL VIDEO UPLOAD - COMPLETE DOWNLOAD REQUIRED');
    console.log('📁 Google Drive URL:', googleDriveUrl);
    console.log('💬 Description:', description);
    console.log('🎯 Requirement: Must download complete 400MB before upload');
    console.log('⚠️ Will NOT upload partial files');
    
    let downloadedFile: string | undefined;
    
    try {
      // Get Facebook account
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
      
      if (!tamilAccount) {
        return { success: false, error: 'Alright Tamil Facebook account not found', stage: 'account_lookup' };
      }
      
      console.log('📄 Using Facebook page:', tamilAccount.name);
      
      // Step 1: Download COMPLETE video from Google Drive
      console.log('⬇️ Step 1: Downloading COMPLETE video from Google Drive...');
      console.log('⏳ This may take up to 45 minutes for complete 400MB download');
      
      const downloadResult = await CompleteDownloadService.downloadCompleteVideo(googleDriveUrl, 400);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return { 
          success: false, 
          error: downloadResult.error || 'Complete download failed', 
          stage: 'complete_download_failed' 
        };
      }
      
      downloadedFile = downloadResult.filePath;
      console.log('✅ COMPLETE download successful:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      
      // Verify we got the complete file (at least 380MB = 95% of 400MB)
      if (!downloadResult.sizeMB || downloadResult.sizeMB < 380) {
        console.log('❌ ERROR: Downloaded file is too small');
        console.log('Expected: 400MB, Got:', downloadResult.sizeMB?.toFixed(1) + 'MB');
        console.log('This is not acceptable - complete download required');
        
        // Clean up incomplete file
        if (fs.existsSync(downloadedFile)) {
          fs.unlinkSync(downloadedFile);
        }
        
        return { 
          success: false, 
          error: `Incomplete download: ${downloadResult.sizeMB?.toFixed(1)}MB < 380MB required`, 
          stage: 'incomplete_download_rejected',
          sizeMB: downloadResult.sizeMB
        };
      }
      
      // Step 2: Upload complete video to Facebook
      console.log('⬆️ Step 2: Uploading COMPLETE video to Facebook...');
      console.log('📊 File size:', downloadResult.sizeMB.toFixed(1) + 'MB - Full video upload');
      
      const uploadResult = await FacebookVideoUploadService.uploadVideoFile(
        downloadedFile,
        tamilAccount.pageId,
        tamilAccount.accessToken,
        description + ` (${downloadResult.sizeMB.toFixed(1)}MB Complete File)`,
        ['google-drive', 'complete-video', 'full-400mb']
      );
      
      if (!uploadResult.success) {
        return { 
          success: false, 
          error: uploadResult.error || 'Facebook upload failed', 
          stage: 'facebook_upload_failed',
          sizeMB: downloadResult.sizeMB
        };
      }
      
      console.log('✅ Facebook upload successful');
      console.log('🎬 Video ID:', uploadResult.videoId);
      
      // Step 3: Save to database
      console.log('💾 Step 3: Saving to database...');
      
      await storage.createPost({
        userId: 3,
        accountId: tamilAccount.id,
        content: description + ` (${downloadResult.sizeMB.toFixed(1)}MB Complete File)`,
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
      
      console.log('🎉 FULL VIDEO UPLOAD SUCCESSFUL');
      console.log('- Complete video downloaded from Google Drive:', downloadResult.sizeMB?.toFixed(1) + 'MB');
      console.log('- Complete video uploaded to Facebook as actual video file');
      console.log('- Facebook Video ID:', uploadResult.videoId);
      console.log('- Facebook Page: https://facebook.com/101307726083031');
      
      return {
        success: true,
        videoId: uploadResult.videoId,
        sizeMB: downloadResult.sizeMB,
        stage: 'complete'
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
        stage: 'process_error' 
      };
    }
  }
  
  static async testCompleteUpload(): Promise<any> {
    console.log('🧪 TESTING COMPLETE VIDEO UPLOAD');
    console.log('🎯 Goal: Download complete 400MB video and upload to Facebook');
    console.log('⚠️ Will REJECT partial downloads');
    
    const result = await this.uploadCompleteGoogleDriveVideo(
      'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link',
      'COMPLETE SUCCESS - Full 400MB Google Drive Video Uploaded'
    );
    
    if (result.success) {
      console.log('✅ COMPLETE TEST PASSED');
      console.log('Complete flow working correctly:');
      console.log('- Google Drive complete download: Working');
      console.log('- Facebook complete upload: Working (actual video file)');
      console.log('- No partial downloads accepted');
      console.log('- Video size:', result.sizeMB?.toFixed(1) + 'MB');
      console.log('- Facebook Video ID:', result.videoId);
      
      return {
        success: true,
        flow: 'complete_google_drive_to_facebook',
        downloadSizeMB: result.sizeMB,
        facebookVideoId: result.videoId,
        uploadType: 'complete_400mb_video_file'
      };
    } else {
      console.log('❌ COMPLETE TEST FAILED');
      console.log('Failed at stage:', result.stage);
      console.log('Error:', result.error);
      
      if (result.sizeMB && result.sizeMB < 380) {
        console.log('⚠️ Partial download rejected as designed');
        console.log('System correctly refused to upload incomplete file');
      }
      
      return {
        success: false,
        failedStage: result.stage,
        error: result.error,
        sizeMB: result.sizeMB
      };
    }
  }
}