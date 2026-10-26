import mongoose from 'mongoose';
import { config } from '../config/index.js';

/**
 * Quản lý kết nối MongoDB Atlas Cloud với cơ chế auto-reconnect
 */
export async function connectDatabase() {
  if (!config.mongoUri || config.mongoUri.includes('<db_password>')) {
    console.warn('[MongoDB] [WARN] Chua thiet lap MONGODB_URI hoac chua thay <db_password> trong .env!');
    return false;
  }

  try {
    mongoose.connection.on('connected', () => {
      console.log('[MongoDB] [INFO] Ket noi co so du lieu MongoDB Atlas thanh cong.');
    });

    mongoose.connection.on('error', (err) => {
      console.error('[MongoDB] [ERROR] Loi ket noi:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] [WARN] Mat ket noi toi MongoDB, dang thu ket noi lai...');
    });

    await mongoose.connect(config.mongoUri);
    return true;
  } catch (error) {
    console.error('[MongoDB] Khởi tạo kết nối thất bại:', error.message);
    return false;
  }
}
