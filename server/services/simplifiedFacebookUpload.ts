import FormData from 'form-data';
import fetch from 'node-fetch';
import * as fs from 'fs';

export class SimplifiedFacebookUpload {
  
  static async uploadVideoFile(filePath: string, pageId: string, accessToken: string, description: string): Promise<any> {
    console.log('🎬 SIMPLIFIED FACEBOOK UPLOAD');
    console.log('📁 File:', filePath);
    console.log('📄 Page:', pageId);
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log('📊 Size:', sizeMB.toFixed(1) + 'MB');
    
    try {
      const formData = new FormData();
      formData.append('access_token', accessToken);
      formData.append('source', fs.createReadStream(filePath));
      formData.append('description', description);
      formData.append('published', 'true');
      
      console.log('📤 Starting upload...');
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${pageId}/videos`, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders(),
        timeout: 180000 // 3 minutes
      });
      
      console.log('📨 Response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('✅ Upload successful');
        console.log('🎬 Video ID:', result.id);
        
        return {
          success: true,
          videoId: result.id,
          sizeMB: sizeMB,
          url: `https://facebook.com/${result.id}`
        };
      } else {
        const errorText = await response.text();
        console.log('❌ Upload failed:', errorText);
        return { success: false, error: errorText };
      }
      
    } catch (error) {
      console.log('❌ Upload error:', (error as Error).message);
      return { success: false, error: (error as Error).message };
    }
  }
}