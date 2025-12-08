import fetch from 'node-fetch';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader';
import { CustomLabelValidator } from './customLabelValidator';
import { isGoogleDriveLink } from '../utils/googleDriveConverter';

/**
 * Simple Facebook Photo Service - focused on reliable photo uploads
 */
export class SimpleFacebookPhotoService {
  
  /**
   * Upload photo to Facebook page from Google Drive or URL
   */
  static async uploadPhoto(
    pageId: string, 
    pageAccessToken: string, 
    photoUrl: string, 
    caption?: string, 
    customLabels?: string[], 
    language?: string
  ): Promise<{success: boolean, postId?: string, error?: string}> {
    
    try {
      console.log('📸 SIMPLE PHOTO UPLOAD:', photoUrl);
      
      // Handle local file paths (already downloaded)
      if (photoUrl.startsWith('/tmp/') || photoUrl.startsWith('/home/')) {
        console.log('📁 LOCAL IMAGE FILE: Direct upload to Facebook');
        
        const formData = new FormData();
        
        try {
          // Check if file has proper image extension, add if missing
          let finalPath = photoUrl;
          const fs = await import('fs');
          const path = await import('path');
          
          if (!path.extname(photoUrl)) {
            // No extension - add .jpg as default for images
            const newPath = photoUrl + '.jpg';
            try {
              await fs.promises.rename(photoUrl, newPath);
              finalPath = newPath;
              console.log(`✅ Added .jpg extension: ${finalPath}`);
            } catch (renameError) {
              console.warn('Could not rename file to add extension:', renameError);
            }
          }
          
          const file = await fileFromPath(finalPath);
          formData.append('source', file);
          formData.append('access_token', pageAccessToken);
          formData.append('published', 'true');
          
          if (caption) {
            formData.append('caption', caption);
          }
          
          // Add custom labels
          if (customLabels && customLabels.length > 0) {
            const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
            if (customLabelsParam) {
              formData.append('custom_labels', customLabelsParam);
              console.log('✅ Added custom labels to local photo');
            }
          }
          
          if (language) {
            formData.append('locale', language);
          }
          
          const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
          console.log(`Uploading local photo file to Facebook page ${pageId}`);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
          });
          
          const data = await response.json();
          
          if (!response.ok || data.error) {
            console.error('Facebook local photo upload error:', data.error);
            return {
              success: false,
              error: data.error?.message || `Local photo upload failed: ${response.status}`
            };
          }
          
          console.log('✅ Local photo uploaded successfully:', data.id);
          return {
            success: true,
            postId: data.id
          };
          
        } catch (fileError) {
          console.error('Error processing local photo file:', fileError);
          return {
            success: false,
            error: 'Failed to process local photo file'
          };
        }
      }
      // Handle Google Drive links by downloading first
      else if (isGoogleDriveLink(photoUrl)) {
        console.log('📥 Downloading from Google Drive...');
        
        const downloader = new CorrectGoogleDriveDownloader();
        const downloadResult = await downloader.downloadVideoFile({ googleDriveUrl: photoUrl });
        
        if (!downloadResult.success || !downloadResult.filePath) {
          console.error('Failed to download Google Drive image:', downloadResult.error);
          return {
            success: false,
            error: downloadResult.error || 'Failed to download Google Drive image'
          };
        }
        
        console.log('✅ Downloaded Google Drive image successfully');
        
        // Upload downloaded file to Facebook
        const formData = new FormData();
        
        try {
          // Check if file has proper image extension, add if missing
          let finalPath = downloadResult.filePath;
          const fs = await import('fs');
          const path = await import('path');
          
          if (!path.extname(downloadResult.filePath)) {
            // No extension - add .jpg as default for images
            const newPath = downloadResult.filePath + '.jpg';
            try {
              await fs.promises.rename(downloadResult.filePath, newPath);
              finalPath = newPath;
              console.log(`✅ Added .jpg extension to Google Drive image: ${finalPath}`);
            } catch (renameError) {
              console.warn('Could not rename file to add extension:', renameError);
            }
          }
          
          const file = await fileFromPath(finalPath);
          formData.append('source', file);
          formData.append('access_token', pageAccessToken);
          formData.append('published', 'true');
          
          if (caption) {
            formData.append('caption', caption);
          }
          
          // Add custom labels
          if (customLabels && customLabels.length > 0) {
            const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
            if (customLabelsParam) {
              formData.append('custom_labels', customLabelsParam);
              console.log('✅ Added custom labels to photo');
            }
          }
          
          if (language) {
            formData.append('locale', language);
          }
          
          const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
          console.log(`Uploading photo to Facebook page ${pageId}`);
          
          const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
          });
          
          const data = await response.json();
          
          // Clean up downloaded file
          if (downloadResult.cleanup) {
            downloadResult.cleanup();
          }
          
          if (!response.ok || data.error) {
            console.error('Facebook photo upload error:', data.error);
            return {
              success: false,
              error: data.error?.message || `Photo upload failed: ${response.status}`
            };
          }
          
          console.log('✅ Photo uploaded successfully:', data.id);
          return {
            success: true,
            postId: data.id
          };
          
        } catch (fileError) {
          console.error('Error processing downloaded file:', fileError);
          if (downloadResult.cleanup) {
            downloadResult.cleanup();
          }
          return {
            success: false,
            error: 'Failed to process downloaded image file'
          };
        }
        
      } else {
        // Handle direct URL uploads
        const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
        
        const postData = new URLSearchParams();
        postData.append('url', photoUrl);
        postData.append('access_token', pageAccessToken);
        postData.append('published', 'true');
        
        if (caption) {
          postData.append('caption', caption);
        }
        
        // Add custom labels
        if (customLabels && customLabels.length > 0) {
          const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
          if (customLabelsParam) {
            postData.append('custom_labels', customLabelsParam);
          }
        }
        
        if (language) {
          postData.append('locale', language);
        }
        
        console.log(`Publishing photo URL to page ${pageId}`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: postData.toString()
        });
        
        const data = await response.json();
        
        if (!response.ok || data.error) {
          console.error('Facebook photo URL error:', data.error);
          return {
            success: false,
            error: data.error?.message || `Photo URL upload failed: ${response.status}`
          };
        }
        
        console.log('✅ Photo URL posted successfully:', data.id);
        return {
          success: true,
          postId: data.id
        };
      }
      
    } catch (error) {
      console.error('Simple photo upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown photo upload error'
      };
    }
  }
}