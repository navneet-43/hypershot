import { ImprovedGoogleDriveService } from './improvedGoogleDriveService';
import { storage } from '../storage';

interface BulkUploadResult {
  successful: number;
  failed: number;
  results: Array<{
    driveUrl: string;
    success: boolean;
    facebookVideoId?: string;
    sizeMB?: number;
    error?: string;
  }>;
}

export class EnhancedVideoUploadService {
  
  static async uploadSingleDriveVideo(
    driveUrl: string,
    pageId: string,
    accessToken: string,
    title: string,
    description: string = ''
  ): Promise<any> {
    console.log('🎯 ENHANCED SINGLE VIDEO UPLOAD');
    console.log('📁 Drive URL:', driveUrl);
    console.log('📄 Page ID:', pageId);
    
    const driveService = new ImprovedGoogleDriveService();
    
    const fullDescription = title + (description ? `\n\n${description}` : '');
    
    const result = await driveService.downloadAndUploadToFacebook(
      driveUrl,
      pageId,
      accessToken,
      fullDescription
    );
    
    if (result.success) {
      console.log('✅ Enhanced upload successful');
      console.log('🎬 Facebook Video ID:', result.facebookVideoId);
      console.log('📊 File size:', result.sizeMB?.toFixed(1) + 'MB');
      
      return {
        success: true,
        facebookVideoId: result.facebookVideoId,
        sizeMB: result.sizeMB,
        stage: result.stage
      };
    } else {
      console.log('❌ Enhanced upload failed:', result.error);
      console.log('🔍 Failed at stage:', result.stage);
      
      return {
        success: false,
        error: result.error,
        stage: result.stage,
        sizeMB: result.sizeMB
      };
    }
  }
  
  static async processBulkDriveVideos(requests: Array<{
    driveUrl: string;
    pageId: string;
    accessToken: string;
    title: string;
    description?: string;
    published?: boolean;
  }>): Promise<BulkUploadResult> {
    console.log('🎯 ENHANCED BULK VIDEO PROCESSING');
    console.log(`📊 Processing ${requests.length} videos`);
    
    const results = [];
    let successful = 0;
    let failed = 0;
    
    // Process with controlled concurrency (max 2 at a time)
    const limit = 2;
    const chunks = [];
    for (let i = 0; i < requests.length; i += limit) {
      chunks.push(requests.slice(i, i + limit));
    }
    
    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (request) => {
        try {
          const result = await this.uploadSingleDriveVideo(
            request.driveUrl,
            request.pageId,
            request.accessToken,
            request.title,
            request.description || ''
          );
          
          if (result.success) {
            successful++;
            return {
              driveUrl: request.driveUrl,
              success: true,
              facebookVideoId: result.facebookVideoId,
              sizeMB: result.sizeMB
            };
          } else {
            failed++;
            return {
              driveUrl: request.driveUrl,
              success: false,
              error: result.error,
              sizeMB: result.sizeMB
            };
          }
          
        } catch (error) {
          failed++;
          return {
            driveUrl: request.driveUrl,
            success: false,
            error: (error as Error).message
          };
        }
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
      
      // Small delay between chunks to avoid overwhelming the services
      if (chunks.indexOf(chunk) < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`✅ Bulk processing complete: ${successful} successful, ${failed} failed`);
    
    return {
      successful,
      failed,
      results
    };
  }
  
  static async testImprovedDriveUpload(
    driveUrl: string = 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link'
  ): Promise<any> {
    console.log('🧪 TESTING IMPROVED GOOGLE DRIVE UPLOAD');
    console.log('🎯 Goal: Download and upload using enhanced chunked methods');
    
    // Get Facebook account for testing
    const accounts = await storage.getFacebookAccounts(3);
    const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
    
    if (!tamilAccount) {
      return {
        success: false,
        error: 'Alright Tamil account not found for testing'
      };
    }
    
    const result = await this.uploadSingleDriveVideo(
      driveUrl,
      tamilAccount.pageId,
      tamilAccount.accessToken,
      'ENHANCED SUCCESS - Improved Google Drive Upload with Chunked Download Strategy',
      'Testing the new improved Google Drive service with better file handling and chunked downloads'
    );
    
    if (result.success) {
      console.log('✅ ENHANCED TEST PASSED');
      console.log('Improved system working correctly:');
      console.log('- Google Drive chunked download: Working');
      console.log('- File size optimization: Working');
      console.log('- Facebook upload: Working (actual video file)');
      console.log('- Video size:', result.sizeMB?.toFixed(1) + 'MB');
      console.log('- Facebook Video ID:', result.facebookVideoId);
      
      // Save successful test to database
      await storage.createPost({
        userId: 3,
        accountId: tamilAccount.id,
        content: 'ENHANCED SUCCESS - Improved Google Drive Upload with Chunked Download Strategy',
        mediaUrl: driveUrl,
        mediaType: 'video',
        language: 'en',
        status: 'published',
        publishedAt: new Date()
      });
      
      return {
        success: true,
        flow: 'enhanced_google_drive_to_facebook',
        downloadSizeMB: result.sizeMB,
        facebookVideoId: result.facebookVideoId,
        uploadType: 'enhanced_chunked_download',
        stage: result.stage
      };
    } else {
      console.log('❌ ENHANCED TEST FAILED');
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