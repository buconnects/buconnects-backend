# buconnects-backend

## Content media migration

Before deploying content image support, run `migrations/20260930_add_content_image_urls.sql` once against the production MySQL database. It adds the nullable image URL fields used by campus updates and events. New images are uploaded to Cloudinary; configure the backend Cloudinary environment variables before use.