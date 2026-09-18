# 需求规格说明书：用户登录与认证会话管理模块 (Authentication & Session Management Spec)

**标签 (Labels)**: `ready-for-agent`

---

## 问题描述 (Problem Statement)

作为现代化即时通讯（Chat Server）系统的用户与开发者，当前系统缺乏一个安全、可伸缩且支持多端设备感知的身份认证与会话管理体系。

在未实现该模块前：
1. **用户无法建立安全身份**：无法注册账号、登录系统，也无法保护个人的聊天记录与隐私数据。
2. **长连接与 API 缺乏鉴权基准**：服务端无法在 REST 接口请求及后续 WebSocket/TCP 握手时验证客户端身份的合法性。
3. **缺乏多端会话管控机制**：无法区分 Web、Mobile、Desktop 等不同终端形态，容易造成会话滥用、无法识别异常登录，更无法实现同端顶号踢下线（Kickout）和多端协同。
4. **面临凭证泄漏与重放攻击风险**：纯无状态 JWT 无法及时主动注销或作废；若缺乏 Refresh Token 轮转与重放防护，Token 一旦失窃将长期威胁用户账户安全。

---

## 解决方案 (Solution)

基于 PostgreSQL（通过 TypeORM）与 Redis（通过 `ioredis`）构建高安全、低延迟、支持多端设备会话感知的用户认证与会话管理系统：

1. **用户身份与密码学级安全**：支持唯一用户名/邮箱与高强度密码注册，全链路采用 OWASP 推荐第一梯队的 **Argon2id** 算法进行内存硬度单向加盐哈希，杜绝明文与弱哈希风险。
2. **双 Token 生命周期与自动轮转**：采用短期 Access Token（15 分钟）与长期 Refresh Token（7 天）。每次刷新令牌触发 **Refresh Token 轮转机制**；若检测到已废弃的旧 Token 被重复使用，立即判定为重放攻击并强制注销该设备全部会话。
3. **多设备并发与顶号踢线管理**：严格执行“**同端互斥、异端共存**”策略（支持 1 个 Web + 1 个 Mobile + 1 个 Desktop + 1 个 Other 同时在线）。同一设备类型发生新登录时，旧设备会话自动失效并触发顶号踢线。
4. **基于 Redis 黑名单的即时作废**：用户主动注销（Logout）或被顶号下线时，将未过期的 Access Token 唯一标识（JTI）写入 Redis 黑名单（TTL 与 Token 剩余有效期对齐），实现毫秒级失效。
5. **统一开发规范与端到端守卫**：提供全局统一响应格式（`{ code, message, data, timestamp }`）、DTO 严格白名单校验、启动环境变量强类型校验，以及可供 HTTP REST 与 WebSocket 握手共用的鉴权守卫。

---

## 用户故事 (User Stories)

1. 作为新用户，我希望能够通过唯一的用户名、有效的邮箱和安全的密码注册账户，以便在聊天系统中建立自己的唯一数字身份。
2. 作为新用户，我希望在注册时若输入的用户名过短、邮箱格式不正确或密码过于简单时收到清晰的校验提示，以便我能即时修正输入。
3. 作为新用户，我希望在注册已被占用的用户名或邮箱时收到明确的冲突错误提示（`USER_ALREADY_EXISTS`），以便我知道该标识已被注册。
4. 作为注册用户，我希望能够使用用户名或邮箱搭配密码进行登录，以便我能以更灵活的方式验证身份。
5. 作为客户端应用（Web/移动端/桌面端），我希望在登录时能够上报当前设备的 `deviceType` 和 `deviceId`，以便服务端能够精准跟踪和管理我的设备会话。
6. 作为客户端应用，我希望在登录成功后能同时获取 Access Token 和 Refresh Token，以便我可以访问受保护接口并在 Token 过期时无缝刷新。
7. 作为客户端应用，我希望在登录成功时获得当前用户的基本资料（用户 ID、用户名、邮箱、昵称、头像），以便界面能够直接展示当前登录人状态。
8. 作为客户端应用，我希望在请求受保护的 REST 接口时在请求头中携带 `Authorization: Bearer <AccessToken>`，以便服务端核验我的身份。
9. 作为客户端应用，我希望在 Access Token 过期后通过 `/auth/refresh` 接口平滑置换出新的 Access Token 和全新 Refresh Token，以便用户在使用聊天功能时不被打断。
10. 作为注重安全的用户，我希望一旦有恶意攻击者尝试重放使用已被轮转作废的旧 Refresh Token 时，系统能立刻阻断并清除该设备的所有会话，以便保护我的账号资产不被非法窃取。
11. 作为在新的浏览器上登录 Web 端的用户，我希望我旧浏览器上的 Web 会话被自动顶替下线，但我的手机和桌面客户端依然保持登录，以便维持符合预期的同端单点安全策略。
12. 作为用户，我希望能在当前设备上主动调用 `/auth/logout` 退出登录，以便我的 Access Token 被立刻加入黑名单、Refresh Token 被彻底销毁。
13. 作为客户端应用，我希望在携带有效 Access Token 时调用 `/auth/me` 接口，以便随时校验当前登录状态并获取最新的个人信息与登录设备元数据。
14. 作为客户端应用，我希望在收到 `401` 响应时能通过细分错误码（如 `TOKEN_EXPIRED` vs `TOKEN_REVOKED`）区分是需要静默刷新还是必须跳转重新登录，以便前端能优雅处理网络状态。
15. 作为 WebSocket 网关开发者，我希望长连接握手鉴权能复用底层的 Token 验证与 Redis 黑名单判定逻辑，以便 REST 接口与实时长连接保持完全一致的安全标准。
16. 作为前端与移动端开发者，我希望所有成功和失败的 API 响应都遵循统一的 JSON 包装规范（`{ code, message, data, timestamp }`），以便统一网络层拦截与错误提示。
17. 作为系统管理员，我希望被禁用或封禁的用户账号（`UserStatus.DISABLED`）能够立刻被拒绝登录和刷新令牌，以便迅速隔绝恶意行为。
18. 作为运维与部署人员，我希望在启动服务时若缺失关键环境变量（如数据库连接、Redis 地址、JWT 密钥）能立即在启动阶段报错终止，以便防止携带错误配置上线。

