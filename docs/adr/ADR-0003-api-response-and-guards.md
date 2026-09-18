# ADR-0003: 统一响应协议、参数校验与鉴权守卫规范

- **状态 (Status)**: 已接受 (Accepted)
- **日期 (Date)**: 2026-09-18
- **决策者 (Deciders)**: 架构团队 / 用户

---

## 1. 上下文 (Context)

为了确保客户端（Web、Mobile App、Desktop）在调用 REST 接口和后续接入 WebSocket 时具备统一、清晰的错误处理、参数校验与身份鉴权体验，需要固化接口协议层与守卫机制的架构标准。

---

## 2. 决策记录 (Decisions)

### 2.1 统一响应包装体 (Response Envelope)
- 所有 HTTP 成功响应统一包装为以下格式：
  ```json
  {
    "code": 0,
    "message": "success",
    "data": { ... },
    "timestamp": 1726650000000
  }
  ```
- 业务/系统异常响应统一格式：
  ```json
  {
    "code": 40001,
    "message": "用户名或密码错误",
    "error": "Unauthorized",
    "timestamp": 1726650000000
  }
  ```
- 通过全局 `TransformInterceptor` 自动封装控制器返回值，通过全局 `AllExceptionsFilter` 统一捕获 `HttpException` 及未捕获错误并映射标准格式。

### 2.2 DTO 严格参数白名单校验
- 启用全局 `ValidationPipe`：
  - `whitelist: true`（自动剔除 DTO 中未声明的冗余/恶意属性）
  - `forbidNonWhitelisted: true`（若传入未知属性则直接抛出 400 校验异常）
  - `transform: true`（基于 TypeScript 类型定义自动转换基础类型）
- 注册与登录入参校验规则：
  - `username`：3~32 位字母、数字、下划线正则。
  - `email`：严格 RFC 邮箱格式。
  - `password`：8~64 位字符，必须包含字母与数字。
  - `deviceType`：枚举约束 (`web` | `mobile` | `desktop` | `other`)。
  - `deviceId`：非空字符串。

### 2.3 强类型环境变量与启动阻断 (Fail-Fast Configuration)
- 使用 `@nestjs/config` 搭配 Zod / Joi 校验 `.env` 变量。
- 必填配置项缺失（如 `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_HOST`, `REDIS_HOST`）时直接在启动阶段退出进程并输出致命错误。

### 2.4 通用鉴权与守卫抽象 (Unified Guarding Architecture)
- 抽象底层核心 `TokenService` 与 `SessionService`。
- **`JwtAuthGuard`**：用于保护标准 REST 控制器路由（提取 HTTP `Authorization: Bearer <token>` 请求头）。
- **`WsAuthGuard`**：用于长连接网关（从 WebSocket `client.handshake.auth.token` 或 headers 中提取 Bearer Token，共用同一套签名及 Redis 黑名单判定）。
- **`@CurrentUser()`** 自定义参数装饰器：用于在 Controller 中直接注入已解析的 `UserPayload` 对象。
- **`@Public()`** 自定义元数据装饰器：配合全局守卫，显式标记免鉴权路由（如 `/auth/login`, `/auth/register`, `/auth/refresh`）。

---

## 3. 结果与影响 (Consequences)

### 正面影响
- 前端与移动端统一网络请求层无需对各业务错误做非标准兼容。
- 守卫与鉴权逻辑彻底解耦，REST 与 WebSocket 实现零差异安全保障。
- 输入参数强类型校验防止注入攻击与非法数据脏写。
