# 吃了吗 · 项目常见问题与答案

本文档整理了针对本项目的常见提问及参考答案，便于答辩、汇报或技术交流使用。

---

## 一、项目概述类

### Q1：这个项目是做什么的？解决了什么问题？

**答：**「吃了吗」是一个面向个人的健康饮食与生活方式辅助网站。用户注册登录后，可以填写身高、体重、疾病史、过敏史和生活习惯等健康档案，然后通过两种方式获得 AI 建议：（1）仅根据文字健康信息生成饮食与生活建议；（2）上传/拍摄食物照片，由 AI 识别食物并结合健康档案给出针对性建议。解决的问题是：普通人缺少专业营养师时，仍能获得个性化、可执行的饮食与生活习惯指导，并支持「拍一下当前吃的」这种贴近日常的使用场景。

---

### Q2：目标用户是谁？使用场景是什么？

**答：** 目标用户是关注饮食健康、但没有固定营养顾问的普通用户。典型场景包括：想控制体重或改善体质的人、有慢性病或过敏需要忌口的人、经常外卖/外食想了解营养结构的人。用户可以在家、办公室或餐厅，随时录入健康信息或拍下当前食物，快速得到建议，无需安装复杂 App，通过浏览器即可使用。

---

## 二、技术架构类

### Q3：前后端是如何分离的？为什么这样设计？

**答：** 前端是纯 HTML/CSS/JS 单页应用，放在 `public/` 目录，通过 Fetch 调用后端 REST API；后端是 Node.js + Express，提供注册、登录、健康档案读写和 AI 分析等接口。本地开发时 `server.js` 同时托管静态资源和 API；部署到 Vercel 时，静态资源由 Vercel 直接提供，API 通过 `api/[[...path]].js` 以 Serverless 函数形式运行。这样设计既能在本地一键跑全栈，又能在 Vercel 上低成本部署，且前后端职责清晰，便于维护和扩展。

---

### Q4：为什么选择 Vercel + Supabase，而不是自建服务器 + MySQL？

**答：** 主要考虑是：零运维、免费额度够用、快速上线。Vercel 提供免费 HTTPS 域名和自动部署，Supabase 提供免费 Postgres 和连接池，无需自己买服务器、配 Nginx、管数据库。项目体量适合 Serverless + 云数据库；若以后用户量或数据量很大，再迁移到自建或更重的云服务也来得及，当前架构不绑定具体厂商。

---

### Q5：数据库表结构是怎样的？为什么这样设计？

**答：** 有三张表：`users`（id, email 唯一, password_hash, name）、`health_profiles`（id, user_id, height_cm, weight_kg, diseases, allergies, lifestyle, updated_at）和 `advice_history`（id, user_id, type, content, created_at）。用户与健康档案是一对多，每次「保存健康档案」插入新记录，查询时按 `user_id` 取 `updated_at` 最新的一条；每次生成文字建议或拍照识别建议后，会将完整内容写入 `advice_history`，便于用户查看建议历史并点击某条重新查看。密码只存 bcrypt 哈希，不存明文；email 唯一保证一个邮箱只能注册一个账号。

---

## 三、安全与鉴权类

### Q6：登录状态是如何保持的？会不会被伪造？

**答：** 登录成功后后端签发 JWT（包含用户 id、email，有效期 7 天），前端将 token 存到 localStorage，之后每次请求在 Header 里带 `Authorization: Bearer <token>`。后端在需要鉴权的接口（如 `/api/me`、`/api/health`、`/api/analyze`）里用 `JWT_SECRET` 校验签名，非法或过期的 token 会返回 401。不把敏感信息放在前端可改的地方，密钥只在服务端，因此无法在不知道密钥的情况下伪造有效 token。

---

### Q7：密码是怎么存储的？为什么不用 MD5？

**答：** 使用 bcrypt 对密码做单向哈希后存入 `password_hash` 字段，不存明文也不存可逆加密。bcrypt 自带盐值和成本因子，能有效抵御彩虹表和暴力破解；MD5 无盐、速度快，已被认为不适合用于密码存储，因此本项目采用 bcrypt（通过 `bcryptjs` 纯 JS 实现，避免原生模块在 Windows 上的编译问题）。

