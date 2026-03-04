require('dotenv').config();

const express = require('express');
const path = require('path');
const { createApiApp, initDatabase } = require('./app');

const PORT = process.env.PORT || 3000;

const apiApp = createApiApp();
const app = express();

// 本地开发：由同一个进程同时提供前端静态页 + API
app.use(express.static(path.join(__dirname, 'public')));
app.use(apiApp);

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`吃了吗 后端已启动: http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('初始化数据库失败，服务未启动', err);
    process.exit(1);
  });

