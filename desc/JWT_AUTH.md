# JWT 登录与鉴权梳理

本文档梳理 `chat-server` 的登录认证与鉴权机制，包括 Token 生成、鉴权守卫、会话管理、令牌轮转与安全防护。

---

## 1. 总体设计

- **双 Token 机制**：Access Token（短时效，默认 15m）+ Refresh Token（长时效，默认 7d），使用**两套独立密钥**签名
- **无状态 + 有状态结合**：
  - JWT 本身无状态（签名校验即可解析身份）
  - 会话状态（当前有效 `jti`）与黑名单存放在 **Redis**，用于支持主动登出、顶号踢下线、令牌轮转
- **全局守卫**：`JwtAuthGuard` 注册为 `APP_GUARD`，默认所有接口都需鉴权，公开接口用 `@Public()` 放行
- **令牌轮转（Rotation）**：每次刷新都签发全新 Token 对，旧 Refresh Token 立即失效
- **重放检测**：使用已作废的 Refresh Token 会触发安全防护，清空该设备会话

认证流程概览：

```
注册 ──> 密码 argon2 哈希 ──> 落库
登录 ──> 校验密码 ──> 生成 Token 对 ──> Redis 存会话 ──> 返回
请求 ──> JwtAuthGuard ──> 验签 ──> 查黑名单 ──> 注入 user ──> 进入 Controller
刷新 ──> 验 Refresh Token ──> 校验会话/轮转 ──> 签发新 Token 对
登出 ──> Access Token 加黑名单 ──> 删除会话
```

---

## 2. 文件清单与作用  

| 文件 | 作用 |
| :--- | :--- |
| `src/modules/auth/auth.controller.ts` | 认证接口：注册/登录/刷新/登出/获取个人信息 |
| `src/modules/auth/auth.service.ts` | 认证业务编排（查重、校验、签发、会话、轮转、重放检测） |
| `src/modules/auth/password.service.ts` | 密码哈希与校验（argon2） |
| `src/modules/auth/token.service.ts` | JWT 签发/校验、Token 对生成、过期解析 |
| `src/modules/auth/session.service.ts` | 会话与黑名单操作（对 RedisService 的封装） |
| `src/redis/redis.service.ts` | Redis 客户端封装、会话读写、黑名单读写 |
| `src/common/guards/jwt-auth.guard.ts` | HTTP 全局鉴权守卫 |
| `src/common/guards/ws-auth.guard.ts` | WebSocket 握手鉴权守卫 |
| `src/common/decorators/public.decorator.ts` | `@Public()`，标记公开路由 |
| `src/common/decorators/current-user.decorator.ts` | `@CurrentUser()`，从请求注入 JWT payload |
| `src/common/interfaces/jwt-payload.interface.ts` | Token payload 类型定义 |
| `src/common/constants/redis-keys.ts` | Redis key 命名规则 |
| `src/common/constants/error-codes.ts` | 认证相关业务错误码与文案 |
| `src/config/configuration.ts` | 组装 `jwt.*` 配置 |
| `src/config/env.validation.ts` | JWT 密钥校验（缺失/过短则 Fail-Fast） |
| `src/app.module.ts` | 将 `JwtAuthGuard` 注册为全局守卫 |

---

## 3. 配置

### 3.1 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `JWT_ACCESS_SECRET` | 无（开发/生产必填，≥16 字符） | Access Token 签名密钥 |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access Token 有效期 |
| `JWT_REFRESH_SECRET` | 无（开发/生产必填，≥16 字符） | Refresh Token 签名密钥 |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh Token 有效期 |

生成强随机密钥：

```bash
openssl rand -hex 32
```

### 3.2 Fail-Fast 校验

`src/config/env.validation.ts:44` 在非 `test` 环境下强制要求两个密钥存在且长度 ≥16，否则启动即抛错退出。测试环境（`NODE_ENV=test`）会自动填充确定性的测试密钥。

`src/config/configuration.ts:18` 将环境变量映射为 `jwt.accessSecret` / `jwt.accessExpiresIn` / `jwt.refreshSecret` / `jwt.refreshExpiresIn`。

