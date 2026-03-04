下面是一份你可以直接放在仓库里的项目文档（例如命名为 README.md），整体用来介绍你的“吃了吗”网站。
吃了吗 · 健康饮食与生活方式 AI 顾问
“吃了吗”是一个面向个人用户的健康饮食与生活方式辅助网站。
用户可以注册登录、维护自己的健康档案，并通过文字输入或拍照上传食物，由 AI 给出个性化的饮食和生活习惯建议。
功能概览
用户系统
邮箱 + 密码注册 / 登录
JWT 鉴权，前端持久化登录状态
健康档案管理
录入并保存：
身高（cm）
体重（kg）
疾病史
过敏史
当前生活习惯
后端存储最近一次健康档案，可随时修改和再次分析
AI 健康建议（文字）
基于健康档案调用 AI 模型（DashScope / Qwen）
生成：
总体健康点评
一日三餐饮食结构建议
需要限制 / 避免的食物
运动与作息建议
针对疾病和过敏的特别提醒
可执行的小目标计划
前端通过流式渲染逐段显示生成内容，体验类似实时输出
拍照识别食物 + 建议
支持拍照 / 上传食物图片
图片预览区域支持：
鼠标滚轮缩放、拖拽移动
手机双指缩放、拖拽移动
一键重置视图
后端调用视觉模型识别食物，并结合健康档案返回：
识别到的食物列表
营养结构提示
分点列出的饮食与生活建议
特别提醒（疾病史、过敏史相关）
同样采用伪流式输出，前端一边接收一边展示
技术栈
前端
纯 HTML + CSS + 原生 JavaScript
单页应用结构，界面采用深色、卡片式布局
Fetch + ReadableStream 实现文本流式渲染
后端
Node.js + Express（封装在 app.js 中）
JWT (jsonwebtoken) 进行登录状态管理
Multer 处理图片上传
AI 调用封装：
文本分析：/api/analyze
图像识别：/api/food-analyze
数据库
Supabase Postgres（云数据库）
通过 pg 连接，使用连接池 URI（pooler）
表结构：
users：用户信息（email 唯一，password_hash 使用 bcryptjs 加密）
health_profiles：用户健康档案（多条记录，按 updated_at 取最新）
部署
前端：Vercel 静态托管（public/ 目录）
后端 API：Vercel Serverless Functions（api/[[...path]].js），内部复用 Express 应用
AI 能力：阿里云 DashScope OpenAI 兼容接口（/compatible-mode/v1/chat/completions）
目录结构简要
public/
index.html：页面结构
style.css：整体样式与响应式布局
main.js：前端逻辑、表单处理、API 调用与流式渲染、图片缩放和拖拽
app.js
创建 Express 应用，挂载所有 /api/* 路由以及数据库初始化逻辑
api/[[...path]].js
Vercel 的统一 API 入口，将所有 /api/* 请求转发给 app.js 中的 Express 应用
server.js
本地开发使用的入口：同时提供静态前端与本地 API 服务
.env.example
环境变量示例
vercel.json
Vercel 路由重写配置（将 /api/* 指向 api/[[...path]].js，前端走 public/）
环境变量说明
在本地 .env 与 Vercel 环境变量中，需要配置：
鉴权
JWT_SECRET：JWT 签名密钥
AI（DashScope / Qwen）
AI_API_BASE_URL：https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
AI_API_KEY：DashScope 的 sk-... 密钥
AI_MODEL：文字模型（如 qwen-vl-plus）
AI_VISION_MODEL：视觉模型（如 qwen-vl-plus，支持图片输入）
数据库（Supabase Postgres Pooler URI）
DATABASE_URL：
形如：
postgresql://postgres:密码@aws-0-xxx-pooler.supabase.com:6543/postgres?sslmode=require
本地运行说明
安装依赖：
npm install
配置 .env：
JWT_SECRET=任意长随机串AI_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completionsAI_API_KEY=你的 DashScope sk-...AI_MODEL=qwen-vl-plusAI_VISION_MODEL=qwen-vl-plusDATABASE_URL=postgresql://postgres:你的密码@aws-0-xxx-pooler.supabase.com:6543/postgres?sslmode=require
启动本地服务：
npm run dev
打开浏览器访问：
http://localhost:3000
已实现的安全与限制
密码使用 bcryptjs 加密存储，永不明文保存。
所有需要用户信息的接口都使用 JWT 鉴权。
图片上传限制大小（默认 8MB）以防止滥用。
AI 请求设置超时时间（约 9 秒），避免在免费 Serverless 环境中长时间挂起。
典型使用流程
用户注册新账号 / 使用已有账号登录。
填写或更新个人健康档案（身高、体重、疾病史、过敏史、生活习惯）。
选择：
仅基于文字信息点击「使用 AI 分析并生成建议」，查看流式输出的综合健康饮食建议；
或拍照 / 上传当前要吃的食物照片，点击「识别食物并给建议」，查看识别结果与针对性的饮食建议。
用户可多次调整健康档案或照片，比较不同方案下的建议差异。