---

### Q8：API Key 和数据库连接串放在哪里？会不会泄露？

**答：** 敏感配置（如 `AI_API_KEY`、`DATABASE_URL`、`JWT_SECRET`）只放在环境变量中：本地用 `.env`（且已加入 `.gitignore`，不提交到 Git），线上在 Vercel 的 Environment Variables 里配置。代码里通过 `process.env.xxx` 读取，不写死在源码中，因此不会随代码仓库泄露。若曾经误把 `.env` 提交过，应轮换相关密钥并在仓库中删除该文件历史。

---

## 四、AI 与业务逻辑类

### Q9：AI 建议是怎么实现的？调用的是哪家模型？

**答：** 后端根据用户填写的健康档案（或结合识别到的食物）拼成一段 prompt，通过 HTTP 调用阿里云 DashScope 的 OpenAI 兼容接口（`/compatible-mode/v1/chat/completions`），使用 qwen-vl-plus 模型。文字建议走 `/api/analyze`，返回一段完整文本；拍照识别走 `/api/food-analyze`，请求里带 base64 图片，模型返回 JSON（如 foods、nutrition_notes、advice、cautions），后端再解析并格式化成易读的中文流式输出给前端。

---

### Q10：为什么页面上是「一段一段」出字，而不是等全部生成完再显示？

**答：** 为了更好的体验，采用「流式输出」：后端在拿到 AI 的完整回复后，按段落或换行拆成小块，每隔约 120ms 向响应体写一块，前端用 `fetch` 的 `response.body.getReader()` 读流，每读到一块就追加到页面，并自动滚动到底部。这样用户能尽快看到首屏内容，减少等待焦虑；在 Vercel 免费版 10 秒函数限制下，若 AI 响应较慢，我们还设置了约 9 秒超时并返回明确提示，避免页面一直卡住。

---

### Q11：拍照识别食物时，模型返回 JSON 不规范怎么办？

**答：** 部分模型有时会返回带多余逗号或重复字段的「类 JSON」文本，直接 `JSON.parse` 会抛错。后端做了容错：（1）先尝试 `JSON.parse`；（2）若失败，用正则从文本里提取 `"foods": [...]` 中的食物列表；（3）无论是否解析成功，都会把 `nutrition_notes`、`advice`、`cautions` 按「字符串或数组」统一处理成前端展示用的多行文本，避免把整坨原始 JSON 直接展示给用户，也避免重复的 `"cautions"` 刷屏。

---

## 五、部署与运维类

### Q12：Vercel 上访问 API 时出现 ENOTFOUND 或连不上数据库，可能是什么原因？

**答：** 常见有两种：（1）用了 Supabase 的「Direct connection」且提示 Not IPv4 compatible，而 Vercel 的 Node 环境多为 IPv4，会导致解析或连接失败；解决方式是改用 Supabase 的 **Session pooler / Transaction pooler** 的 URI（端口 6543、host 带 pooler），并填到 `DATABASE_URL`。（2）Supabase 免费项目长时间不用会被 Pause，需在控制台里 Restore 后再部署或重试。

---

### Q13：为什么有时候点击「生成建议」会卡住或超时？

**答：** Vercel 免费版 Serverless 函数有约 10 秒的执行上限，若 DashScope 响应超过该时间，函数会被平台终止，前端就会表现为卡住或收不到完整响应。我们在代码里对 AI 请求做了约 9 秒的 AbortController 超时，超时后会返回「AI 响应超时，请稍后重试」等提示，避免无限等待。若希望更长的生成时间，可考虑升级 Vercel 计划或选用响应更快的模型/接口。

---

### Q14：本地可以跑，但部署后 500 或「Invalid export in app.js」怎么办？