---

## 4. Token 结构

`src/common/interfaces/jwt-payload.interface.ts`

**Access Token payload**：

```ts
{
  sub: string;        // userId
  username: string;
  deviceType: DeviceType;
  deviceId: string;
  jti: string;        // Token 唯一 ID（randomUUID）
}
```

**Refresh Token payload**（不含 `username`）：

```ts
{
  sub: string;        // userId
  deviceType: DeviceType;
  deviceId: string;
  jti: string;
}
```

- 两套密钥分别签名：Access 用 `accessSecret`，Refresh 用 `refreshSecret`（`token.service.ts:74`）
- 每次生成 Token 对时为两个 Token 各生成一个 `jti`（`randomUUID`），用于会话绑定与黑名单
- `expiresIn` 通过 `parseExpiresInToSeconds` 从字符串（如 `15m`）解析为秒数返回给前端（`token.service.ts:146`）

---

## 5. 登录流程

`AuthService.login`（`src/modules/auth/auth.service.ts:92`）：

1. `UserService.findByIdentifier` 按用户名**或**邮箱查用户；不存在 → `40101 INVALID_CREDENTIALS`
2. 校验 `status`，`disabled` → `40102 USER_DISABLED`
3. `PasswordService.verifyPassword`（argon2）校验密码；失败 → `40101`
4. **同设备类型互斥（顶号）**：读取该用户在该 `deviceType` 下的现有会话，若 `deviceId` 不同，将旧 Access Token 的 `jti` 加入黑名单（`auth.service.ts:131`）
5. `TokenService.generateTokenPair` 签发新 Token 对
6. `SessionService.saveSession` 写入 Redis（TTL 7 天）
7. 返回 `accessToken` / `refreshToken` / `expiresIn` / `user`（不含 `passwordHash`）

> 密码只以 argon2 哈希存库（`password.service.ts`），任何接口都不返回。

---

## 6. 鉴权流程（HTTP）

### 6.1 全局守卫

`JwtAuthGuard` 在 `src/app.module.ts:29` 通过 `APP_GUARD` 注册，**默认拦截所有接口**。

`canActivate`（`src/common/guards/jwt-auth.guard.ts:29`）：

1. 用 `Reflector` 读取 `@Public()` 元数据，是公开路由则直接放行
2. 从 `Authorization` 头取 `Bearer <token>`；缺失/格式错误 → `40104 TOKEN_INVALID`
3. `TokenService.verifyAccessToken` 验签：
   - 过期 → `40103 TOKEN_EXPIRED`
   - 签名/格式非法 → `40104 TOKEN_INVALID`
4. 查 Redis 黑名单 `isTokenBlacklisted(jti)`；命中 → `40105 TOKEN_REVOKED`
5. 将 payload 挂到 `request.user`，token 挂到 `request.rawToken`，放行

### 6.2 公开路由

`@Public()`（`public.decorator.ts`）设置 `isPublic` 元数据。认证接口中的注册、登录、刷新均标记为公开。

### 6.3 获取当前用户

`@CurrentUser()`（`current-user.decorator.ts`）从 `request.user` 取出 payload；可传字段名取单个值，如 `@CurrentUser('sub')`。

---

## 7. 令牌刷新与轮转

`AuthService.refreshToken`（`src/modules/auth/auth.service.ts:175`）：

1. `verifyRefreshToken` 用 Refresh 密钥验签
2. `findById` 确认用户仍存在且未被禁用
3. 读取该用户在该 `deviceType` 下的会话；不存在 → `40104 TOKEN_INVALID`
4. **重放检测**：若请求携带的 Refresh Token 的 `jti` 或 `deviceId` 与当前会话不一致，说明是旧的/已轮转的 Token 被重放 → 立即删除会话并抛 `40106 TOKEN_REUSE_DETECTED`（`auth.service.ts:216`）
5. 校验通过则签发**全新 Token 对**，并用新的 `jti` 覆盖会话（轮转，`auth.service.ts:241`）

---

## 8. 登出与顶号踢下线

`AuthService.logout`（`src/modules/auth/auth.service.ts:255`）：

