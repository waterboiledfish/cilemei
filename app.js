const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB
  }
});

let pool = null;
let initPromise = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL，请在 .env 或 Vercel 环境变量中配置');
  }
  const needsSsl = /sslmode=require/i.test(connectionString) || process.env.VERCEL === '1';
  pool = new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

async function initDatabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS health_profiles (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        height_cm REAL,
        weight_kg REAL,
        diseases TEXT,
        allergies TEXT,
        lifestyle TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS advice_history (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  })();
  return initPromise;
}

function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: '未提供登录凭证' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: '登录已过期或无效，请重新登录' });
  }
}

async function callAiApi(prompt) {
  const baseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return (
      '（当前未配置真实 AI 接口，下面是基于规则的示例建议）\n\n' +
      '1. 保持三餐规律，多吃蔬菜水果，避免高油高盐食物。\n' +
      '2. 根据你的身高体重，建议每天适度运动 30 分钟，例如快走或慢跑。\n' +
      '3. 注意定期复查已有疾病，遵医嘱用药，遇到不适及时就医。\n' +
      '4. 对于过敏原要严格回避，仔细查看食品成分表。\n' +
      '5. 保证充足睡眠，保持心情愉快，有助于整体健康。'
    );
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s，在 Vercel 免费版 10s 限制前返回
    const resp = await fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的中文营养与生活方式健康顾问，请根据用户提供的身高体重、疾病史、过敏史和生活习惯，给出个性化、具体、可执行的饮食和生活习惯建议。要有条理、有分点，语气温和鼓励。'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error('AI API 调用失败', await resp.text());
      throw new Error('AI API 调用失败');
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || 'AI 没有返回内容，请稍后重试。';
  } catch (err) {
    if (err?.name === 'AbortError') {
      return 'AI 响应超时，请稍后重试。（若使用 Vercel 免费版，单次请求约 10 秒限制）';
    }
    console.error('调用 AI 出错', err);
    return '调用 AI 接口失败，请检查配置或稍后重试。';
  }
}

async function callAiVisionApi({ prompt, imageBase64DataUrl }) {
  const baseUrl = process.env.AI_API_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return {
      foods: ['（未配置真实 AI：示例）米饭', '鸡胸肉', '西兰花'],
      notes: '当前未配置真实 AI 视觉接口，返回的是示例识别结果。',
      raw: null
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s，在 Vercel 免费版 10s 限制前返回
    const resp = await fetch(baseUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              '你是一个中文营养与膳食识别助手。请先从图片中识别食物/饮品，尽量给出具体品类（如“清蒸鲈鱼”“拿铁咖啡”“宫保鸡丁”），然后根据用户健康档案提供饮食建议。输出必须是 JSON。'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64DataUrl } }
            ]
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      console.error('AI Vision API 调用失败', await resp.text());
      throw new Error('AI Vision API 调用失败');
    }

    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return { foods: [], notes: 'AI 未返回内容', raw: data };

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const foods = [];
      const foodsMatch = text.match(/"foods"\s*:\s*\[([\s\S]*?)\]/);
      if (foodsMatch && foodsMatch[1]) {
        foodsMatch[1]
          .split(',')
          .map((s) => s.replace(/[\[\]"]/g, '').trim())
          .filter(Boolean)
          .forEach((item) => foods.push(item));
      }
      return { foods, notes: '', raw: { advice: text } };
    }

    const foods = Array.isArray(parsed.foods)
      ? parsed.foods
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];

    return { foods, notes: parsed.notes || '', raw: parsed };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { foods: [], notes: 'AI 视觉识别超时，请稍后重试或换一张图。', raw: null };
    }
    console.error('调用 AI 视觉出错', err);
    return { foods: [], notes: '调用 AI 视觉接口失败，请检查配置或稍后重试。', raw: null };
  }
}

function createApiApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ===== Auth =====
  app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: '邮箱和密码为必填项' });

    try {
      const passwordHash = await bcrypt.hash(password, 10);
      const p = getPool();
      const result = await p.query(
        'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id',
        [email, passwordHash, name || null]
      );
      const user = { id: result.rows[0].id, email, name: name || null };
      const token = generateToken(user);
      return res.json({ token, user });
    } catch (err) {
      if (err && err.code === '23505') return res.status(409).json({ error: '该邮箱已被注册' });
      console.error('注册失败', err);
      return res.status(500).json({ error: '服务器错误，注册失败' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: '邮箱和密码为必填项' });

    try {
      const p = getPool();
      const result = await p.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [
        email
      ]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: '邮箱或密码错误' });

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: '邮箱或密码错误' });

      const token = generateToken(user);
      return res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name }
      });
    } catch (err) {
      console.error('登录失败', err);
      return res.status(500).json({ error: '服务器错误，登录失败' });
    }
  });

  // ===== Me/Profile =====
  app.get('/api/me', authMiddleware, async (req, res) => {
    try {
      const p = getPool();
      const userRes = await p.query('SELECT id, email, name FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      if (!user) return res.status(500).json({ error: '获取用户信息失败' });

      const profileRes = await p.query(
        `SELECT height_cm, weight_kg, diseases, allergies, lifestyle, updated_at
         FROM health_profiles
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT 1`,
        [req.user.id]
      );
      const profile = profileRes.rows[0] || null;
      return res.json({ user, profile });
    } catch (err) {
      console.error('获取用户信息失败', err);
      return res.status(500).json({ error: '获取用户信息失败' });
    }
  });

  app.post('/api/health', authMiddleware, async (req, res) => {
    const { height_cm, weight_kg, diseases, allergies, lifestyle } = req.body || {};
    const now = new Date().toISOString();

    try {
      const p = getPool();
      const result = await p.query(
        `INSERT INTO health_profiles (user_id, height_cm, weight_kg, diseases, allergies, lifestyle, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, updated_at`,
        [
          req.user.id,
          height_cm ?? null,
          weight_kg ?? null,
          diseases || '',
          allergies || '',
          lifestyle || '',
          now
        ]
      );
      const row = result.rows[0];
      return res.json({
        success: true,
        profile: {
          id: row.id,
          user_id: req.user.id,
          height_cm,
          weight_kg,
          diseases,
          allergies,
          lifestyle,
          updated_at: row.updated_at
        }
      });
    } catch (err) {
      console.error('保存健康档案失败', err);
      return res.status(500).json({ error: '保存健康档案失败' });
    }
  });

  // ===== AI text analyze (stream) =====
  app.post('/api/analyze', authMiddleware, async (req, res) => {
    const { height_cm, weight_kg, diseases, allergies, lifestyle } = req.body || {};

    const prompt = `
用户基本健康信息：
- 身高：${height_cm || '未填写'} cm
- 体重：${weight_kg || '未填写'} kg
- 已知疾病史：${diseases || '未填写'}
- 过敏史：${allergies || '未填写'}
- 当前生活习惯：${lifestyle || '未填写'}

请你根据以上信息，从以下几个方面给出详细的中文建议：
1. 总体健康状况及需要注意的问题；
2. 每日饮食结构建议（早餐/午餐/晚餐和加餐示例）；
3. 需要限制或避免的食物；
4. 运动与作息建议（频次、时长、类型）；
5. 针对疾病史和过敏史的特别提醒；
6. 可以从今天开始的小目标计划。
`;

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const advice = await callAiApi(prompt);
    try {
      const p = getPool();
      await p.query(
        'INSERT INTO advice_history (user_id, type, content) VALUES ($1, $2, $3)',
        [req.user.id, 'text', advice]
      );
    } catch (e) {
      console.error('保存建议历史失败', e);
    }
    const chunks = advice.split(/(\n\n|\n)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      res.write(chunk);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
    }
    res.end();
  });

  // ===== 建议历史列表 =====
  app.get('/api/advice-history', authMiddleware, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;
    try {
      const p = getPool();
      const listRes = await p.query(
        `SELECT id, type, content, created_at
         FROM advice_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      );
      const countRes = await p.query(
        'SELECT COUNT(*) AS total FROM advice_history WHERE user_id = $1',
        [req.user.id]
      );
      const total = parseInt(countRes.rows[0].total, 10);
      const list = listRes.rows.map((row) => ({
        id: row.id,
        type: row.type,
        content: row.content,
        content_preview: row.content ? row.content.slice(0, 120) + (row.content.length > 120 ? '…' : '') : '',
        created_at: row.created_at
      }));
      return res.json({ list, total });
    } catch (err) {
      console.error('获取建议历史失败', err);
      return res.status(500).json({ error: '获取建议历史失败' });
    }
  });

  // ===== Food image analyze (stream) =====
  app.post('/api/food-analyze', authMiddleware, upload.single('image'), async (req, res) => {
    const { height_cm, weight_kg, diseases, allergies, lifestyle } = req.body || {};
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: '请先上传/拍照一张食物图片' });

    const mime = req.file.mimetype || 'image/jpeg';
    const base64 = req.file.buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    const visionPrompt = `
你将收到一张用户拍摄的食物图片，以及用户健康档案。请输出 JSON，格式如下：
{
  "foods": ["识别到的食物1", "识别到的食物2"],
  "nutrition_notes": "简短说明这顿可能的营养结构与风险点（如高盐高油/高糖/缺少蔬菜等）",
  "advice": "给用户的饮食建议与生活习惯建议，要求分点、具体可执行",
  "cautions": "针对疾病史/过敏史的特别提醒（如果没有就写空字符串）"
}

用户健康信息：
- 身高：${height_cm || '未填写'} cm
- 体重：${weight_kg || '未填写'} kg
- 已知疾病史：${diseases || '未填写'}
- 过敏史：${allergies || '未填写'}
- 当前生活习惯：${lifestyle || '未填写'}
`;

    const vision = await callAiVisionApi({ prompt: visionPrompt, imageBase64DataUrl: dataUrl });
    const foodsList = (vision.foods || []).filter(Boolean);

    const raw = vision.raw || {};
    const nutritionNotes = Array.isArray(raw.nutrition_notes) ? raw.nutrition_notes.join('\n') : raw.nutrition_notes || '';
    const adviceText = Array.isArray(raw.advice)
      ? raw.advice.map((x, i) => `${i + 1}. ${x}`).join('\n')
      : raw.advice || vision.notes || '暂无建议';
    const cautionsText = Array.isArray(raw.cautions) ? raw.cautions.join('\n') : raw.cautions || '';

    const finalText =
      `识别到的食物：${foodsList.length ? foodsList.join('、') : '（未能识别）'}\n` +
      (nutritionNotes ? `\n营养结构提示：\n${nutritionNotes}\n` : '') +
      `\n建议：\n${adviceText}\n` +
      (cautionsText ? `\n特别提醒：\n${cautionsText}\n` : '');

    try {
      const p = getPool();
      await p.query(
        'INSERT INTO advice_history (user_id, type, content) VALUES ($1, $2, $3)',
        [req.user.id, 'food', finalText]
      );
    } catch (e) {
      console.error('保存建议历史失败', e);
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const chunks = finalText.split(/(\n\n|\n)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      res.write(chunk);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 120));
    }
    res.end();
  });

  // 健康检查
  app.get('/api/healthz', async (req, res) => {
    try {
      await initDatabase();
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err?.message || err) });
    }
  });

  return app;
}

module.exports = {
  createApiApp,
  initDatabase
};

