# Implementation Plan: 登录认证模块实施方案

本文档制定聊天服务端（Chat Server）登录认证模块的代码架构组织、依赖安装与分步实施路线。

---

## 1. 依赖库选型与安装清单 (Dependencies)

```bash
# 核心框架与环境配置
bun add @nestjs/config @nestjs/jwt @nestjs/typeorm typeorm pg ioredis
bun add class-validator class-transformer
bun add @node-rs/argon2
bun add zod

# 开发依赖与类型
bun add -d @types/pg
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
│   │   ├── current-user.decorator.ts
│   │   └── public.decorator.ts
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
    │   ├── user.service.ts
    │   └── user.repository.ts
    └── auth/                   # 认证鉴权模块
        ├── dto/
        │   ├── register.dto.ts
        │   ├── login.dto.ts
        │   └── refresh-token.dto.ts
        ├── auth.controller.ts
        ├── auth.module.ts
        ├── auth.service.ts
        ├── password.service.ts # Argon2id 密码哈希服务
        ├── session.service.ts  # Redis 设备会话与黑名单管理
        └── token.service.ts    # JWT 双 Token 签发与验签
```

---

## 3. 分阶段实施任务 (Milestones & Tasks)

### 阶段 1：基础设施与配置层搭建 (Foundation & Config)
- [ ] 1.1 安装 `@nestjs/config`, `zod`, `typeorm`, `pg`, `ioredis`, `@nestjs/jwt`, `@node-rs/argon2` 等依赖。
- [ ] 1.2 编写 `src/config/env.validation.ts` 与 `configuration.ts`，定义强类型环境变量校验。
- [ ] 1.3 封装 `RedisModule` 与 `RedisService`，提供 Redis 键读写、TTL 设置与黑名单操作方法。
- [ ] 1.4 配置 `DatabaseModule`，集成 TypeORM + PostgreSQL 连接与实体自动加载。

### 阶段 2：全局拦截器、过滤器与领域实体 (Commons & Entities)
- [ ] 2.1 编写 `src/common/interceptors/transform.interceptor.ts` 实现 `{ code: 0, message, data, timestamp }` 统一响应。
- [ ] 2.2 编写 `src/common/filters/all-exceptions.filter.ts` 实现全局异常捕获并格式化业务错误码。
- [ ] 2.3 创建 `src/modules/user/entities/user.entity.ts`（包含 UUID 主键、username、email、passwordHash、状态字段）。
- [ ] 2.4 实现 `UserService`，提供按 username/email 查找、创建用户等方法。

### 阶段 3：密码安全与会话/Token 核心服务 (Core Auth Engine)
- [ ] 3.1 实现 `PasswordService`（基于 `@node-rs/argon2` 的 `hash` 与 `verify`）。
- [ ] 3.2 实现 `SessionService`（封装 Redis 活跃设备会话存储、同端互斥检测、踢下线逻辑、Access Token JTI 黑名单）。
- [ ] 3.3 实现 `TokenService`（双 Token 签发、验签、Refresh Token 轮转与重放检测）。

### 阶段 4：控制器、DTO 校验与守卫 (Auth API & Guards)
- [ ] 4.1 编写 `RegisterDto`, `LoginDto`, `RefreshTokenDto`，配置 `class-validator` 规则。
- [ ] 4.2 实现 `AuthController` 接口：
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- [ ] 4.3 编写 `JwtAuthGuard`（全局注册，配合 `@Public()` 判定与 Redis 黑名单校验）与 `@CurrentUser()` 装饰器。
- [ ] 4.4 编写 `WsAuthGuard` 长连接握手守卫契约。

### 阶段 5：单元测试与 E2E 验证 (Verification & Tests)
- [ ] 5.1 编写 `PasswordService` 密码加密与校验单元测试。
- [ ] 5.2 编写 `SessionService` 同端顶号与 Token 轮转单元测试。
- [ ] 5.3 编写完整 E2E 测试用例（注册 -> 登录 -> 获取 profile -> 刷新 Token -> 顶号踢线 -> 注销）。
