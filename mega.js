const mega = require('megajs');
const fs = require('fs');
const path = require('path');
const logger = require('pino')();

// Validate environment variables
if (!process.env.MEGA_EMAIL || !process.env.MEGA_PASSWORD) {
  logger.error('MEGA_EMAIL and MEGA_PASSWORD environment variables are required');
  process.exit(1);
}

const auth = {
  email: process.env.thinuranethsara999@gmail.com,
  password: process.env.Tn198312,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.135 Safari/537.36 Edge/12.246'
};

/**
 * Uploads a file to MEGA storage
 * @param {ReadableStream} fileStream - The file stream to upload
 * @param {string} filename - The name to give the uploaded file
 * @returns {Promise<string>} The public URL of the uploaded file
 */
const upload = (fileStream, filename) => {
  return new Promise((resolve, reject) => {
    const storage = new mega.Storage(auth);
    
    storage.on('ready', () => {
      logger.info('MEGA storage ready. Proceeding with upload.');
      
      const uploadStream = storage.upload({
        name: filename,
        allowUploadBuffering: true
      });
      
      uploadStream.on('complete', (file) => {
        logger.info(`File uploaded successfully: ${filename}`);
        storage.close();
        resolve(file.link);
      });
      
      uploadStream.on('error', (err) => {
        logger.error(`Upload error: ${err.message}`);
        storage.close();
        reject(err);
      });
      
      fileStream.pipe(uploadStream);
    });
    
    storage.on('error', (err) => {
      logger
