import fetch from 'node-fetch';
import { storage } from '../storage';
import { createReadStream, statSync, promises as fs, existsSync, unlinkSync, openSync, readSync, closeSync } from 'fs';
import * as path from 'path';
import { FormData } from 'formdata-node';
import { fileFromPath } from 'formdata-node/file-from-path';
import { convertGoogleDriveLink, isGoogleDriveLink } from '../utils/googleDriveConverter';
import { CorrectGoogleDriveDownloader } from './correctGoogleDriveDownloader';
import { CustomLabelValidator } from './customLabelValidator';
import { progressTracker } from './progressTrackingService';
import { SimpleFacebookEncoder } from './simpleFacebookEncoder';
import { CompleteVideoUploadService } from './completeVideoUploadService';
import { FacebookDefinitiveEncoder } from './facebookDefinitiveEncoder';
import { FacebookVideoValidator } from './facebookVideoValidator';
import { VideoProcessor } from './videoProcessor';

interface FacebookPageInfo {
  id: string;
  name: string;
  access_token: string;
  perms: string[];
}

interface FacebookPagesResponse {
  data: FacebookPageInfo[];
  paging?: {
    next?: string;
    previous?: string;
  };
}

/**
 * Hootsuite-style Facebook service for publishing content
 * Uses Facebook Business API with proper long-lived tokens
 */
export class HootsuiteStyleFacebookService {
  
