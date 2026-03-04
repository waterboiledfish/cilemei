// Vercel 用这一个入口处理所有 /api/* 请求（CommonJS，避免 ESM 崩溃）
const { createApiApp, initDatabase } = require('../app');

let app = null;
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

module.exports = async function handler(req, res) {
  try {
    await ensureReady();
    if (!app) app = createApiApp();
    return app(req, res);
  } catch (err) {
    console.error('API handler error', err);
    res.status(500).json({ error: '服务器错误', message: err?.message || String(err) });
  }
};