1. 将当前 Access Token 的 `jti` 写入黑名单，TTL 为 Access Token 剩余有效期（默认 900s，`auth.service.ts:259`）
2. 删除该设备的会话（Redis）

**顶号**：登录时若同一 `deviceType` 存在不同 `deviceId` 的会话，旧 Access Token 的 `jti` 会被加入黑名单（`auth.service.ts:134`），旧设备下次请求即被 `JwtAuthGuard` 拒绝（`40105`）。

---

## 9. WebSocket 鉴权

`WsAuthGuard`（`src/common/guards/ws-auth.guard.ts`）用于 WebSocket 握手：

- 优先从 `handshake.auth.token` 取 Token，其次从 `handshake.headers.authorization` 的 `Bearer` 中取
- 验签 + 黑名单校验，失败返回 `false`（拒绝连接）
- 成功则把 payload 写入 `client.data.user`

与 HTTP 守卫不同：WS 守卫通过返回布尔值拒绝，不抛业务异常。

---

## 10. 错误码对照

定义于 `src/common/constants/error-codes.ts`，由 `AllExceptionsFilter` 统一输出：

| 错误码 | HTTP | 标识 | 触发场景 |
| :--- | :--- | :--- | :--- |
| `40101` | 401 | `INVALID_CREDENTIALS` | 用户名/邮箱或密码错误 |
| `40102` | 401 | `USER_DISABLED` | 账号被禁用 |
| `40103` | 401 | `TOKEN_EXPIRED` | Access Token 过期 |
| `40104` | 401 | `TOKEN_INVALID` | 签名非法/格式无效/会话不存在 |
| `40105` | 401 | `TOKEN_REVOKED` | Token 被登出或顶号拉黑 |
| `40106` | 401 | `TOKEN_REUSE_DETECTED` | Refresh Token 重放 |
| `40001` | 400 | `VALIDATION_FAILED` | 参数校验失败 |
| `40901` | 409 | `USER_ALREADY_EXISTS` | 用户名/邮箱已占用 |

---

## 11. Redis 键设计

`src/common/constants/redis-keys.ts`

| Key | 内容 | TTL |
| :--- | :--- | :--- |
| `auth:session:{userId}:{deviceType}` | 会话 JSON（`SessionData`） | 7 天 |
| `auth:blacklist:{jti}` | 拉黑原因（如 `logout` / `kicked`） | Token 剩余有效期 |

`SessionData`（`redis.service.ts:13`）字段：`deviceId`、`accessTokenJti`、`refreshTokenJti`、`lastLoginAt`、`lastActiveAt`、`ip`、`userAgent`。

- 会话按 `userId + deviceType` 唯一，即**每种设备类型只保留一个活跃会话**
- 黑名单以 `jti` 为粒度，只针对 Access Token

---

## 12. 安全设计要点

- **密码**：argon2 哈希，永不返回明文或哈希
- **双密钥**：Access / Refresh 使用独立密钥，降低泄露影响面
- **短时效 Access + 轮转 Refresh**：减少令牌被盗用的窗口
- **重放检测**：Refresh Token 复用即清空会话，防重放攻击
- **黑名单**：支持主动登出与顶号即时失效
- **Fail-Fast**：密钥缺失/过短直接拒绝启动，避免弱默认值上线
- **注意**：开发环境 `configuration.ts` 中的默认密钥仅供本地使用，生产必须通过环境变量覆盖

---

## 13. 接口速查

| 方法 | 路径 | 公开 | 说明 |
| :--- | :--- | :--- | :--- |
| POST | `/api/v1/auth/register` | 是 | 注册 |
| POST | `/api/v1/auth/login` | 是 | 登录，返回 Token 对 |
| POST | `/api/v1/auth/refresh` | 是 | 刷新并轮转 Token |
| POST | `/api/v1/auth/logout` | 否 | 登出（需 Bearer Token） |
| GET | `/api/v1/auth/me` | 否 | 获取当前用户信息（需 Bearer Token） |

受保护接口统一携带请求头：

```
Authorization: Bearer <accessToken>
```
