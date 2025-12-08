// Manual test for Reel upload with fallback system
const fetch = require('node-fetch');

async function testReelUpload() {
  console.log('🎬 Testing Reel upload with fallback system...');
  
  try {
    // Import the required services
    const { HootsuiteStyleFacebookService } = await import('./server/services/hootsuiteStyleFacebookService.ts');
    
    const service = new HootsuiteStyleFacebookService();
    
    const testData = {
      pageId: '374148862604725', // Alright Tamil page ID
      pageAccessToken: 'EAAEnoK8Ee8ABOxhwYK6RvNXe5ZCu6ZBl5YwxW7OZA3Qrfff2mZBkdZB9YrFwWn9l9zMOl5QZCpogZBYwdcT6XMpMnq7tZBO0FqvRqd7tKrYzGU9SZCYxPxeZCYH5c4ZA1W7fGPxuoZCV4I6KMzL4JfMCRZBYuklDq3WcZCdG3r0fKr4tn6r1L',
      videoUrl: 'https://drive.google.com/file/d/1NJ4yyHfcm8mXmAkF9Blq1O2HE-U6SOPV/view?usp=drive_link',
      description: 'Testing Reel upload with intelligent fallback system - Alright Tamil',
      customLabels: ['Test', 'Reel'],
      language: 'ta'
    };
    
    console.log('📝 Test parameters:', testData);
    
    const result = await service.publishReelPost(
      testData.pageId,
      testData.pageAccessToken,
      testData.videoUrl,
      testData.description,
      testData.customLabels,
      testData.language
    );
    
    console.log('🎯 RESULT:', JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ SUCCESS: Reel upload completed successfully');
      if (result.fallbackUsed) {
        console.log('📢 NOTE: Used fallback method:', result.fallbackUsed);
      }
    } else {
      console.log('❌ FAILED:', result.error);
    }
    
  } catch (error) {
    console.error('💥 ERROR:', error);
  }
}

testReelUpload();