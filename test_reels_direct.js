// Direct test of the corrected Reels API implementation
import { HootsuiteStyleFacebookService } from './server/services/hootsuiteStyleFacebookService.js';

async function testReelsUpload() {
  console.log('🎬 Testing corrected Facebook Reels API implementation...');
  
  try {
    const service = new HootsuiteStyleFacebookService();
    
    // Test data for Alright Tamil page
    const testData = {
      pageId: '374148862604725', // Alright Tamil page ID
      pageAccessToken: 'EAAEnoK8Ee8ABOxhwYK6RvNXe5ZCu6ZBl5YwxW7OZA3Qrfff2mZBkdZB9YrFwWn9l9zMOl5QZCpogZBYwdcT6XMpMnq7tZBO0FqvRqd7tKrYzGU9SZCYxPxeZCYH5c4ZA1W7fGPxuoZCV4I6KMzL4JfMCRZBYuklDq3WcZCdG3r0fKr4tn6r1L',
      videoUrl: 'https://drive.google.com/file/d/1NJ4yyHfcm8mXmAkF9Blq1O2HE-U6SOPV/view?usp=drive_link',
      description: 'Testing official Facebook Reels API implementation - Alright Tamil',
      customLabels: ['Test', 'ReelsAPI'],
      language: 'ta'
    };
    
    console.log('📋 Starting Reel upload test...');
    console.log('📁 Video URL:', testData.videoUrl);
    console.log('📄 Description:', testData.description);
    
    const result = await service.publishReelPost(
      testData.pageId,
      testData.pageAccessToken,
      testData.videoUrl,
      testData.description,
      testData.customLabels,
      testData.language
    );
    
    console.log('\n🎯 FINAL RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ SUCCESS: Reel upload completed!');
      if (result.fallbackUsed) {
        console.log('📢 NOTE: Used fallback method:', result.fallbackUsed);
        console.log('💡 TIP: To upload as actual Reels, follow the permissions guide in FACEBOOK_REELS_PERMISSIONS_GUIDE.md');
      } else {
        console.log('🎊 AMAZING: Successfully uploaded as actual Facebook Reel!');
      }
      console.log('🔗 Post ID:', result.postId);
    } else {
      console.log('\n❌ FAILED:', result.error);
      if (result.error?.includes('not authorized')) {
        console.log('💡 This is expected - system will now test fallback to video upload');
      }
    }
    
  } catch (error) {
    console.error('\n💥 UNEXPECTED ERROR:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run the test
testReelsUpload().catch(console.error);