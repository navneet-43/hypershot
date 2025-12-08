import { GuaranteedVideoUploadService } from './guaranteedVideoUploadService';
import { storage } from '../storage';

export class TestVideoUploadService {
  static async executeTestUpload(): Promise<any> {
    console.log('Executing test video upload');
    
    try {
      // Get Tamil account
      const accounts = await storage.getFacebookAccounts(3);
      const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
      
      if (!tamilAccount) {
        throw new Error('Alright Tamil account not found');
      }
      
      console.log('Found account:', tamilAccount.name);
      
      const googleDriveUrl = 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link';
      
      const result = await GuaranteedVideoUploadService.uploadGuaranteedVideo(
        googleDriveUrl,
        tamilAccount.id,
        tamilAccount.pageId,
        tamilAccount.accessToken,
        storage
      );
      
      if (result.success) {
        console.log('Test upload completed successfully');
        console.log('Facebook Video ID:', result.videoId);
        console.log('Database Post ID:', result.postId);
        console.log('Size:', result.sizeMB + 'MB');
        console.log('Live URL: https://facebook.com/' + result.videoId);
        console.log('Page URL: https://facebook.com/101307726083031');
        
        return {
          success: true,
          videoId: result.videoId,
          postId: result.postId,
          sizeMB: result.sizeMB,
          videoUrl: 'https://facebook.com/' + result.videoId,
          pageUrl: 'https://facebook.com/101307726083031'
        };
      } else {
        console.log('Test upload failed:', result.error);
        return {
          success: false,
          error: result.error
        };
      }
      
    } catch (error) {
      console.log('Test execution error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}