**答：** 若在 Vercel 的 Framework Preset 里选了 Express，Vercel 会尝试把根目录的 `app.js` 当作入口并期待默认导出，而本项目的 `app.js` 只是被 `api/[[...path]].js` 引用的模块，没有 default export，就会报错。解决方式：在 Vercel 项目 Settings 里把 **Framework Preset** 改为 **Other**，并确保所有 `/api/*` 请求由 `api/[[...path]].js` 处理，这样就不会再去解析根目录 `app.js` 的导出。

---

## 六、扩展与改进类

### Q15：如果以后要支持多设备登录或「记住我」怎么办？

**答：** 当前 JWT 是无状态的，只要在有效期内且密钥未改，同一 token 可在多设备使用；若要做「记住我」延长有效期，可签发更长时间的 token 或使用 refresh token 机制。若要做设备管理（如列出设备、远程登出），需要在库中增加表（如 `user_sessions`）记录 token 或 device_id，并在登出或改密时使对应 token 失效（黑名单或删记录），校验时除验证 JWT 签名外再查一次库。

---

### Q16：建议历史是怎么实现的？会不会占很多存储？

**答：** 每次调用「文字建议」或「拍照识别并给建议」成功后，后端在返回流式内容前先把完整文本插入 `advice_history` 表（user_id, type 为 `text` 或 `food`, content 为全文）。前端通过 `GET /api/advice-history?limit=20` 拉取当前用户的历史列表（含 id、type、content_preview、content、created_at），在右侧「建议历史」区域展示；点击某条即可把该条 content 回填到上方建议框重新查看。存储按条数增长，单条为纯文本，若以后需要可加「只保留最近 N 条」的定时任务或用户主动删除。

---

### Q17：想对 AI 建议做「点赞/踩」或反馈，如何扩展？

**答：** 可在数据库增加表，例如 `advice_feedback`（user_id, advice_id 关联 advice_history.id, feedback 如 up/down, created_at），在前端历史条目前增加点赞/踩按钮，点击后调用 `POST /api/feedback` 写入。这样既能统计反馈比例，又可为后续改进 prompt 或模型选择提供数据，而不需要改动现有 AI 调用主流程。

---

### Q18：为什么图片预览要做缩放和拖拽？技术上有哪些注意点？

**答：** 用户上传的食物照片可能是高分辨率或构图不理想，缩放和拖拽便于查看细节或确认识别区域。前端用 CSS `transform: scale() translate()` 配合 `transform-origin` 实现，通过监听 `wheel`（滚轮）和 `pointerdown/pointermove/pointerup`（鼠标或触摸）更新 scale 与位移，并限制在合理范围（如 1～6 倍）；同时用 `user-select: none` 和 `touch-action: none` 避免拖拽时触发选中或浏览器默认手势，保证交互稳定。

---

## 七、总结类

### Q19：这个项目的亮点和不足分别是什么？

**答：** 亮点：（1）从注册、健康档案到文字+图像两种 AI 建议形成完整闭环；（2）采用流式输出和图片缩放等细节提升体验；（3）建议历史：每次生成的建议自动入库，可随时查看历史并点击某条重新加载；（4）技术选型兼顾开发效率与免费部署（Vercel + Supabase + DashScope）；（5）密码与鉴权、环境变量等有基本安全考虑。不足：（1）免费版 Vercel 函数 10 秒限制，AI 慢时易超时；（2）历史暂无分页或删除单条；（3）若误提交过 `.env`，需要轮换密钥并清理历史。后续可针对这些点做迭代。

---

### Q20：你在这个项目里负责哪些部分？遇到的最大难点是什么？

**答：**（可根据实际分工调整）我负责整体架构设计、后端 API 与数据库设计、Vercel/Supabase 的接入，以及前端与后端的联调。遇到的主要难点包括：（1）Vercel 上 Express 不能直接作为根入口，需要改成 Serverless 入口 + 共用 Express 路由；（2）Supabase 直连在 Vercel 环境下 IPv4 兼容问题，需改用 pooler URI；（3）模型有时返回非标准 JSON，需要兼容解析与格式化输出。通过查文档、看报错日志和逐步缩小范围排查解决了这些问题。

---

*文档中的答案基于当前项目实现编写，若代码或配置有变更，请同步更新本 FAQ。*
