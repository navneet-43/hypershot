// Test script to upload the Google Drive photo to Alright Tamil page
const { HootsuiteStyleFacebookService } = require('./server/services/hootsuiteStyleFacebookService');

async function testPhotoUpload() {
  console.log('🧪 TESTING PHOTO UPLOAD TO ALRIGHT TAMIL');
  
  const googleDriveUrl = 'https://drive.google.com/file/d/1evomDNLGx6IAtt4IaEVj17E0CgElNG5x/view?usp=drive_link';
  const pageId = '101307726083031'; // Alright Tamil page ID
  
  // Get page access token (you'll need to provide this)
  const pageAccessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN || 'your_page_token_here';
  
  console.log('📸 Uploading Google Drive photo to Alright Tamil...');
  
  try {
    const result = await HootsuiteStyleFacebookService.publishPhotoPost(
      pageId,
      pageAccessToken,
      googleDriveUrl,
      'Test photo upload from Google Drive via SocialFlow',
      ['test_upload', 'google_drive'],
      'en'
    );
    
    if (result.success) {
      console.log('✅ PHOTO UPLOADED SUCCESSFULLY');
      console.log('Post ID:', result.postId);
    } else {
      console.log('❌ PHOTO UPLOAD FAILED');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('💥 UPLOAD ERROR:', error);
  }
}

testPhotoUpload();