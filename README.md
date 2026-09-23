# Chat Server

基于 NestJS 的聊天服务端，提供用户认证（注册、登录、令牌刷新与轮转、登出）以及 AI 问答流式服务（多轮对话、模型切换、文件/图片附件上传与多模态解析、自定义流式处理管道与成本护栏）。

## 技术栈

- **框架**：NestJS 12 + TypeScript（ESM）
- **运行时 / 包管理**：Bun
- **数据库**：PostgreSQL（TypeORM）
- **缓存 / 会话 / 护栏**：Redis（ioredis）
- **认证**：JWT 双令牌（access + refresh），密码哈希使用 argon2
- **AI 传输**：Server-Sent Events (SSE) 流式传输 + 原生 fetch 对接 OpenAI 兼容接口
- **文档解析**：pdf-parse 同步文本提取
- **文档**：Swagger（`/api-docs`）
- **测试**：Vitest（单测 + e2e，测试环境用 pg-mem / ioredis-mock）
- **质量**：oxlint + Prettier

## 快速开始

### 前置依赖

- Bun
- PostgreSQL（默认 `localhost:5432`，数据库 `chat_server`）
- Redis（默认 `localhost:6379`）

### 配置环境变量

复制模板并按需修改：

```bash
cp .env.example .env
```

`.env` 已被 gitignore，不会提交。核心配置变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | HTTP 监听端口 |
| `DATABASE_HOST` / `DATABASE_PORT` | `localhost` / `5432` | PostgreSQL 地址 |
| `DATABASE_USERNAME` / `DATABASE_PASSWORD` | `postgres` / `postgres` | 数据库凭据 |
| `DATABASE_NAME` | `chat_server` | 数据库名 |
| `DATABASE_SYNCHRONIZE` | `true` | TypeORM 自动建表；生产环境必须设为 `false` |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis 地址 |
| `REDIS_PASSWORD` | 空 | Redis 密码 |
| `REDIS_DB` | `0` | Redis 逻辑库 |
| `JWT_ACCESS_SECRET` | 内置开发默认值 | access token 密钥，**生产必须更换** |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | access token 有效期 |
| `JWT_REFRESH_SECRET` | 内置开发默认值 | refresh token 密钥，**生产必须更换** |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | refresh token 有效期 |
| `AI_PROVIDERS_FILE` | `./config/ai-providers.json` | 供应商目录文件（含 id, baseURL, apiKeyEnv, models），受版本管理 |
| `AI_PROVIDERS_JSON` | - | 内联覆盖的供应商列表 JSON（优先级高于文件，供测试/CI 用） |
| `<provider>_API_KEY` | - | 目录中 `apiKeyEnv` 引用的密钥变量（如 `DEEPSEEK_API_KEY`） |
| `AI_MAX_CONCURRENT_STREAMS`| `3` | 单用户并发流上限 |
| `AI_RATE_LIMIT_RPM` | `20` | 单用户每分钟提问上限 |
| `AI_MAX_UPLOAD_MB` | `10` | 附件上传单文件最大限制 (MB) |
| `AI_HISTORY_WINDOW` | `20` | 问答上下文历史消息条数 |
| `AI_DOC_TRUNCATE_CHARS` | `2000` | 历史文档截断字符数 |
| `UPLOAD_DIR` | `./uploads` | 附件本地磁盘存储目录 |

### 安装与运行

```bash
bun install

# 开发（watch）
bun run start:dev

# 生产
bun run build && bun run start:prod
```

启动后：

- API 根路径：`http://localhost:3000`
- Swagger 文档：`http://localhost:3000/api-docs`（JSON：`/api-docs-json`）

## API 概览

所有受保护接口需在请求头携带 `Authorization: Bearer <accessToken>`。

### 1. 用户认证模块 (`/api/v1/auth`)

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | 公开 | 用户注册 |
| POST | `/api/v1/auth/login` | 公开 | 登录（支持用户名或邮箱），返回双令牌 |
| POST | `/api/v1/auth/refresh` | 公开 | 刷新并轮转令牌 |
| POST | `/api/v1/auth/logout` | Bearer | 登出（使当前令牌失效） |
| GET | `/api/v1/auth/me` | Bearer | 获取当前登录用户信息 |

### 2. 会话管理模块 (`/conversations`)

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/conversations` | Bearer | 创建会话（标题可空） |
| GET | `/conversations` | Bearer | 分页获取会话列表（按 `lastMessageAt` 降序） |
| GET | `/conversations/:id/messages` | Bearer | 获取指定会话的消息历史（含附件元数据） |
| PATCH | `/conversations/:id` | Bearer | 重命名会话 |
| DELETE| `/conversations/:id` | Bearer | 删除会话（级联删除消息与附件） |

### 3. 附件管理模块 (`/uploads`)

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/uploads` | Bearer | multipart 多文件上传（支持图片与文档，同步提取文本） |
| GET | `/uploads/:id` | Bearer | 获取附件元数据（仅属主） |
| GET | `/uploads/:id/download` | Bearer | 附件裸流下载（仅属主，不包信封） |

### 4. AI 问答流式模块 (`/ai`)

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| GET | `/ai/models` | Bearer | 获取可切换的模型目录（响应不含 API Key） |
| POST | `/ai/chat` | Bearer | 发起 SSE 流式问答（支持隐式建会话、附件多模态问答） |

## 测试与质量

```bash
# 单元测试 (vitest)
bun run test

# e2e 测试 (vitest)
bun run test:e2e

# 覆盖率
bun run test:cov

# 代码检查 / 格式化
bun run lint
bun run format
```

## 目录结构

```
src/
├── config/         # 配置与环境变量校验（zod）
├── database/       # TypeORM 数据源与配置
├── redis/          # Redis 连接、会话存储与成本护栏
├── modules/
│   ├── auth/       # 认证：注册/登录/刷新/登出、JWT、会话
│   ├── user/       # 用户实体与服务
│   ├── ai/         # AI 问答流式、模型目录、Provider、StreamPipeline
│   ├── conversation/# 会话与消息 CRUD、上下文组装
│   └── upload/     # 附件上传、文本提取、下载与元数据
└── common/         # 拦截器、过滤器、守卫、装饰器等通用基础设施

docs/               # API 规范、领域模型、实现计划、ADR
desc/               # 设计说明
test/               # e2e 测试
```
