import { v2 as cloudinary } from 'cloudinary';

export const deleteCloudinaryMedia = async (urls) => {
  const mediaUrls = Array.isArray(urls) ? urls : [urls];

  for (const mediaUrl of mediaUrls) {
    if (typeof mediaUrl !== 'string') continue;

    try {
      const parsedUrl = new URL(mediaUrl);
      if (parsedUrl.hostname !== 'res.cloudinary.com') continue;

      const pathParts = parsedUrl.pathname.split('/');
      const uploadIndex = pathParts.indexOf('upload');
      if (uploadIndex < 0) continue;

      const publicIdParts = pathParts.slice(uploadIndex + 1);
      if (/^v\d+$/.test(publicIdParts[0] || '')) publicIdParts.shift();

      const publicId = decodeURIComponent(publicIdParts.join('/')).replace(/\.[^/.]+$/, '');
      if (publicId) {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      }
    } catch (error) {
      console.warn('Failed to delete Cloudinary media:', error.message);
    }
  }
};