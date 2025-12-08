import * as fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

export class StandardFacebookUploadService {
  
  static async uploadVideoStandard(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[] = []
  ): Promise<{ success: boolean; videoId?: string; error?: string }> {
    
    console.log('STANDARD FACEBOOK VIDEO UPLOAD (NO CHUNKING)');
    console.log('File:', filePath);
    console.log('Page ID:', pageId);
    
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Video file not found' };
    }

    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    console.log('File size:', fileSizeMB.toFixed(1) + 'MB');

    // Use standard upload for files under 1GB
    if (fileSizeMB < 1000) {
      return this.standardDirectUpload(filePath, pageId, accessToken, message, customLabels);
    } else {
      return { success: false, error: 'File too large for standard upload' };
    }
  }

  private static async standardDirectUpload(
    filePath: string,
    pageId: string,
    accessToken: string,
    message: string,
    customLabels: string[]
  ): Promise<{ success: boolean; videoId?: string; error?: string }> {
    
    console.log('Using standard direct upload');
    
    try {
      const form = new FormData();
      form.append('source', fs.createReadStream(filePath));
      form.append('description', message);
      form.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      form.append('published', 'true');
      
      // Add custom labels if provided
      if (customLabels && customLabels.length > 0) {
        const validLabels = customLabels
          .filter(label => label && label.trim().length > 0)
          .map(label => label.trim().substring(0, 25))
          .slice(0, 10);
        
        if (validLabels.length > 0) {
          form.append('custom_labels', JSON.stringify(validLabels));
        }
      }

      const uploadUrl = `https://graph.facebook.com/v18.0/${pageId}/videos`;
      
      console.log('Uploading to Facebook...');
      console.log('URL:', uploadUrl);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          ...form.getHeaders()
        },
        body: form
      });

      const responseText = await response.text();
      console.log('Facebook response status:', response.status);
      console.log('Facebook response:', responseText);

      if (response.ok) {
        try {
          const result = JSON.parse(responseText);
          
          if (result.id) {
            console.log('SUCCESS: Video uploaded');
            console.log('Video ID:', result.id);
            
            return {
              success: true,
              videoId: result.id
            };
          } else {
            return {
              success: false,
              error: 'No video ID in response: ' + responseText
            };
          }
        } catch (parseError) {
          return {
            success: false,
            error: 'Failed to parse response: ' + responseText
          };
        }
      } else {
        let errorMessage = `HTTP ${response.status}: ${responseText}`;
        
        try {
          const errorData = JSON.parse(responseText);
          if (errorData.error && errorData.error.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          // Use the raw response text
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }
      
    } catch (error) {
      console.log('Upload error:', (error as Error).message);
      return {
        success: false,
        error: (error as Error).message
      };
    }
  }
}