# Implementation Plan: 登录认证与 AI 问答流式服务实施方案

本文档制定聊天服务端（Chat Server）登录认证模块与 AI 问答流式模块的代码架构组织、依赖安装与分步实施路线。

---

## 1. 依赖库选型与安装清单 (Dependencies)

```bash
# 核心框架与环境配置
bun add @nestjs/config @nestjs/jwt @nestjs/typeorm typeorm pg ioredis
bun add class-validator class-transformer
bun add @node-rs/argon2
bun add zod
bun add pdf-parse

# 开发依赖与类型
bun add -d @types/pg @types/pdf-parse @types/multer @types/supertest pg-mem ioredis-mock vitest
```

---

## 2. 项目目录组织规范 (Directory Structure)

```
src/
├── app.module.ts
├── main.ts
├── common/                     # 全局通用基础设施
│   ├── constants/
│   │   ├── error-codes.ts      # 业务错误码定义
│   │   └── redis-keys.ts       # Redis Key 前缀规范
│   ├── decorators/
│   │   ├── bypass-transform.decorator.ts
│   │   ├── current-user.decorator.ts
│   │   └── public.decorator.ts
│   ├── enums/
│   │   └── index.ts            # 全局领域枚举 (MessageRole, MessageStatus, AttachmentKind 等)
│   ├── filters/
│   │   └── all-exceptions.filter.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── ws-auth.guard.ts
│   ├── interceptors/
│   │   └── transform.interceptor.ts
│   └── interfaces/
│       ├── api-response.interface.ts
│       └── jwt-payload.interface.ts
├── config/                     # 环境变量与配置校验
│   ├── configuration.ts
│   └── env.validation.ts
├── database/                   # 数据库与 TypeORM 配置
│   └── database.module.ts
├── redis/                      # Redis 模块封装
│   ├── redis.module.ts
│   └── redis.service.ts
└── modules/
    ├── user/                   # 用户领域模块
    │   ├── entities/
    │   │   └── user.entity.ts
    │   ├── user.module.ts
    │   └── user.service.ts
    ├── auth/                   # 认证鉴权模块
    │   ├── dto/
    │   │   ├── register.dto.ts
    │   │   ├── login.dto.ts
    │   │   └── refresh-token.dto.ts
    │   ├── auth.controller.ts
    │   ├── auth.module.ts
    │   ├── auth.service.ts
    │   ├── password.service.ts # Argon2id 密码哈希服务
    │   ├── session.service.ts  # Redis 设备会话与黑名单管理
    │   └── token.service.ts    # JWT 双 Token 签发与验签
    ├── upload/                 # 附件上传与文本提取模块
    │   ├── entities/
    │   │   └── attachment.entity.ts
    │   ├── upload.controller.ts
    │   ├── upload.module.ts
    │   └── upload.service.ts
    ├── conversation/           # 会话管理与上下文组装
    │   ├── dto/
    │   │   ├── create-conversation.dto.ts
    │   │   ├── update-conversation.dto.ts
    │   │   └── conversation-query.dto.ts
    │   ├── entities/
    │   │   ├── conversation.entity.ts
    │   │   └── message.entity.ts
    │   ├── conversation.controller.ts
    │   ├── conversation.module.ts
    │   └── conversation.service.ts
    └── ai/                     # AI 问答流式与模型目录模块
        ├── dto/
        │   ├── chat-request.dto.ts
        │   └── model-catalog-item.dto.ts
        ├── interfaces/
        │   └── provider.interface.ts
        ├── pipeline/
        │   └── stream-pipeline.ts
        ├── providers/
        │   └── openai-compatible.provider.ts
        ├── ai.controller.ts
        ├── ai.module.ts
        └── ai.service.ts
```

---

## 3. 分阶段实施任务 (Milestones & Tasks)

