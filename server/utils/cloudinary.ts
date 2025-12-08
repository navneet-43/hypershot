import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

export default cloudinary;

export const uploadImage = async (fileBuffer: Buffer, mimeType: string = 'image/jpeg', folder: string = 'social_posts'): Promise<string> => {
  try {
    // Determine if it's a video or image
    const isVideo = mimeType.startsWith('video/');
    const resourceType = isVideo ? 'video' : 'image';
    
    // Convert buffer to base64 format
    const base64Data = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
    
    let uploadOptions: any = {
      folder,
      resource_type: resourceType,
    };
    
    // Add transformations only for images
    if (!isVideo) {
      uploadOptions.transformation = [
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ];
    } else {
      // Add video-specific options if needed
      uploadOptions.eager = [
        { quality: 'auto:good', format: 'mp4' }
      ];
    }
    
    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64Data, uploadOptions);

    // Return the secure URL of the uploaded media
    return result.secure_url;
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error('Failed to upload media to storage service');
  }
};

export const deleteImage = async (publicId: string): Promise<boolean> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
};