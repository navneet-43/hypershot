import { HootsuiteStyleFacebookService } from '../services/hootsuiteStyleFacebookService';
import * as fs from 'fs';

export async function testChunkedUpload() {
  try {
    console.log('🧪 TESTING: Creating large test video file for chunked upload validation');
    
    // Create a 125MB test file to verify chunked upload works
    const testVideoPath = '/tmp/test_large_video_125mb.mp4';
    const testVideoSize = 125 * 1024 * 1024; // 125MB
    
    // Generate test video data
    const buffer = Buffer.alloc(testVideoSize);
    // Fill with MP4-like header data to make it appear as a valid video file
    const mp4Header = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // ftyp box
      0x6D, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00, 0x00,
      0x6D, 0x70, 0x34, 0x31, 0x6D, 0x70, 0x34, 0x32
    ]);
    mp4Header.copy(buffer, 0);
    
    fs.writeFileSync(testVideoPath, buffer);
    console.log(`📊 Test file created: ${(testVideoSize / (1024 * 1024)).toFixed(2)}MB`);
    
    const cleanup = () => {
      if (fs.existsSync(testVideoPath)) {
        fs.unlinkSync(testVideoPath);
        console.log('🗑️ Test file cleaned up');
      }
    };
    
    // Test with Facebook page
    const pageId = '101307726083031'; // Alright Tamil page
    const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 'test_token';
    
    console.log('🚀 Testing chunked upload with 125MB file...');
    
    const result = await HootsuiteStyleFacebookService.uploadVideoFile(
      pageId,
      pageAccessToken,
      testVideoPath,
      'Testing chunked upload system with large video file',
      ['ChunkedUpload', 'TestVideo'],
      'en'
    );
    
    cleanup();
    
    console.log('📊 Chunked upload test result:', result);
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Test failed' };
  }
}