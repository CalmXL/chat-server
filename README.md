# Chat Server

基于 NestJS 的聊天服务端，提供用户认证（注册、登录、令牌刷新与轮转、登出）等 REST API，后续将承载实时聊天能力。

## 技术栈

- **框架**：NestJS 12 + TypeScript（ESM）
- **运行时 / 包管理**：Bun
- **数据库**：PostgreSQL（TypeORM）
- **缓存 / 会话**：Redis（ioredis）
- **认证**：JWT 双令牌（access + refresh），密码哈希使用 argon2
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

`.env` 已被 gitignore，不会提交。可用变量：

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

基础路径 `/api/v1/auth`：

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| POST | `/register` | 公开 | 用户注册 |
| POST | `/login` | 公开 | 登录（支持用户名或邮箱），返回双令牌 |
| POST | `/refresh` | 公开 | 刷新并轮转令牌 |
| POST | `/logout` | Bearer | 登出（使当前令牌失效） |
| GET | `/me` | Bearer | 获取当前登录用户信息 |

受保护接口需在请求头携带 `Authorization: Bearer <accessToken>`。

## 测试与质量

```bash
# 单元测试
bun run test

# e2e 测试（内置 pg-mem / ioredis-mock，无需真实数据库）
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
├── database/       # TypeORM 数据源
├── redis/          # Redis 连接与会话存储
├── modules/
│   ├── auth/       # 认证：注册/登录/刷新/登出、JWT、会话
│   └── user/       # 用户实体与服务
└── common/         # 拦截器、过滤器、守卫、装饰器等通用件

docs/               # API 规范、领域模型、实现计划、ADR
desc/               # 设计说明（NestJS 生命周期、数据库、JWT 认证）
test/               # e2e 测试
```
