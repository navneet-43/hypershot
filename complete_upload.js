import { execSync } from 'child_process';

// Test complete upload with existing processed file
const testFile = '/tmp/google_drive_1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH_1750834025241_simple_fb.mp4';

console.log('Testing final upload completion...');

try {
  const response = await fetch('http://localhost:5000/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accountId: 4,
      content: "Final completion test - Google Drive video upload",
      mediaUrl: "https://drive.google.com/file/d/1FUVs4-34qJ-7d-jlVW3kn6btiNtq4pDH/view?usp=drive_link",
      mediaType: "video",
      language: "hi",
      status: "immediate"
    })
  });
  
  const result = await response.json();
  console.log('Upload initiated:', JSON.stringify(result, null, 2));
  
  // Check status after 30 seconds
  setTimeout(async () => {
    const statusResponse = await fetch('http://localhost:5000/api/posts');
    const posts = await statusResponse.json();
    const latest = posts.find(p => p.content.includes('Final completion test'));
    console.log('Upload status:', latest ? latest.status : 'Not found');
    console.log('Error (if any):', latest ? latest.errorMessage : 'None');
  }, 30000);
  
} catch (error) {
  console.error('Upload test failed:', error);
}