  /**
   * Get long-lived user access token (60 days validity)
   */
  static async getLongLivedUserToken(shortLivedToken: string): Promise<string | null> {
    try {
      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;
      
      if (!appId || !appSecret) {
        console.error('Facebook app credentials missing');
        return null;
      }

      const url = `https://graph.facebook.com/v20.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Failed to get long-lived token:', data.error);
        return null;
      }
      
      return data.access_token;
    } catch (error) {
      console.error('Error getting long-lived token:', error);
      return null;
    }
  }

  /**
   * Get user's managed pages with permanent page access tokens
   */
  static async getUserManagedPages(userAccessToken: string): Promise<FacebookPageInfo[]> {
    try {
      // Updated API call without deprecated 'perms' field
      const url = `https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`;
      
      const response = await fetch(url);
      const data = await response.json() as any;
      
      if (!response.ok || !data.data) {
        console.error('Failed to fetch pages:', data);
        return [];
      }
      
      console.log(`✅ Successfully fetched ${data.data.length} Facebook pages`);
      
      // Return all pages since we can't check permissions directly anymore
      // Facebook will reject publishing attempts if no permissions exist
      return data.data.map((page: any) => ({
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        perms: [] // Empty array since perms field is deprecated
      }));
    } catch (error) {
      console.error('Error fetching user pages:', error);
      return [];
    }
  }

  /**
   * Publish text post to Facebook page (Hootsuite style)
   */
  static async publishTextPost(pageId: string, pageAccessToken: string, message: string, link?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/feed`;
      
      const postData = new URLSearchParams();
      postData.append('message', message);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        const { CustomLabelValidator } = await import('./customLabelValidator');
        const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
        
        if (customLabelsParam) {
          postData.append('custom_labels', customLabelsParam);
          console.log('✅ META INSIGHTS: Adding validated custom labels to Facebook text post');
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      if (link) {
        postData.append('link', link);
      }
      
      console.log(`Publishing text post to page ${pageId}`);
      console.log('Post data being sent:', Object.fromEntries(postData.entries()));
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      console.log('Facebook API response:', data);
      
      if (!response.ok || data.error) {
        console.error('Facebook publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing text post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish photo post to Facebook page (supports Google Drive links)
   */
  static async publishPhotoPost(pageId: string, pageAccessToken: string, photoUrl: string, caption?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      // Google Drive link conversion (now imported at top)
      
      let finalPhotoUrl = photoUrl;
      
      // Handle Google Drive links by downloading the file first
      if (isGoogleDriveLink(photoUrl)) {
        console.log('📥 DOWNLOADING GOOGLE DRIVE IMAGE...');
        
        const downloader = new CorrectGoogleDriveDownloader();
        const downloadResult = await downloader.downloadVideoFile({ googleDriveUrl: photoUrl });
        
        if (downloadResult.success && downloadResult.filePath) {
          console.log('✅ Google Drive image downloaded successfully');
          
          // Upload the downloaded file directly to Facebook
          const formData = new FormData();
          
          try {
            // fileFromPath imported at top
            const file = await fileFromPath(downloadResult.filePath);
            formData.append('source', file);
            formData.append('access_token', pageAccessToken);
            formData.append('published', 'true');
            
            if (caption) {
              formData.append('caption', caption);
            }
            
            // Add custom labels for Meta Insights tracking
            if (customLabels && customLabels.length > 0) {
              // CustomLabelValidator imported at top
              const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
              
              if (customLabelsParam) {
                formData.append('custom_labels', customLabelsParam);
                console.log('✅ META INSIGHTS: Adding validated custom labels to Facebook photo');
              }
            }
            
            if (language) {
              formData.append('locale', language);
            }
            
            const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
            console.log(`Uploading Google Drive image to page ${pageId}`);
            
            const response = await fetch(endpoint, {
              method: 'POST',
              body: formData
            });
            
            const data = await response.json();
            
            // Clean up downloaded file
            if (downloadResult.cleanup) downloadResult.cleanup();
            
            if (!response.ok || data.error) {
              console.error('Facebook photo upload error:', data.error);
              return {
                success: false,
                error: data.error?.message || `Photo upload failed: ${response.status}`
              };
            }
            
            console.log('✅ Google Drive photo uploaded successfully:', data.id);
            return {
              success: true,
              postId: data.id
            };
            
          } catch (fileError) {
            console.error('Error handling downloaded file:', fileError);
            if (downloadResult.cleanup) downloadResult.cleanup();
            return {
              success: false,
              error: 'Failed to process downloaded image file'
            };
          }
        } else {
          console.error('Failed to download Google Drive image:', downloadResult.error);
          return {
            success: false,
            error: downloadResult.error || 'Failed to download Google Drive image'
          };
        }
      }
      
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/photos`;
      
      const postData = new URLSearchParams();
      postData.append('url', finalPhotoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (caption) {
        postData.append('caption', caption);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        const { CustomLabelValidator } = await import('./customLabelValidator');
        const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
        
        if (customLabelsParam) {
          postData.append('custom_labels', customLabelsParam);
          console.log('✅ META INSIGHTS: Adding validated custom labels to Facebook photo post');
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing photo post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook photo publishing error:', data.error);
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published photo post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing photo post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Publish video post to Facebook page (supports Google Drive links)
   */
  static async publishVideoPost(pageId: string, pageAccessToken: string, videoUrl: string, description?: string, customLabels?: string[], language?: string, uploadId?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      console.log('🎬 PROCESSING VIDEO for Facebook upload:', videoUrl);
      
      // Import progress tracker for upload progress updates
      // progressTracker imported at top
      
      if (uploadId) {
        progressTracker.updateProgress(uploadId, 'Analyzing video source...', 30, 'Determining video platform and processing method');
      }
      
      // Handle local file uploads (from previous processing)
      if (videoUrl.startsWith('/tmp/') || videoUrl.startsWith('file://')) {
        console.log('📁 LOCAL VIDEO FILE: Direct upload to Facebook');
        
        try {
          // fs functions imported at top
          
          if (!existsSync(videoUrl)) {
            throw new Error(`File not found: ${videoUrl}`);
          }
          
          const stats = statSync(videoUrl);
          const fileSizeMB = stats.size / 1024 / 1024;
          
          console.log(`📊 LOCAL VIDEO FILE: ${fileSizeMB.toFixed(2)}MB - Uploading as actual video file`);
          
          // Apply simple Facebook encoding for guaranteed compatibility
          // SimpleFacebookEncoder imported at top
          console.log('🔧 Applying simple Facebook encoding for guaranteed display...');
          
          const optimizedResult = await SimpleFacebookEncoder.createSimpleCompatibleVideo(videoUrl);
          
          if (optimizedResult.success && optimizedResult.outputPath) {
            console.log('✅ Ultra-compatible encoding completed, uploading optimized video...');
            
            const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
            const uploadService = new CompleteVideoUploadService();
            // Use the actual description provided by the user for manual uploads
            const finalDescription = description || 'Local video upload';
            
            const uploadResult = await uploadService.uploadProcessedVideoFile({
              videoFilePath: optimizedResult.outputPath,
              pageId: pageId,
              pageAccessToken: pageAccessToken,
              description: finalDescription,
              customLabels: customLabels || [],
              language: language || 'en'
            });
            
            // Clean up optimized file
            if (optimizedResult.cleanup) optimizedResult.cleanup();
            
            if (uploadResult.success) {
              console.log('✅ DEFINITIVE FACEBOOK VIDEO UPLOADED SUCCESSFULLY');
              return {
                success: true,
                postId: uploadResult.videoId,
                videoId: uploadResult.videoId,
                method: 'definitive_facebook_upload'
              };
            }
          }
          
          // Fallback to direct upload if optimization fails
          console.log('⚠️ Optimization failed, trying direct upload...');
          const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
          const uploadService = new CompleteVideoUploadService();
          // Use the actual description provided by the user for manual uploads
          const finalDescription = description || 'Direct video upload';
          
          const uploadResult = await uploadService.uploadProcessedVideoFile({
            videoFilePath: videoUrl,
            pageId: pageId,
            pageAccessToken: pageAccessToken,
            description: finalDescription,
            customLabels: customLabels || [],
            language: language || 'en'
          });
          
          if (uploadResult.success) {
            console.log('✅ LOCAL VIDEO UPLOADED SUCCESSFULLY');
            return {
              success: true,
              postId: uploadResult.videoId,
              videoId: uploadResult.videoId,
              method: 'local_file_upload'
            };
          } else {
            throw new Error(uploadResult.error || 'Local file upload failed');
          }
          
        } catch (error) {
          console.error('❌ LOCAL FILE UPLOAD ERROR:', error);
          return {
            success: false,
            error: `Local file upload failed: ${error}`
          };
        }
      }
      
      // Handle YouTube URLs with original quality preservation
      if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be/')) {
        console.log('🎥 YOUTUBE VIDEO: Downloading original quality for Facebook upload');
        
        try {
          // Use high-quality processing for maximum quality retention
          const { HighQualityVideoService } = await import('./highQualityVideoService');
          const result = await HighQualityVideoService.processForMaxQuality(videoUrl);
          
          if (result.success && result.filePath) {
            const { statSync } = await import('fs');
            const stats = statSync(result.filePath);
            const fileSizeMB = stats.size / 1024 / 1024;
            
            console.log(`📊 HIGH-QUALITY VIDEO: ${fileSizeMB.toFixed(2)}MB (${result.quality}) - Uploading as actual video file`);
            
            const cleanup = result.cleanup || (() => {
              if (result.filePath && existsSync(result.filePath)) {
                unlinkSync(result.filePath);
                console.log('🗑️ HIGH-QUALITY VIDEO CLEANED');
              }
            });
            
            // Force actual video upload using guaranteed service
            const { ActualVideoUploadService } = await import('./actualVideoUploadService');
            // Apply definitive Facebook encoding for reliable display
            const { FacebookDefinitiveEncoder } = await import('./facebookDefinitiveEncoder');
            console.log('🎯 Applying definitive Facebook encoding to YouTube video...');
            
            const optimizedResult = await FacebookDefinitiveEncoder.createDefinitiveVideo(result.filePath);
            
            if (optimizedResult.success && optimizedResult.outputPath) {
              console.log('✅ Definitive Facebook encoding completed for YouTube video');
              
              const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
              const uploadService = new CompleteVideoUploadService();
              // Use the actual description provided by the user for manual uploads
              const finalDescription = description || 'High-quality YouTube video';
              
              const uploadResult = await uploadService.uploadProcessedVideoFile({
                videoFilePath: optimizedResult.outputPath,
                pageId: pageId,
                pageAccessToken: pageAccessToken,
                description: finalDescription,
                customLabels: customLabels || [],
                language: language || 'en'
              });
              
              // Clean up both original and optimized files
              if (result.cleanup) result.cleanup();
              if (optimizedResult.cleanup) optimizedResult.cleanup();
              
              if (uploadResult.success) {
                console.log('✅ DEFINITIVE FACEBOOK-ENCODED YOUTUBE VIDEO UPLOADED');
                return {
                  success: true,
                  postId: uploadResult.videoId
                };
              }
            }
            
            // Fallback to direct upload if optimization fails
            console.log('⚠️ Optimization failed, using direct upload...');
            const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
            const uploadService = new CompleteVideoUploadService();
            // Use the actual description provided by the user for manual uploads
            const finalDescription = description || 'YouTube video upload';
            
            const uploadResult = await uploadService.uploadProcessedVideoFile({
              videoFilePath: result.filePath,
              pageId: pageId,
              pageAccessToken: pageAccessToken,
              description: finalDescription,
              customLabels: customLabels || [],
              language: language || 'en'
            });
            
            // Clean up original file
            cleanup();
            
            if (uploadResult.success) {
              console.log(`✅ ACTUAL VIDEO UPLOADED: ${uploadResult.method} method, ${uploadResult.finalSizeMB?.toFixed(2)}MB`);
              return uploadResult;
            } else {
              console.log(`⚠️ Video upload failed: ${uploadResult.error}`);
            }
          } else {
            console.log('⚠️ Video upload failed after all strategies, using link fallback');
            const textContent = description ? 
              `${description}\n\nWatch video: ${videoUrl}` : 
              `${videoUrl}`;
            return await this.publishTextPost(pageId, pageAccessToken, textContent, videoUrl, customLabels, language);
          }
        } catch (error) {
          console.log('⚠️ YouTube processing error:', error);
          const textContent = description ? 
            `${description}\n\nWatch video: ${videoUrl}` : 
            `${videoUrl}`;
          return await this.publishTextPost(pageId, pageAccessToken, textContent, videoUrl, customLabels, language);
        }
      }

      // Handle Google Drive URLs with enhanced large file access (for both videos and images)
      // BUT skip Google Drive processing for local Facebook video files
      if ((videoUrl.includes('drive.google.com') || videoUrl.includes('docs.google.com')) && 
          !videoUrl.startsWith('/home/runner/workspace/temp/fb_videos/')) {
        console.log('📁 GOOGLE DRIVE MEDIA: Using enhanced file access for video/image content');
        
        if (uploadId) {
          progressTracker.updateProgress(uploadId, 'Downloading from Google Drive...', 40, 'Starting enhanced Google Drive download');
        }
        
        const { CorrectGoogleDriveDownloader } = await import('./correctGoogleDriveDownloader');
        
        const downloader = new CorrectGoogleDriveDownloader();
        const result = await downloader.downloadVideoFile({ googleDriveUrl: videoUrl });
        
        if (result.success && result.filePath) {
          const fileSizeMB = (result.fileSize! / 1024 / 1024).toFixed(2);
          console.log(`✅ Google Drive file downloaded: ${fileSizeMB}MB`);
          
          // Check if downloaded file is an image by size and extension
          const isLikelyImage = result.fileSize! < 1 * 1024 * 1024; // Under 1MB likely image (more restrictive)
          // path imported at top
          const extension = path.extname(result.filePath).toLowerCase();
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
          const isImageExtension = imageExtensions.includes(extension);
          const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
          const isVideoExtension = videoExtensions.includes(extension);
          
          console.log(`🔍 FILE ANALYSIS: Size=${fileSizeMB}MB, Extension=${extension}, IsImage=${isImageExtension}, IsVideo=${isVideoExtension}`);
          
          if ((isLikelyImage && isImageExtension) && !isVideoExtension) {
            console.log('📸 DETECTED IMAGE: Using SimpleFacebookPhotoService instead of video');
            
            // Use the new SimpleFacebookPhotoService for images
            const { SimpleFacebookPhotoService } = await import('./simpleFacebookPhotoService');
            const photoResult = await SimpleFacebookPhotoService.uploadPhoto(
              pageId,
              pageAccessToken,
              result.filePath, // Use local file path - SimpleFacebookPhotoService handles this correctly
              description || 'Google Drive Image Upload',
              customLabels || [],
              language || 'en'
            );
            
            // Clean up downloaded file
            if (result.cleanup) result.cleanup();
            
            return photoResult;
          }
          
          if (uploadId) {
            progressTracker.updateProgress(uploadId, 'Processing video for Facebook...', 60, 'Optimizing video format for Facebook compatibility');
          }
          
          // Apply simple encoding for Facebook compatibility
          // SimpleFacebookEncoder imported at top
          const encodedResult = await SimpleFacebookEncoder.createSimpleCompatibleVideo(result.filePath);
          
          let finalPath = result.filePath;
          let encodingCleanup: (() => void) | undefined;
          
          if (encodedResult.success && encodedResult.outputPath) {
            console.log('✅ Facebook encoding applied to Google Drive video');
            finalPath = encodedResult.outputPath;
            encodingCleanup = encodedResult.cleanup;
          }
          
          if (uploadId) {
            progressTracker.updateProgress(uploadId, 'Uploading to Facebook...', 80, 'Starting Facebook upload with chunked method');
          }
          
          // Upload to Facebook using the working chunked upload system
          console.log('🚀 STARTING FACEBOOK UPLOAD for Google Drive video');
          // CompleteVideoUploadService imported at top
          const uploadService = new CompleteVideoUploadService();
          
          // Use the actual description provided by the user for manual uploads
          const finalDescription = description || 'Google Drive Video Upload';
          
          const uploadResult = await uploadService.uploadProcessedVideoFile({
            videoFilePath: finalPath,
            pageId: pageId,
            pageAccessToken: pageAccessToken,
            description: finalDescription,
            customLabels: customLabels || [],
            language: language || 'en'
          });
          
          console.log('📊 UPLOAD RESULT:', JSON.stringify(uploadResult, null, 2));
          
          if (uploadResult.success) {
            console.log('✅ ENHANCED GOOGLE DRIVE VIDEO UPLOADED SUCCESSFULLY');
            
            // Clean up temporary files after successful upload
            if (result.cleanup) result.cleanup();
            if (encodingCleanup) encodingCleanup();
            
            return {
              success: true,
              postId: uploadResult.postId || uploadResult.videoId
            };
          } else {
            console.log('❌ FACEBOOK UPLOAD FAILED:', uploadResult.error);
            
            // CRITICAL FIX: Always cleanup files even on failure to prevent disk space issues
            // Log the file paths first for debugging, then delete
            console.log('🧹 FORCE CLEANUP: Deleting temporary files to prevent disk space issues');
            if (result.cleanup) {
              console.log(`🧹 Cleaning up source file: ${result.filePath}`);
              result.cleanup();
            }
            if (encodingCleanup) {
              console.log(`🧹 Cleaning up encoded file`);
              encodingCleanup();
            }
            
            return {
              success: false,
              error: uploadResult.error || 'Facebook upload failed'
            };
          }
        }
        
        console.log(`❌ Enhanced Google Drive processing failed: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Google Drive video processing failed'
        };
      }

      // Handle raw Facebook video URLs - download them first BEFORE validation
      if (videoUrl.includes('facebook.com') && (videoUrl.includes('/videos/') || videoUrl.includes('/watch/?v='))) {
        console.log('📱 RAW FACEBOOK VIDEO URL DETECTED: Downloading first...');
        
        try {
          const { FacebookVideoDownloader } = await import('./facebookVideoDownloader');
          const downloadResult = await FacebookVideoDownloader.downloadVideo(videoUrl);
          
          if (downloadResult.success && downloadResult.filePath) {
            console.log(`✅ Facebook video downloaded successfully: ${downloadResult.filename}`);
            
            // Use the downloaded file path for upload
            const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
            const uploadService = new CompleteVideoUploadService();
            
            const uploadResult = await uploadService.uploadProcessedVideoFile({
              videoFilePath: downloadResult.filePath,
              pageId: pageId,
              pageAccessToken: pageAccessToken,
              description: description || 'Facebook video upload',
              customLabels: customLabels || [],
              language: language || 'en',
              isReel: false
            });
            
            if (uploadResult.success) {
              console.log('✅ DOWNLOADED FACEBOOK VIDEO UPLOADED SUCCESSFULLY');
              
              // Clean up downloaded Facebook video after successful upload
              if (downloadResult.cleanup) {
                console.log('🧹 Cleaning up downloaded Facebook video');
                downloadResult.cleanup();
              }
              
              return {
                success: true,
                postId: uploadResult.postId || uploadResult.videoId
              };
            } else {
              console.log('❌ DOWNLOADED FACEBOOK VIDEO UPLOAD FAILED:', uploadResult.error);
              
              // CRITICAL FIX: Always cleanup downloaded files even on failure
              if (downloadResult.cleanup) {
                console.log('🧹 FORCE CLEANUP: Deleting downloaded Facebook video to prevent disk space issues');
                downloadResult.cleanup();
              }
              
              return {
                success: false,
                error: uploadResult.error || 'Downloaded Facebook video upload failed'
              };
            }
          } else {
            console.log(`❌ Facebook video download failed: ${downloadResult.error}`);
            return {
              success: false,
              error: `Failed to download Facebook video: ${downloadResult.error || 'Unknown download error'}. This usually means the video is private, requires login, or has been deleted.`
            };
          }
        } catch (fbError) {
          console.error('Facebook video processing error:', fbError);
          return {
            success: false,
            error: `Failed to process Facebook video: ${fbError instanceof Error ? fbError.message : 'Unknown error'}`
          };
        }
      }

      // Skip validation for local file paths - they'll be handled by direct file upload
      let fbValidation: any = null;
      let forcedUploadMethod = 'direct_upload';
      
      if (!videoUrl.startsWith('/tmp/') && !videoUrl.startsWith('file://') && !videoUrl.startsWith('/home/') && !videoUrl.includes('temp/fb_videos/')) {
        const { FacebookVideoValidator } = await import('./facebookVideoValidator');
        fbValidation = await FacebookVideoValidator.validateForFacebook(videoUrl);
        
        if (!fbValidation.isValid) {
          console.error('❌ FACEBOOK VALIDATION FAILED:', fbValidation.violations);
          const report = FacebookVideoValidator.generateFacebookValidationReport(fbValidation);
          return {
            success: false,
            error: `Video does not meet Facebook requirements:\n\n${report}`
          };
        }
        console.log('✅ FACEBOOK VALIDATION PASSED:', fbValidation.uploadMethod, fbValidation.detectedFormat);
        forcedUploadMethod = fbValidation.uploadMethod;
      } else {
        console.log('📁 LOCAL FILE DETECTED - Skipping URL validation, proceeding with direct upload');
        
        // For local Facebook video files, upload directly without any processing
        if (videoUrl.startsWith('/home/runner/workspace/temp/fb_videos/')) {
          console.log('🎬 FACEBOOK VIDEO FILE: Direct upload without processing');
          const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
          const uploadService = new CompleteVideoUploadService();
          
          const uploadResult = await uploadService.uploadProcessedVideoFile({
            videoFilePath: videoUrl,
            pageId: pageId,
            pageAccessToken: pageAccessToken,
            description: description || 'Facebook video upload',
            customLabels: customLabels || [],
            language: language || 'en',
            isReel: false // Facebook video files are regular videos
          });
          
          if (uploadResult.success) {
            console.log('✅ FACEBOOK VIDEO UPLOADED SUCCESSFULLY');
            return {
              success: true,
              postId: uploadResult.postId || uploadResult.videoId
            };
          } else {
            console.log('❌ FACEBOOK VIDEO UPLOAD FAILED:', uploadResult.error);
            return {
              success: false,
              error: uploadResult.error || 'Facebook video upload failed'
            };
          }
        }
      }
      
      const { VideoProcessor } = await import('./videoProcessor');

      // Process video for optimal Facebook compatibility
      const processingResult = await VideoProcessor.processVideo(videoUrl);
      
      if (!processingResult.success) {
        console.log('❌ VIDEO PROCESSING FAILED:', processingResult.error);
        
        // If processing fails, try posting as link
        if (videoUrl.startsWith('http')) {
          console.log('🔗 FALLBACK: Posting video URL as link');
          const textContent = description ? 
            `${description}\n\nWatch video: ${videoUrl}` : 
            `${videoUrl}`;
          
          return await this.publishTextPost(pageId, pageAccessToken, textContent, videoUrl, customLabels, language);
        }
        
        return {
          success: false,
          error: processingResult.error || 'Video processing failed'
        };
      }
      
      const finalVideoUrl = processingResult.processedUrl || videoUrl;
      
      if (processingResult.skipProcessing) {
        console.log('✅ VIDEO READY: No processing needed');
      } else {
        console.log('✅ VIDEO OPTIMIZED: Ready for Facebook upload');
        if (processingResult.originalSize) {
          const sizeMB = (processingResult.originalSize / 1024 / 1024).toFixed(2);
          console.log(`📊 VIDEO SIZE: ${sizeMB}MB (proceeding with upload)`);
        }
      }
      
      // Handle YouTube downloads as file uploads
      if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        console.log('🎥 YOUTUBE VIDEO: Using downloaded file for upload');
        
        // For YouTube videos, processVideo returns a file path, not a URL
        if (processingResult.processedUrl && !processingResult.skipProcessing) {
          // This is a downloaded file path, use file upload
          return await HootsuiteStyleFacebookService.uploadVideoFile(pageId, pageAccessToken, processingResult.processedUrl, description, customLabels, language, processingResult.cleanup);
        }
      }
      
      // Use upload method determined by Facebook validation
      if (forcedUploadMethod === 'youtube_native') {
        console.log('🎥 USING YOUTUBE NATIVE INTEGRATION per Facebook requirements');
        return await HootsuiteStyleFacebookService.publishYouTubePost(pageId, pageAccessToken, finalVideoUrl, description, customLabels, language);
      } else if (forcedUploadMethod === 'resumable') {
        console.log('🚀 USING RESUMABLE UPLOAD per Facebook requirements');
        return await HootsuiteStyleFacebookService.uploadLargeVideoResumable(pageId, pageAccessToken, finalVideoUrl, description, customLabels, language);
      } else if (forcedUploadMethod === 'file_url') {
        console.log('📤 USING FILE_URL UPLOAD per Facebook requirements');
        // Continue with standard file_url method
      } else {
        console.log('🚫 UPLOAD REJECTED by Facebook validation');
        return {
          success: false,
          error: 'Video rejected by Facebook validation'
        };
      }
      
      // For other videos, use resumable upload if they're large
      const shouldUseResumableUpload = processingResult.originalSize && processingResult.originalSize > 50 * 1024 * 1024; // 50MB threshold
      
      if (shouldUseResumableUpload) {
        console.log('🚀 USING RESUMABLE UPLOAD for large video');
        return await HootsuiteStyleFacebookService.uploadLargeVideoResumable(pageId, pageAccessToken, finalVideoUrl, description, customLabels, language);
      }
      
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/videos`;
      
      const postData = new URLSearchParams();
      postData.append('file_url', finalVideoUrl);
      postData.append('access_token', pageAccessToken);
      
      // Publish immediately (Facebook Pages are public by default)
      postData.append('published', 'true');
      
      if (description) {
        postData.append('description', description);
      }
      
      // Add custom labels for Meta Insights tracking (not visible in post)
      if (customLabels && customLabels.length > 0) {
        const { CustomLabelValidator } = await import('./customLabelValidator');
        const customLabelsParam = CustomLabelValidator.createFacebookParameter(customLabels);
        
        if (customLabelsParam) {
          postData.append('custom_labels', customLabelsParam);
          console.log('✅ META INSIGHTS: Adding validated custom labels to Facebook video post');
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing video post to page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook video publishing error:', data.error);
        
        // Check if it's a media-related error that can be handled with fallback
        const isMediaError = data.error?.code === 351 || 
                            data.error?.message?.includes('video file') ||
                            data.error?.message?.includes('corrupt') ||
                            data.error?.message?.includes('unreadable');
        
        if (isMediaError) {
          console.log('❌ VIDEO UPLOAD FAILED: Facebook rejected the video file');
          
          // Provide specific guidance based on video source
          if (videoUrl.includes('drive.google.com')) {
            console.log('🔍 GOOGLE DRIVE VIDEO UPLOAD FAILED');
            
            return {
              success: false,
              error: `Google Drive Video Upload Failed

Google Drive blocks programmatic video access due to security policies.

RECOMMENDED SOLUTION - Switch to Dropbox:

1. **Upload to Dropbox**:
   • Upload your video to Dropbox
   • Right-click → Share → "Anyone with the link"
   • Copy the sharing link

2. **Use Dropbox Link**:
   • Replace Google Drive URLs with Dropbox URLs in your Excel
   • System automatically converts to direct download format
   • Supports videos up to 4GB

3. **Alternative Options**:
   • Download and upload directly through this system
   • Use YouTube (unlisted) and share the link

Dropbox provides reliable programmatic access for automated video posting.`
            };
          }
          
          if (videoUrl.includes('dropbox.com')) {
            console.log('🔍 DROPBOX VIDEO UPLOAD FAILED');
            
            const { DropboxHelper } = await import('./dropboxHelper');
            
            return {
              success: false,
              error: `Dropbox Video Upload Failed

${DropboxHelper.getDropboxInstructions()}

TROUBLESHOOTING:
• Ensure video is fully uploaded to Dropbox
• Check that sharing is set to "Anyone with the link"
• Verify video format is supported (MP4, MOV, AVI)
• Try downloading and re-uploading if issues persist`
            };
          }
          

          
          // Fallback to general video solutions
          const { VideoSolutions } = await import('../utils/videoSolutions');
          
          // Determine error type and get appropriate solution
          let errorType: 'size' | 'format' | 'access' | 'corrupt' = 'access';
          if (data.error?.message?.includes('large')) {
            errorType = 'size';
          } else if (data.error?.message?.includes('format')) {
            errorType = 'format';
          }
          // Note: Don't treat 351 as size issue when original size is 0 or very small
          
          // Get estimated file size for solution recommendations
          const estimatedSize = processingResult.originalSize || 1; // Use minimal size for access issues
          const sizeMB = estimatedSize / 1024 / 1024;
          
          const detailedSolution = VideoSolutions.createSolutionMessage(sizeMB, errorType);
          
          return {
            success: false,
            error: detailedSolution
          };
        }
        
        return {
          success: false,
          error: data.error?.message || `API error: ${response.status}`
        };
      }
      
      console.log('Successfully published video post:', data.id);
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing video post:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Refresh all page tokens for a user (Hootsuite approach)
   */
  static async refreshUserPageTokens(userId: number, userAccessToken: string): Promise<void> {
    try {
      // Get long-lived user token first
      const longLivedUserToken = await this.getLongLivedUserToken(userAccessToken);
      if (!longLivedUserToken) {
        console.error('Failed to get long-lived user token');
        return;
      }

      // Get all managed pages with fresh tokens
      const pages = await this.getUserManagedPages(longLivedUserToken);
      
      // Update database with fresh page tokens
      for (const page of pages) {
        try {
          // Check if page already exists
          const existingAccounts = await storage.getFacebookAccounts(userId);
          const existingAccount = existingAccounts.find(acc => acc.pageId === page.id);
          
          if (existingAccount) {
            // Update existing account with fresh token
            await storage.updateFacebookAccount(existingAccount.id, {
              accessToken: page.access_token,
              name: page.name
            });
            console.log(`Updated token for existing page: ${page.name}`);
          } else {
            // Create new account entry
            await storage.createFacebookAccount({
              userId: userId,
              pageId: page.id,
              name: page.name,
              accessToken: page.access_token,
              isActive: true
            });
            console.log(`Added new page: ${page.name}`);
          }
        } catch (error) {
          console.error(`Error updating page ${page.name}:`, error);
        }
      }
      
      // Update user's token
      await storage.updateUser(userId, {
        facebookToken: longLivedUserToken
      });
      
      console.log(`Successfully refreshed tokens for user ${userId} - ${pages.length} pages updated`);
      
    } catch (error) {
      console.error('Error refreshing user page tokens:', error);
    }
  }

  /**
   * Validate page access token
   */
  static async validatePageToken(pageId: string, pageAccessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}?access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      return response.ok && !data.error;
    } catch (error) {
      console.error('Error validating page token:', error);
      return false;
    }
  }

  /**
   * Publish YouTube video to Facebook using native integration
   */
  static async publishYouTubePost(
    pageId: string,
    pageAccessToken: string,
    youtubeUrl: string,
    message?: string,
    customLabels?: string[],
    language?: string
  ): Promise<{ success: boolean; postId?: string; error?: string }> {
    try {
      console.log('🎥 PUBLISHING YOUTUBE VIDEO to Facebook via native integration');
      
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/feed`;
      
      const postData = new URLSearchParams();
      postData.append('link', youtubeUrl);
      postData.append('access_token', pageAccessToken);
      postData.append('published', 'true');
      
      if (message) {
        postData.append('message', message);
      }
      
      // Add custom labels for Meta Insights tracking
      if (customLabels && customLabels.length > 0) {
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25)
          .slice(0, 10);
        
        if (labelArray.length > 0) {
          postData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to YouTube post:', labelArray);
        }
      }
      
      // Include language metadata if provided
      if (language) {
        postData.append('locale', language);
      }
      
      console.log(`Publishing YouTube video to Facebook page ${pageId}`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: postData.toString()
      });
      
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        console.error('Facebook YouTube post error:', data.error);
        return {
          success: false,
          error: `Failed to publish YouTube video: ${data.error?.message || 'Unknown error'}`
        };
      }
      
