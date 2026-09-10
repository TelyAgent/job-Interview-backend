# HireOS Interview Backend

NestJS + PostgreSQL + Prisma。当前实现第一步 Intake：项目草稿、PDF/DOCX/TXT 上传与文字提取、JD/简历结构化解析任务、人工核对、要求提取入口。

## 本地启动

1. 安装依赖：`npm install`。
2. 配置 `.env`，字段见 `.env.example`。本地数据库连接默认 `postgresql://hireos@127.0.0.1:55432/hireos_interview`。
3. 运行 `npm run prisma:generate` 和 `npm run prisma:migrate:deploy`。
4. 运行 `npm run start:dev`；当前本地 `.env` 使用 3001 端口。前端在 `frontend` 中运行 `npm run dev -- --port 5174`，Vite 将 `/api` 代理到 3001。

本次开发已在 `.local/postgres` 初始化独立 PostgreSQL 17 实例。macOS Homebrew 环境可用下列命令管理它，其他环境连接自行部署的 PostgreSQL 即可：

```sh
/opt/homebrew/bin/pg_ctl -D .local/postgres -l .local/postgres.log -o '-p 55432 -h 127.0.0.1 -k /tmp' start
/opt/homebrew/bin/pg_ctl -D .local/postgres stop
```

`.local` 和 `.env` 均被忽略，不应提交。原始文件使用随机存储键存入私有目录，原文和页码/段落来源保存到数据库。

## AI 配置

在后端 `.env` 设置：

```dotenv
HIREOS_AI_BASE_URL=https://api.openai.com/v1
HIREOS_AI_API_KEY=your-secret
HIREOS_AI_MODEL=gpt-5-mini
HIREOS_AI_TIMEOUT_SECONDS=60
HIREOS_AI_SEARCH_TOTAL_TIMEOUT_SECONDS=720
HIREOS_AI_MIN_CONFIDENCE=0.85
```

供应商须支持 `POST {HIREOS_AI_BASE_URL}/chat/completions` 和 `response_format.type=json_schema`。当前适配器采用这一协议，不保证所有标称兼容的供应商都支持严格 Schema；不兼容时需新增供应商适配器。修改环境后重启后端。优先读取 `HIREOS_AI_*`，兼容旧 `AI_BASE_URL/AI_API_KEY/AI_MODEL`。

当前解析使用单次请求超时；搜索总超时和最低置信度保留给后续搜索流程，不参与当前 JD/简历解析。引用仍必须匹配原文，AI 输出仍需人工核对。请求不设置 `temperature`，以兼容 [GPT-5 mini 参数限制](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2)。

未配置时项目照常保存，解析任务显示 `AI_NOT_CONFIGURED`。配置完成后在页面点击重试。不会返回伪造的 AI 解析成功结果。自动化测试使用本地模拟模型，避免读取真实供应商配置后产生外部调用。

每个解析字段包含 `value/segmentId/quote`，其引用必须匹配来源片段。经历、教育、技能、职责和要求以分类 facts 保留，第一版不推断任职时间、总经验年限、权重或能力分数。AI 内容需要人工核对；“使用这些字段”仅填入表单，点击保存后才写入人工版本。

## 接口

| 接口 | 用途 |
|---|---|
| POST /api/materials | multipart `file`，单文件最多 10 MB |
| GET /api/materials/:id | 元数据与原文，不返回存储路径 |
| POST /api/projects | 必须带 Idempotency-Key，保存 JD 和可选材料 |
| GET /api/projects | 当前 Workspace 项目列表，最多 200 条 |
| GET /api/projects/:id | 项目、来源和任务 |
| PATCH /api/projects/:id/intake | version + title/candidateName/candidateEmail/jdText |
| POST /api/projects/:id/materials | 后补材料，materialId + kind |
| POST /api/projects/:id/requirements-extractions | 生成未确认的岗位要求 |
| GET /api/parsing-jobs/:id | 状态与结果 |
| POST /api/parsing-jobs/:id/retry | 重试失败任务 |

创建体示例：

```json
{
  "jd": { "text": "Backend engineer: build reliable APIs.", "effectiveSource": "text" },
  "materials": []
}
```

`effectiveSource=file` 时提供已上传的 `materialId`；同时保留文本和文件时使用 `effectiveSource=text` 明确当前有效来源。材料 kind 为 `resume/screening/assessment/other`。只有简历触发候选人信息解析，其他报告当前只保存原文。

## 状态和边界

- 文件读取在上传请求中完成；10 MB 内的文本类材料为当前支持范围。无文本 PDF 返回 OCR_REQUIRED，不假装识别扫描件。
- AI 异步任务持久化在 PostgreSQL，以租约和 fencing token 领取，过期任务可恢复。单次 60 秒超时，可重试错误最多自动尝试 3 次。
- 文件文字提取尚未迁入隔离 worker；OCR、恶意文件扫描、对象存储和未关联文件自动清理待后续部署阶段补齐。
- 人工核对用乐观锁写入 Revision；修改 JD 增加 jdVersion。旧任务不覆盖新版或人工字段。
- 邮件/文件夹入口尚未连接；正式评分标准、面试计划和后续执行阶段仍属于后续工作。真实项目不会加载原型的示例分数。
- `DEV_AUTH_ENABLED=true` 仅提供本地固定开发身份。后端默认绑定 127.0.0.1，`NODE_ENV=production` 拒绝 Intake 访问，直到接入真实身份/Workspace 授权。前端演示角色切换不授予后端权限。

## 验证

`npm test` 构建后运行 Node 集成测试，在配置数据库中建立独立临时 schema 并清理。使用虚构 TXT/DOCX/PDF 和本机模拟模型，不调用付费模型。覆盖幂等、来源校验、乐观锁、跨 Workspace 拒绝及租约恢复。

前后端启动后，在 `frontend` 运行 `npm run test:e2e`。默认使用 macOS Google Chrome，其他环境通过 `CHROME_PATH` 指定浏览器；截图在 `frontend/test-results`。真实模型测试需另行配置并验收。