---

## 实施决策 (Implementation Decisions)

- **领域术语与模型**：
  - 严格遵循 `docs/glossary.md` 与 `docs/domain-model.md` 中的规范（`User`, `Credential`, `DeviceType`, `Session`, `AccessToken`, `RefreshToken`, `Kickout`, `TokenBlacklist`）。
- **持久化与数据存储**：
  - 使用 PostgreSQL 作为核心数据库，通过 TypeORM 进行实体管理。
  - `User` 实体采用 UUID 主键（`id`），在 `username` 和 `email` 建立唯一索引，密码仅存储由 `@node-rs/argon2` 生成的 Argon2id 单向哈希。
- **会话跟踪与令牌轮转**：
  - Redis（通过 `ioredis`）在 `auth:session:{userId}:{deviceType}` 记录当前活跃设备会话（包含 `deviceId`, `refreshTokenJti`, `lastLoginAt`, `ip`），TTL 为 7 天。
  - 被注销或被顶号踢下线的 Access Token JTI 存入 `auth:blacklist:{jti}`，TTL 等于该 Token 剩余有效时长。
  - Refresh Token 采用带 `jti` 的签名 JWT。每次刷新时比对 Redis 中的 `refreshTokenJti`；若不一致触发防重放机制，直接清空该设备会话并返回拒绝。
- **多设备在线策略**：
  - 严格执行：**同设备类型互斥，不同设备类型共存**。
  - 设备类型枚举规范：`web`、`mobile`、`desktop`、`other`。
- **接口协议与守卫**：
  - 全局启用 `TransformInterceptor`，统一包装成功响应为 `{ code: 0, message: "success", data, timestamp }`。
  - 全局启用 `AllExceptionsFilter`，统一捕获异常并映射为标准业务错误格式（详见 `docs/api-spec.md`）。
  - 全局启用 `ValidationPipe`（开启 `whitelist`, `forbidNonWhitelisted`, `transform`）。
  - 全局默认挂载 `JwtAuthGuard`，通过 `@Public()` 装饰器显式放行公开路由（如注册、登录、刷新）。
  - 提供 `@CurrentUser()` 自定义参数装饰器，便捷获取当前登录人 Payload。
- **环境变量与配置校验**：
  - 使用 `@nestjs/config` 搭配 Zod 进行 `.env` 配置强类型校验，缺失关键变量时启动阶段 Fail-Fast。

---

## 测试决策 (Testing Decisions)

### 优质测试的标准
- **基于外部行为断言**：测试仅关注 HTTP 状态码、统一响应体 Schema、数据库持久化结果及 Redis 状态机，坚决不测试私有方法或中间 Mock 连线等实现细节。
- **高内聚与确定性**：每个测试用例具备独立隔离的测试上下文，支持反复运行且零脏数据污染。

### 被测模块与场景
1. **端到端完整认证生命周期测试 (`test/auth.e2e-spec.ts`)**：
   - 基础闭环：注册 -> 登录 -> `/auth/me` 查询 -> 令牌刷新 -> 主动注销 -> 再次访问被拦截。
   - 参数校验失败用例：缺失字段、邮箱格式错误、密码长度不足、非法设备类型。
   - 凭证异常用例：用户不存在、密码错误、账号被禁用。
   - 多设备与同端顶号用例：同设备类型再次登录触发旧设备 Token 失效；异端登录两者共存。
   - Refresh Token 重放攻击防御用例：复用已被轮转作废的旧 Refresh Token 触发全量会话清除。
2. **密码与令牌单元测试**：
   - Argon2id 密码哈希生成与比对校验。
   - JWT 签名、Payload 解析与过期判定。

### 测试先例与基础设施
- 沿用项目中基于 Vitest + `@nestjs/testing` + `supertest` 的测试体系（参考 `test/app.e2e-spec.ts`）。

---

## 范围外事项 (Out of Scope)

- 第三方社交登录（OAuth：GitHub、Google、微信扫码等）——底层架构预留扩展点，首期暂不实现具体 Provider。
- 短信（SMS）或邮件验证码（OTP）发送通道与验证服务。
- 找回密码与邮件重置链接流程。
- 聊天室、好友关系、消息收发与实时通讯业务（归属于后续 Chat 模块）。

---

## 补充说明 (Further Notes)

- 本 Spec 的所有技术决策已由 ADR 规范支撑：`docs/adr/ADR-0001-auth-architecture.md`、`docs/adr/ADR-0002-data-storage-and-security.md`、`docs/adr/ADR-0003-api-response-and-guards.md`、`docs/domain-model.md` 以及 `docs/api-spec.md`。
- 状态：**`ready-for-agent`**（已完备，可直接用于任务拆解与代码实施）。