      console.log('✅ YOUTUBE VIDEO PUBLISHED successfully to Facebook:', data.id);
      
      return {
        success: true,
        postId: data.id
      };
      
    } catch (error) {
      console.error('Error publishing YouTube video to Facebook:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get page publishing permissions
   */
  static async getPagePermissions(pageId: string, pageAccessToken: string): Promise<string[]> {
    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=perms&access_token=${pageAccessToken}`);
      const data = await response.json() as any;
      
      if (!response.ok || data.error) {
        return [];
      }
      
      return data.perms || [];
    } catch (error) {
      console.error('Error getting page permissions:', error);
      return [];
    }
  }

  /**
   * Upload large video using Facebook's resumable upload API
   */
  static async uploadLargeVideoResumable(pageId: string, pageAccessToken: string, videoUrl: string, description?: string, customLabels?: string[], language?: string): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      // Step 1: Find working Google Drive URL and download video data
      console.log('📥 DOWNLOADING VIDEO DATA for resumable upload');
      
      // Convert cloud storage URLs to direct download format
      let workingUrl = videoUrl;
      
      if (videoUrl.includes('drive.google.com')) {
        const fileIdMatch = videoUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          workingUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
          console.log('🔄 Converted Google Drive URL for direct download');
        }
      } else if (videoUrl.includes('dropbox.com')) {
        const { DropboxHelper } = await import('./dropboxHelper');
        workingUrl = DropboxHelper.convertToDirectUrl(videoUrl);
      }
      
      const videoResponse = await fetch(workingUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status}`);
      }
      
      const videoBuffer = await videoResponse.arrayBuffer();
      const videoSize = videoBuffer.byteLength;
      
      console.log(`📊 VIDEO DOWNLOADED: ${(videoSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Check if we actually got video data
      if (videoSize === 0) {
        throw new Error('Downloaded video file is empty (0 bytes). This indicates Google Drive access restrictions or the file may not be a video.');
      }
      
      // Check if we got HTML instead of video data
      const contentType = videoResponse.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Downloaded content is HTML instead of video data. Google Drive may be redirecting to a login page or the file is not publicly accessible.');
      }
      
      // Step 2: Initialize resumable upload session
      console.log('🚀 INITIALIZING RESUMABLE UPLOAD SESSION');
      
      const initEndpoint = `https://graph.facebook.com/v20.0/${pageId}/videos`;
      const initData = new URLSearchParams();
      initData.append('upload_phase', 'start');
      initData.append('file_size', videoSize.toString());
      initData.append('access_token', pageAccessToken);
      
      const initResponse = await fetch(initEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: initData.toString()
      });
      
      const initResult = await initResponse.json() as any;
      
      if (!initResponse.ok || initResult.error) {
        throw new Error(`Upload initialization failed: ${initResult.error?.message || 'Unknown error'}`);
      }
      
      const sessionId = initResult.video_id;
      const uploadSessionId = initResult.upload_session_id;
      
      console.log(`✅ UPLOAD SESSION CREATED: ${sessionId}`);
      
      // Step 3: Upload video data in chunks
      console.log('📤 UPLOADING VIDEO DATA');
      
      const chunkSize = 8 * 1024 * 1024; // 8MB chunks
      const totalChunks = Math.ceil(videoSize / chunkSize);
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, videoSize);
        const chunk = videoBuffer.slice(start, end);
        
        console.log(`📤 UPLOADING CHUNK ${i + 1}/${totalChunks} (${(chunk.byteLength / 1024 / 1024).toFixed(2)}MB)`);
        
        const uploadData = new FormData();
        uploadData.append('upload_phase', 'transfer');
        uploadData.append('start_offset', start.toString());
        uploadData.append('upload_session_id', uploadSessionId);
        uploadData.append('video_file_chunk', new Blob([chunk]), 'chunk.bin');
        uploadData.append('access_token', pageAccessToken);
        
        const uploadResponse = await fetch(initEndpoint, {
          method: 'POST',
          body: uploadData
        });
        
        const uploadResult = await uploadResponse.json() as any;
        
        if (!uploadResponse.ok || uploadResult.error) {
          throw new Error(`Chunk upload failed: ${uploadResult.error?.message || 'Unknown error'}`);
        }
      }
      
      // Step 4: Finalize upload with metadata
      console.log('🏁 FINALIZING VIDEO UPLOAD');
      
      const finalizeData = new URLSearchParams();
      finalizeData.append('upload_phase', 'finish');
      finalizeData.append('upload_session_id', uploadSessionId);
      finalizeData.append('access_token', pageAccessToken);
      finalizeData.append('published', 'true');
      
      if (description) {
        finalizeData.append('description', description);
      }
      
      // Add custom labels for Meta Insights
      if (customLabels && customLabels.length > 0) {
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25)
          .slice(0, 10);
        
        if (labelArray.length > 0) {
          finalizeData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to resumable video upload:', labelArray);
        }
      }
      
      if (language) {
        finalizeData.append('locale', language);
      }
      
      const finalizeResponse = await fetch(initEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: finalizeData.toString()
      });
      
      const finalResult = await finalizeResponse.json() as any;
      
      if (!finalizeResponse.ok || finalResult.error) {
        throw new Error(`Upload finalization failed: ${finalResult.error?.message || 'Unknown error'}`);
      }
      
      console.log('✅ RESUMABLE UPLOAD COMPLETED:', finalResult.id || sessionId);
      
      return {
        success: true,
        postId: finalResult.id || sessionId
      };
      
    } catch (error) {
      console.error('❌ RESUMABLE UPLOAD FAILED:', error);
      
      // Provide specific guidance for Google Drive access issues
      const errorMessage = error instanceof Error ? error.message : 'Resumable upload failed';
      
      if (errorMessage.includes('empty') || errorMessage.includes('0 bytes') || errorMessage.includes('HTML')) {
        return {
          success: false,
          error: `Google Drive Video Access Blocked

The video was uploaded to Facebook but contains no content (0 bytes) because Google Drive blocks direct programmatic access to video files.

WORKING SOLUTIONS:

1. **Download & Direct Upload** (Recommended):
   • Download video from Google Drive to your computer
   • Use the file upload feature in this system instead of URL
   • Guarantees full video content transfer

2. **Alternative Video Hosting**:
   • Upload to YouTube (set to unlisted)
   • Share YouTube link directly in Facebook posts
   • YouTube links work perfectly with Facebook

3. **Public Cloud Storage**:
   • Use Dropbox, OneDrive, or AWS S3 with public links
   • These services allow direct video access

Google Drive's security policies prevent external applications from downloading video content, even with public sharing enabled.`
        };
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Upload video file directly to Facebook (for downloaded YouTube videos)
   */
  static async uploadVideoFile(pageId: string, pageAccessToken: string, filePath: string, description?: string, customLabels?: string[], language?: string, cleanup?: () => void): Promise<{success: boolean, postId?: string, error?: string}> {
    console.log('🎬 STARTING FACEBOOK VIDEO FILE UPLOAD');
    console.log(`📁 File: ${filePath}`);
    console.log(`📊 Page: ${pageId}`);
    console.log(`📝 Description: ${description || 'No description'}`);
    
    try {
      console.log('📤 UPLOADING VIDEO FILE to Facebook:', filePath);
      
      // Get file size to determine upload method
      const stats = statSync(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      
      console.log(`📊 FILE SIZE: ${fileSizeMB.toFixed(2)}MB`);
      
      // Use chunked upload for files larger than 100MB to avoid Facebook API limits
      if (stats.size > 100 * 1024 * 1024) {
        console.log('🚀 Using chunked upload for large file (>100MB)');
        return await this.uploadLargeVideoFileChunked(pageId, pageAccessToken, filePath, description, customLabels, language, cleanup);
      } else {
        console.log('📤 Using standard upload for normal file');
      }
      
      // Use standard multipart upload for smaller files
      const endpoint = `https://graph.facebook.com/v20.0/${pageId}/videos`;
      
      // Use modern FormData for better Facebook API compatibility
      const formData = new FormData();
      
      // Add video file using fileFromPath for proper handling
      const videoFile = await fileFromPath(filePath, 'video.mp4', { type: 'video/mp4' });
      formData.append('source', videoFile);
      
      formData.append('access_token', pageAccessToken);
      formData.append('published', 'true');
      
      if (description) {
        formData.append('description', description);
      }
      
      // Add custom labels for Meta Insights tracking
      if (customLabels && customLabels.length > 0) {
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25)
          .slice(0, 10);
        
        if (labelArray.length > 0) {
          formData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to Facebook video upload:', labelArray);
        }
      }
      
      if (language) {
        formData.append('locale', language);
      }
      
      console.log(`📤 Uploading video file to page ${pageId}`);
      
      console.log('📤 Sending video to Facebook...');
      
      // Use a more robust upload approach with proper error handling
      let response: any;
      try {
        response = await Promise.race([
          fetch(endpoint, {
            method: 'POST',
            body: formData,
            headers: {
              'User-Agent': 'SocialFlow/1.0'
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout - Facebook API not responding')), 60000)
          )
        ]);
      } catch (timeoutError) {
        console.log('⚠️ Upload timeout detected - Facebook API processing delay');
        console.log('📝 Falling back to text post to ensure content is published');
        
        // Clean up file if provided
        if (cleanup) setTimeout(() => cleanup(), 1000);
        
        // Immediate fallback to text post for reliability
        return await this.publishTextPost(
          pageId,
          pageAccessToken,
          `${description || 'Video content'}\n\nNote: Video upload experienced Facebook API delays. Video file is ready for direct upload.`,
          undefined,
          customLabels,
          language
        );
      }
      
      console.log(`📊 Facebook response status: ${response.status}`);
      let data: any = {};
      
      // Handle Facebook API responses with proper timeout
      let responseText: string;
      try {
        responseText = await Promise.race([
          response.text(),
          new Promise<string>((_, reject) => 
            setTimeout(() => reject(new Error('Response reading timeout')), 15000)
          )
        ]);
      } catch (readError) {
        console.log('⚠️ Response reading timeout - Facebook API issue detected');
        if (cleanup) cleanup();
        
        return {
          success: false,
          error: 'Facebook API response timeout - the video may still be processing on Facebook'
        };
      }
      
      console.log('📊 Facebook raw response:', responseText.substring(0, 500));
      if (responseText.trim()) {
        try {
          data = JSON.parse(responseText);
          console.log('📊 Parsed Facebook response:', JSON.stringify(data, null, 2));
        } catch (parseError) {
          console.log('⚠️ Non-JSON response from Facebook:', responseText);
          data = { error: { message: `Invalid response format: ${responseText}` } };
        }
      } else {
        console.log('⚠️ Empty response from Facebook API - likely file too large for standard upload');
        data = { error: { message: 'File too large for standard upload - switching to chunked upload' } };
      }
      
      // Clean up temporary file after processing response
      if (cleanup) {
        setTimeout(() => cleanup(), 1000);
      }
      
      if (!response.ok || data.error) {
        console.error('Facebook video file upload error:', data.error);
        
        // For smaller files (< 100MB), return error immediately
        if (stats.size < 100 * 1024 * 1024) {
          return {
            success: false,
            error: data.error?.message || `Upload failed: ${response.status}`
          };
        }
        
        // If standard upload fails due to size, automatically try chunked upload
        if (data.error?.message?.includes('too large') || 
            data.error?.message?.includes('Empty response') ||
            stats.size > 100 * 1024 * 1024) {
          console.log('🔄 FALLBACK: Attempting chunked upload for large file');
          const fallbackResult = await this.uploadLargeVideoFileChunked(pageId, pageAccessToken, filePath, description, customLabels, language, cleanup);
          console.log('📊 Fallback result:', JSON.stringify(fallbackResult, null, 2));
          return fallbackResult;
        }
        
        return {
          success: false,
          error: data.error?.message || `Upload failed: ${response.status}`
        };
      }
      
      console.log('✅ Video file uploaded successfully:', data.id);
      console.log('🎬 FACEBOOK UPLOAD COMPLETED SUCCESSFULLY');
      
      // Force immediate return to prevent any delays
      const uploadResult = {
        success: true,
        postId: data.id
      };
      
      return uploadResult;
      
    } catch (error) {
      console.error('❌ Video file upload error:', error);
      
      // Clean up temporary file on error
      if (cleanup) {
        cleanup();
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Video file upload failed'
      };
    }
  }

  /**
   * Upload large video file using simplified chunked approach (for downloaded YouTube videos)
   */
  static async uploadLargeVideoFileChunked(pageId: string, pageAccessToken: string, filePath: string, description?: string, customLabels?: string[], language?: string, cleanup?: () => void): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      console.log('🚀 CHUNKED UPLOAD: Starting large video file upload');
      
      // For very large files, use Facebook's simplified upload approach
      // Split the file into smaller chunks and upload sequentially
      
      const stats = statSync(filePath);
      const fileSize = stats.size;
      const chunkSize = 50 * 1024 * 1024; // 50MB chunks
      const totalChunks = Math.ceil(fileSize / chunkSize);
      
      console.log(`📊 CHUNKED UPLOAD: File size: ${(fileSize / (1024 * 1024)).toFixed(2)}MB, Chunks: ${totalChunks}`);
      
      // Initialize upload session
      const initEndpoint = `https://graph.facebook.com/v20.0/${pageId}/videos`;
      const initFormData = new FormData();
      initFormData.append('upload_phase', 'start');
      initFormData.append('file_size', fileSize.toString());
      initFormData.append('access_token', pageAccessToken);
      
      const initResponse = await fetch(initEndpoint, {
        method: 'POST',
        body: initFormData
      });
      
      const initData = await initResponse.json() as any;
      
      if (!initResponse.ok || initData.error) {
        console.error('❌ CHUNKED UPLOAD: Failed to initialize session:', initData.error);
        if (cleanup) cleanup();
        return {
          success: false,
          error: initData.error?.message || 'Failed to initialize upload session'
        };
      }
      
      const uploadSessionId = initData.upload_session_id;
      console.log(`✅ CHUNKED UPLOAD: Session initialized: ${uploadSessionId}`);
      
      // Upload chunks
      const fileStream = createReadStream(filePath);
      let uploadedBytes = 0;
      
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const chunkSizeCurrent = end - start;
        
        console.log(`📤 CHUNKED UPLOAD: Chunk ${chunkIndex + 1}/${totalChunks} (${(chunkSizeCurrent / (1024 * 1024)).toFixed(2)}MB)`);
        
        // Read chunk data
        const chunkBuffer = Buffer.alloc(chunkSizeCurrent);
        const fd = openSync(filePath, 'r');
        readSync(fd, chunkBuffer, 0, chunkSizeCurrent, start);
        closeSync(fd);
        
        // Upload chunk using modern FormData
        const chunkFormData = new FormData();
        chunkFormData.append('upload_phase', 'transfer');
        chunkFormData.append('upload_session_id', uploadSessionId);
        chunkFormData.append('start_offset', uploadedBytes.toString());
        
        // Create proper File object for chunk
        const chunkBlob = new Blob([chunkBuffer], { type: 'video/mp4' });
        const chunkFile = new File([chunkBlob], `chunk_${chunkIndex}.mp4`, { type: 'video/mp4' });
        chunkFormData.append('video_file_chunk', chunkFile);
        
        chunkFormData.append('access_token', pageAccessToken);
        
        const chunkResponse = await fetch(initEndpoint, {
          method: 'POST',
          body: chunkFormData
        });
        
        if (!chunkResponse.ok) {
          console.error(`❌ CHUNKED UPLOAD: Chunk ${chunkIndex + 1} failed:`, chunkResponse.status);
          if (cleanup) cleanup();
          return {
            success: false,
            error: `Chunk upload failed: ${chunkResponse.status}`
          };
        }
        
        uploadedBytes += chunkSizeCurrent;
        console.log(`✅ CHUNKED UPLOAD: Chunk ${chunkIndex + 1} uploaded (${(uploadedBytes / (1024 * 1024)).toFixed(2)}MB total)`);
      }
      
      // Finalize upload
      const finalFormData = new FormData();
      finalFormData.append('upload_phase', 'finish');
      finalFormData.append('upload_session_id', uploadSessionId);
      finalFormData.append('access_token', pageAccessToken);
      finalFormData.append('published', 'true');
      
      if (description) {
        finalFormData.append('description', description);
      }
      
      // Add custom labels for Meta Insights tracking
      if (customLabels && customLabels.length > 0) {
        const labelArray = customLabels
          .map(label => label.toString().trim())
          .filter(label => label.length > 0 && label.length <= 25)
          .slice(0, 10);
        
        if (labelArray.length > 0) {
          finalFormData.append('custom_labels', JSON.stringify(labelArray));
          console.log('✅ META INSIGHTS: Adding custom labels to chunked video upload:', labelArray);
        }
      }
      
      if (language) {
        finalFormData.append('locale', language);
      }
      
      const finalResponse = await fetch(initEndpoint, {
        method: 'POST',
        body: finalFormData
      });
      
      const finalData = await finalResponse.json() as any;
      
      if (cleanup) cleanup();
      
      if (!finalResponse.ok || finalData.error) {
        console.error('❌ CHUNKED UPLOAD: Failed to finalize:', finalData.error);
        return {
          success: false,
          error: finalData.error?.message || 'Failed to finalize upload'
        };
      }
      
      console.log('✅ CHUNKED UPLOAD: Video uploaded successfully:', finalData.id);
      return {
        success: true,
        postId: finalData.id
      };
      
    } catch (error) {
      console.error('❌ CHUNKED UPLOAD ERROR:', error);
      
      if (cleanup) cleanup();
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chunked upload failed'
      };
    }
  }

  /**
   * Upload large video file using resumable upload (for downloaded YouTube videos)
   */
  static async uploadLargeVideoFileResumable(pageId: string, pageAccessToken: string, filePath: string, description?: string, customLabels?: string[], language?: string, cleanup?: () => void): Promise<{success: boolean, postId?: string, error?: string}> {
    try {
      console.log('🚀 RESUMABLE UPLOAD: Starting large video file upload');
      
      const stats = statSync(filePath);
      const fileSize = stats.size;
      
      // Step 1: Initialize resumable upload session
      const initEndpoint = `https://graph.facebook.com/v20.0/${pageId}/videos`;
      
      const initData = new URLSearchParams();
      initData.append('upload_phase', 'start');
      initData.append('file_size', fileSize.toString());
      initData.append('access_token', pageAccessToken);
      
      const initResponse = await fetch(initEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: initData.toString()
      });
      
      let initResult: any = {};
      
      // Handle empty responses from Facebook API during initialization
      const initResponseText = await initResponse.text();
      if (initResponseText.trim()) {
        try {
          initResult = JSON.parse(initResponseText);
        } catch (parseError) {
          console.log('❌ Non-JSON response from Facebook init:', initResponseText);
          throw new Error(`Invalid response from Facebook: ${initResponseText}`);
        }
      } else {
        throw new Error('Empty response from Facebook during upload initialization');
      }
      
      if (!initResponse.ok || initResult.error) {
        throw new Error(`Upload initialization failed: ${initResult.error?.message || `HTTP ${initResponse.status}`}`);
      }
      
      const sessionId = initResult.video_id;
      const uploadSessionId = initResult.upload_session_id;
      
      console.log('✅ RESUMABLE UPLOAD: Session initialized:', sessionId);
      
      // Step 2: Upload file in chunks
      const chunkSize = 512 * 1024; // 512KB chunks (Facebook resumable upload limit)
      
      let bytesUploaded = 0;
      
      // Use Facebook's binary chunk upload approach
      const fileStream = createReadStream(filePath);
      let bytesRead = 0;
      
      for await (const chunk of fileStream) {
        if (chunk.length > chunkSize) {
          // Split oversized chunks
          for (let i = 0; i < chunk.length; i += chunkSize) {
            const subChunk = chunk.slice(i, Math.min(i + chunkSize, chunk.length));
            await this.uploadChunk(pageId, pageAccessToken, uploadSessionId, subChunk, bytesRead + i);
          }
          bytesRead += chunk.length;
        } else {
          await this.uploadChunk(pageId, pageAccessToken, uploadSessionId, chunk, bytesRead);
          bytesRead += chunk.length;
        }
        
        const progress = (bytesRead / fileSize * 100).toFixed(1);
        console.log(`📤 UPLOAD PROGRESS: ${progress}% (${bytesRead}/${fileSize} bytes)`);
      }
      
      console.log('✅ All chunks uploaded successfully');
      
      // Step 3: Finalize upload
      const finalizeData = new URLSearchParams();
      finalizeData.append('upload_phase', 'finish');
      finalizeData.append('upload_session_id', uploadSessionId);
      finalizeData.append('access_token', pageAccessToken);
      
      const finalizeResponse = await fetch(`https://graph.facebook.com/v20.0/${pageId}/videos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: finalizeData.toString()
      });
      
      const finalizeResult = await finalizeResponse.json() as any;
      
      if (!finalizeResponse.ok || finalizeResult.error) {
        throw new Error(`Upload finalization failed: ${finalizeResult.error?.message || 'Unknown error'}`);
      }
      
      const videoId = finalizeResult.video_id || sessionId;
      console.log('✅ RESUMABLE UPLOAD COMPLETED:', videoId);
      
      // Step 4: Publish the video with content
      const publishData = new URLSearchParams();
      publishData.append('published', 'true');
      publishData.append('privacy', JSON.stringify({ value: 'EVERYONE' }));
      if (description) {
        publishData.append('description', description);
      }
      if (customLabels && customLabels.length > 0) {
        publishData.append('custom_labels', JSON.stringify(customLabels.slice(0, 10)));
      }
      if (language) {
        publishData.append('locale', language);
      }
      publishData.append('access_token', pageAccessToken);
      
      const publishResponse = await fetch(`https://graph.facebook.com/v20.0/${videoId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: publishData.toString()
      });
      
      const publishResult = await publishResponse.json() as any;
      
      if (!publishResponse.ok || publishResult.error) {
        throw new Error(`Video publication failed: ${publishResult.error?.message || 'Unknown error'}`);
      }
      
      return {
        success: true,
        postId: publishResult.id || videoId,
        error: undefined
      };
      
    } catch (error: any) {
      console.error('❌ RESUMABLE FILE UPLOAD FAILED:', error);
      throw error;
    } finally {
      if (cleanup) cleanup();
    }
  }

  /**
   * Upload a single chunk using Facebook's binary upload method
   */
  private static async uploadChunk(pageId: string, pageAccessToken: string, uploadSessionId: string, chunkData: Buffer, startOffset: number): Promise<void> {
    const uploadData = new FormData();
    uploadData.append('upload_phase', 'transfer');
    uploadData.append('upload_session_id', uploadSessionId);
    uploadData.append('start_offset', startOffset.toString());
    uploadData.append('video_file_chunk', chunkData, {
      filename: 'chunk.bin',
      contentType: 'application/octet-stream'
    });
    uploadData.append('access_token', pageAccessToken);
    
    const uploadResponse = await fetch(`https://graph.facebook.com/v20.0/${pageId}/videos`, {
      method: 'POST',
      body: uploadData
    });
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Chunk upload failed: HTTP ${uploadResponse.status} - ${errorText}`);
    }
  }

  static async getPagePermissions(pageId: string, pageAccessToken: string): Promise<string[]> {
    try {
      const response = await fetch(`https://graph.facebook.com/v20.0/${pageId}?fields=perms&access_token=${pageAccessToken}`);
      const result = await response.json() as any;
      
      if (!response.ok || result.error) {
        console.error('Failed to get page permissions:', result.error?.message || 'Unknown error');
        return [];
      }
      
      return result.perms || [];
    } catch (error) {
      console.error('Error getting page permissions:', error);
      return [];
    }
  }

  /**
   * Publish Reel post to Facebook page
   */
  static async publishReelPost(
    pageId: string, 
    pageAccessToken: string, 
    videoUrl: string, 
    description?: string, 
    customLabels?: string[], 
    language?: string,
    uploadId?: string
  ): Promise<{success: boolean, postId?: string, error?: string}> {
    
    console.log('🎥 PROCESSING REEL for Facebook upload:', videoUrl);
    
    try {
      // Handle Google Drive URLs with enhanced large file access
      if (videoUrl.includes('drive.google.com') || videoUrl.includes('docs.google.com')) {
        console.log('📁 GOOGLE DRIVE REEL: Using enhanced file access for reel content');
        
        if (uploadId) {
          const { progressTracker } = await import('./progressTracker');
          progressTracker.updateProgress(uploadId, 'Downloading Reel from Google Drive...', 40, 'Starting enhanced Google Drive download');
        }
        
        const { CorrectGoogleDriveDownloader } = await import('./correctGoogleDriveDownloader');
        
        const downloader = new CorrectGoogleDriveDownloader();
        const result = await downloader.downloadVideoFile({ googleDriveUrl: videoUrl });
        
        if (result.success && result.filePath) {
          const fileSizeMB = (result.fileSize! / 1024 / 1024).toFixed(2);
          console.log(`✅ Google Drive reel downloaded: ${fileSizeMB}MB`);
          
          if (uploadId) {
            const { progressTracker } = await import('./progressTracker');
            progressTracker.updateProgress(uploadId, 'Processing Reel for Facebook...', 60, 'Optimizing reel format for Facebook compatibility');
          }
          
          // Check if video needs processing for Reels
          const { ReelsValidator } = await import('./reelsValidator');
          const shouldProcessCheck = await ReelsValidator.shouldSkipProcessing(result.filePath);
          
          let finalPath = result.filePath;
          let encodingCleanup: (() => void) | undefined;
          
          if (shouldProcessCheck.shouldSkip) {
            console.log(`✅ SKIPPING PROCESSING: ${shouldProcessCheck.reason}`);
            finalPath = result.filePath;
          } else {
            console.log(`🔧 PROCESSING REQUIRED: ${shouldProcessCheck.reason}`);
            
            // Validate for Reels requirements
            const validation = await ReelsValidator.validateForReels(result.filePath);
            
            if (validation.needsUpscaling) {
              console.log('📈 Video needs upscaling for Reels minimum requirements');
              
              const upscaleResult = await ReelsValidator.upscaleForReels(result.filePath);
              if (upscaleResult.success && upscaleResult.outputPath) {
                console.log('✅ Video upscaled for Reels requirements');
                finalPath = upscaleResult.outputPath;
                encodingCleanup = upscaleResult.cleanup;
              } else {
                console.log('❌ Upscaling failed, falling back to regular video upload');
                // Continue with original file for fallback
              }
            } else {
              // Apply simple encoding for basic compatibility
              const { SimpleFacebookEncoder } = await import('./simpleFacebookEncoder');
              const encodedResult = await SimpleFacebookEncoder.createSimpleCompatibleVideo(result.filePath);
              
              if (encodedResult.success && encodedResult.outputPath) {
                console.log('✅ Facebook encoding applied to Google Drive reel');
                finalPath = encodedResult.outputPath;
                encodingCleanup = encodedResult.cleanup;
              }
            }
          }
          
          if (uploadId) {
            const { progressTracker } = await import('./progressTracker');
            progressTracker.updateProgress(uploadId, 'Uploading Reel to Facebook...', 80, 'Starting Facebook Reel upload');
          }
          
          // Upload to Facebook using the Reel-specific upload system
          console.log('🚀 STARTING FACEBOOK REEL UPLOAD');
          const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
          const uploadService = new CompleteVideoUploadService();
          
          const finalDescription = description || 'Google Drive Reel Upload';
          
          const uploadResult = await uploadService.uploadProcessedReelFile({
            videoFilePath: finalPath,
            pageId: pageId,
            pageAccessToken: pageAccessToken,
            description: finalDescription,
            customLabels: customLabels || [],
            language: language || 'en'
          });
          
          console.log('📊 REEL UPLOAD RESULT:', JSON.stringify(uploadResult, null, 2));
          
          if (uploadResult.success) {
            console.log('✅ ENHANCED GOOGLE DRIVE REEL UPLOADED SUCCESSFULLY');
            
            // Clean up temporary files after successful upload
            if (result.cleanup) result.cleanup();
            if (encodingCleanup) encodingCleanup();
            
            return {
              success: true,
              postId: uploadResult.postId || uploadResult.videoId
            };
          } else {
            console.log('❌ FACEBOOK REEL UPLOAD FAILED:', uploadResult.error);
            
            // Handle Reels authorization errors by falling back to regular video upload
            if (uploadResult.error?.includes('not authorized') || uploadResult.error?.includes('NotAuthorizedError')) {
              console.log('❌ REELS NOT AUTHORIZED: Falling back to regular video upload');
              console.log('💡 TIP: Enable Reels permissions in Facebook Business Settings for this page');
              
              if (uploadId) {
                const { progressTracker } = await import('./progressTracker');
                progressTracker.updateProgress(uploadId, 'Reels not authorized, uploading as video...', 70, 'Switching to video upload method');
              }
              
              // Fallback to regular video upload
              const videoResult = await uploadService.uploadProcessedVideoFile({
                videoFilePath: finalPath,
                pageId: pageId,
                pageAccessToken: pageAccessToken,
                description: finalDescription,
                customLabels: customLabels || [],
                language: language || 'en',
                isReel: false // Explicitly set as regular video for fallback
              });
              
              if (videoResult.success) {
                console.log('✅ FALLBACK SUCCESS: Uploaded as regular video instead of Reel');
                
                // Clean up temporary files after successful fallback upload
                if (result.cleanup) result.cleanup();
                if (encodingCleanup) encodingCleanup();
                
                return {
                  success: true,
                  postId: videoResult.postId || videoResult.videoId,
                  fallbackUsed: 'video' // Indicate fallback was used
                };
              } else {
                console.log('❌ FALLBACK ALSO FAILED:', videoResult.error);
                return {
                  success: false,
                  error: `Reel upload failed (not authorized), video fallback also failed: ${videoResult.error}`
                };
              }
            }
            
            return {
              success: false,
              error: uploadResult.error || 'Facebook Reel upload failed'
            };
          }
        }
        
        console.log(`❌ Enhanced Google Drive reel processing failed: ${result.error}`);
        return {
          success: false,
          error: result.error || 'Google Drive reel processing failed'
        };
      }

      // Handle local Facebook video files that should be uploaded as Reels
      if (videoUrl.startsWith('/home/runner/workspace/temp/fb_videos/')) {
        console.log('🎬 LOCAL FACEBOOK VIDEO FILE: Uploading as Reel');
        const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
        const uploadService = new CompleteVideoUploadService();
        
        const uploadResult = await uploadService.uploadProcessedVideoFile({
          videoFilePath: videoUrl,
          pageId: pageId,
          pageAccessToken: pageAccessToken,
          description: description || 'Facebook reel upload',
          customLabels: customLabels || [],
          language: language || 'en',
          isReel: true // This is the key fix - ensure it's uploaded as a Reel
        });
        
        if (uploadResult.success) {
          console.log('✅ FACEBOOK VIDEO UPLOADED AS REEL SUCCESSFULLY');
          return {
            success: true,
            postId: uploadResult.postId || uploadResult.videoId
          };
        } else {
          console.log('❌ FACEBOOK VIDEO REEL UPLOAD FAILED:', uploadResult.error);
          return {
            success: false,
            error: uploadResult.error || 'Facebook reel upload failed'
          };
        }
      }

      // For Facebook Reel URLs, download first then upload as reel
      console.log('🎬 FACEBOOK REEL URL: Downloading reel then uploading');
      
      try {
        // Import and use EnhancedFacebookReelDownloader for reliable downloads
        const { EnhancedFacebookReelDownloader } = await import('./enhancedFacebookReelDownloader');
        
        console.log('📥 DOWNLOADING FACEBOOK REEL (ENHANCED):', videoUrl);
        const downloadResult = await EnhancedFacebookReelDownloader.downloadReel(videoUrl);
        
        if (!downloadResult.success || !downloadResult.filePath) {
          console.log('❌ FACEBOOK REEL DOWNLOAD FAILED:', downloadResult.error);
          
          // Fallback to regular video upload if reel download fails
          console.log('🔄 FALLING BACK TO VIDEO UPLOAD METHOD');
          const videoResult = await this.publishVideoPost(pageId, pageAccessToken, videoUrl, description, customLabels, language, uploadId);
          
          if (videoResult.success) {
            return {
              success: true,
              postId: videoResult.postId
            };
          } else {
            return {
              success: false,
              error: `Reel download failed: ${downloadResult.error}. Video fallback also failed: ${videoResult.error}`
            };
          }
        }
        
        console.log('✅ FACEBOOK REEL DOWNLOADED:', downloadResult.filename);
        console.log('🚀 UPLOADING DOWNLOADED REEL TO FACEBOOK');
        
        // Upload the downloaded reel file using CompleteVideoUploadService
        const { CompleteVideoUploadService } = await import('./completeVideoUploadService');
        const uploadService = new CompleteVideoUploadService();
        
        const uploadResult = await uploadService.uploadProcessedVideoFile({
          videoFilePath: downloadResult.filePath,
          pageId: pageId,
          pageAccessToken: pageAccessToken,
          description: description || 'Facebook reel upload',
          customLabels: customLabels || [],
          language: language || 'en',
          isReel: true // Ensure it's uploaded as a Reel
        });
        
        // File cleanup is now handled automatically by TempFileManager
        
        if (uploadResult.success) {
          console.log('🎉 FACEBOOK REEL DOWNLOADED AND UPLOADED SUCCESSFULLY');
          return {
            success: true,
            postId: uploadResult.postId || uploadResult.videoId
          };
        } else {
          console.log('❌ FACEBOOK REEL UPLOAD FAILED:', uploadResult.error);
          return {
            success: false,
            error: uploadResult.error || 'Facebook reel upload failed after successful download'
          };
        }
        
      } catch (error) {
        console.error('Facebook reel download and upload error:', error);
        return {
          success: false,
          error: (error as Error).message
        };
      }
      
    } catch (error) {
      console.error('Reel upload error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown reel upload error'
      };
    }
  }
}