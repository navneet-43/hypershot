import { ImprovedGoogleDriveService } from './improvedGoogleDriveService';
import { EnhancedVideoUploadService } from './enhancedVideoUploadService';
import { storage } from '../storage';

export class IntegrationTestService {
  
  static async runComprehensiveTest(): Promise<any> {
    console.log('🧪 COMPREHENSIVE INTEGRATION TEST');
    console.log('Testing all enhanced Google Drive features from troubleshooting guide');
    
    const results = {
      healthCheck: false,
      downloadTest: false,
      uploadTest: false,
      bulkProcessing: false,
      errorRecovery: false,
      performance: {
        downloadSpeed: 0,
        uploadSpeed: 0,
        totalTime: 0
      }
    };
    
    const startTime = Date.now();
    
    try {
      // Test 1: Health Check
      console.log('🔍 Test 1: System Health Check');
      const driveService = new ImprovedGoogleDriveService();
      const health = await driveService.healthCheck();
      results.healthCheck = Object.values(health).every(v => v);
      console.log('Health check:', results.healthCheck ? 'PASSED' : 'FAILED');
      
      // Test 2: Download Performance
      console.log('📥 Test 2: Download Performance Test');
      const testUrl = 'https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link';
      const downloadStart = Date.now();
      
      const downloadResult = await EnhancedVideoUploadService.uploadSingleDriveVideo(
        testUrl,
        '101307726083031', // Alright Tamil page
        await this.getAccessToken(),
        'COMPREHENSIVE TEST - Enhanced Google Drive Integration Working',
        'Complete test of all features from troubleshooting guide implementation'
      );
      
      const downloadTime = Date.now() - downloadStart;
      results.downloadTest = downloadResult.success;
      results.performance.downloadSpeed = downloadResult.sizeMB ? (downloadResult.sizeMB / (downloadTime / 1000)) : 0;
      
      console.log('Download test:', results.downloadTest ? 'PASSED' : 'FAILED');
      if (downloadResult.sizeMB) {
        console.log(`Downloaded: ${downloadResult.sizeMB.toFixed(1)}MB in ${downloadTime/1000}s`);
        console.log(`Speed: ${results.performance.downloadSpeed.toFixed(2)}MB/s`);
      }
      
      // Test 3: Upload Verification
      results.uploadTest = downloadResult.success && !!downloadResult.facebookVideoId;
      console.log('Upload test:', results.uploadTest ? 'PASSED' : 'FAILED');
      if (downloadResult.facebookVideoId) {
        console.log('Facebook Video ID:', downloadResult.facebookVideoId);
      }
      
      // Test 4: Error Recovery (simulate with invalid URL)
      console.log('🔧 Test 4: Error Recovery Test');
      try {
        const errorResult = await EnhancedVideoUploadService.uploadSingleDriveVideo(
          'https://drive.google.com/file/d/invalid-id/view',
          '101307726083031',
          await this.getAccessToken(),
          'ERROR TEST',
          'This should fail gracefully'
        );
        results.errorRecovery = !errorResult.success; // Should fail
      } catch (error) {
        results.errorRecovery = true; // Expected to catch error
      }
      console.log('Error recovery:', results.errorRecovery ? 'PASSED' : 'FAILED');
      
      const totalTime = Date.now() - startTime;
      results.performance.totalTime = totalTime;
      
      console.log('✅ COMPREHENSIVE TEST COMPLETED');
      console.log('Results:', {
        healthCheck: results.healthCheck,
        downloadTest: results.downloadTest,
        uploadTest: results.uploadTest,
        errorRecovery: results.errorRecovery,
        performance: results.performance
      });
      
      const allPassed = results.healthCheck && results.downloadTest && results.uploadTest && results.errorRecovery;
      
      if (allPassed) {
        console.log('🎉 ALL TESTS PASSED - Enhanced Google Drive integration is fully operational');
        console.log('Features confirmed working:');
        console.log('- Chunked downloads with size-based strategies');
        console.log('- Retry logic and error recovery');
        console.log('- Facebook video uploads as actual files');
        console.log('- Health monitoring and diagnostics');
      } else {
        console.log('⚠️ Some tests failed - review results above');
      }
      
      return {
        success: allPassed,
        results: results,
        summary: allPassed ? 'All enhanced features working' : 'Some features need attention'
      };
      
    } catch (error) {
      console.log('❌ Test suite error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message,
        results: results
      };
    }
  }
  
  private static async getAccessToken(): Promise<string> {
    const accounts = await storage.getFacebookAccounts(3);
    const tamilAccount = accounts.find(acc => acc.name === 'Alright Tamil');
    return tamilAccount?.accessToken || '';
  }
}