### 阶段 1：基础设施与配置层搭建 (Foundation & Config)
- [x] 1.1 安装 `@nestjs/config`, `zod`, `typeorm`, `pg`, `ioredis`, `@nestjs/jwt`, `@node-rs/argon2`, `pdf-parse` 等依赖。
- [x] 1.2 编写 `src/config/env.validation.ts` 与 `configuration.ts`，定义强类型环境变量校验（含 JWT 与 AI Provider 配置）。
- [x] 1.3 封装 `RedisModule` 与 `RedisService`，提供 Redis 键读写、TTL 设置、黑名单操作、限流及并发流槽位操作。
- [x] 1.4 配置 `DatabaseModule`，集成 TypeORM + PostgreSQL 连接与实体自动加载。

### 阶段 2：全局拦截器、过滤器与领域实体 (Commons & Entities)
- [x] 2.1 编写 `src/common/interceptors/transform.interceptor.ts` 实现 `{ code: 0, message, data, timestamp }` 统一响应及 `@BypassTransform()` 旁路。
- [x] 2.2 编写 `src/common/filters/all-exceptions.filter.ts` 实现全局异常捕获并格式化业务错误码。
- [x] 2.3 创建 `User`, `Conversation`, `Message`, `Attachment` 等 TypeORM 实体。
- [x] 2.4 实现 `UserService`，提供按 username/email 查找、创建用户等方法。

### 阶段 3：密码安全与会话/Token 核心服务 (Core Auth Engine)
- [x] 3.1 实现 `PasswordService`（基于 `@node-rs/argon2` 的 `hash` 与 `verify`）。
- [x] 3.2 实现 `SessionService`（封装 Redis 活跃设备会话存储、同端互斥检测、踢下线逻辑、Access Token JTI 黑名单）。
- [x] 3.3 实现 `TokenService`（双 Token 签发、验签、Refresh Token 轮转与重放检测）。

### 阶段 4：控制器、DTO 校验与守卫 (Auth API & Guards)
- [x] 4.1 编写 `RegisterDto`, `LoginDto`, `RefreshTokenDto`，配置 `class-validator` 规则。
- [x] 4.2 实现 `AuthController` 接口：
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- [x] 4.3 编写 `JwtAuthGuard`（全局注册，配合 `@Public()` 判定与 Redis 黑名单校验）与 `@CurrentUser()` 装饰器。
- [x] 4.4 编写 `WsAuthGuard` 长连接握手守卫契约。

### 阶段 5：会话管理与附件系统 (Conversation & Upload Modules)
- [x] 5.1 实现 `UploadService` 与 `UploadController`（多文件上传、MIME 白名单、大小限制、文档纯文本同步提取与裸流下载）。
- [x] 5.2 实现 `ConversationService` 与 `ConversationController`（会话 CRUD、按 `lastMessageAt` 降序分页、消息历史、重命名与级联删除）。
- [x] 5.3 实现上下文组装算法（滑动窗口、历史图片占位化、历史文档截断、当前轮 Vision base64 与完整文档注入）。

### 阶段 6：AI 流式问答与成本护栏 (AI Chat Streaming & Guardrails)
- [x] 6.1 实现 `OpenAiCompatibleProvider`（原生 fetch、零 SDK、规范化 streamChat 异步生成器）。
- [x] 6.2 实现 `StreamPipeline`（内置 `accumulate`、`usageExtract`、`sseEncode` 及自定义 stage 支持）。
- [x] 6.3 实现 `AiService` 与 `AiController`（模型目录拉取、隐式会话创建、SSE 事件流推送、15s 心跳、断连 AbortController 协同与消息状态机流转）。
- [x] 6.4 实现成本护栏（RPM 限流、并发流计数与回退，双轨制错误响应）。

### 阶段 7：单元测试与 E2E 验证 (Verification & Tests)
- [x] 7.1 编写 `PasswordService`、`SessionService`、`TokenService`、`TransformInterceptor` 单元测试。
- [x] 7.2 编写 `UploadService`、`ConversationService`、`AiService`、`StreamPipeline` 单元测试。
- [x] 7.3 编写完整 E2E 测试用例（认证模块 E2E + AI 问答流式与附件 E2E 全部通过）。
