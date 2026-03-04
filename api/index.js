import { createApiApp, initDatabase } from '../app';

const app = createApiApp();
let readyPromise = null;

function ensureReady() {
  if (!readyPromise) {
    readyPromise = initDatabase().catch((err) => {
      console.error('初始化数据库失败', err);
      throw err;
    });
  }
  return readyPromise;
}

export default async function handler(req, res) {
  await ensureReady();
  return app(req, res);
}

