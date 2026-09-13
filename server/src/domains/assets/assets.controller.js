'use strict';

const ImageKit = require('imagekit');

let imagekit = null;

function getImageKit() {
  if (imagekit) return imagekit;
  
  if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
    console.warn('[ImageKit] Credentials missing. Uploads will fail.');
    return null;
  }
  
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
  
  return imagekit;
}

/**
 * Returns authentication parameters for client-side ImageKit upload.
 */
function getUploadAuth(req, res) {
  const ik = getImageKit();
  if (!ik) {
    return res.status(503).json({ error: 'ImageKit is not configured on the server.' });
  }
  
  const authParams = ik.getAuthenticationParameters();
  res.json(authParams);
}

module.exports = {
  getUploadAuth
};
