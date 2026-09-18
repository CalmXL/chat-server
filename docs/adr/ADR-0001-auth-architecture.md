# ADR-0001: 认证体系架构与多端会话控制规范

- **状态 (Status)**: 已接受 (Accepted)
- **日期 (Date)**: 2026-09-18
- **决策者 (Deciders)**: 架构团队 / 用户

---

## 1. 上下文 (Context)

即时通讯系统（Chat Server）需要一个兼具**安全性**、**低延迟**与**强控制力**的身份认证与会话管理体系：
1. 客户端不仅需要频繁请求 REST API，还需要建立 WebSocket / TCP 长连接收发消息。
2. 聊天场景对多端在线、同端顶号踢下线、主动登出、异常设备强制注销具有强业务要求。
3. 系统需要支持未来扩展更多认证方式（OAuth、手机验证码等），首期需提供完备的账号密码注册与登录闭环。

---

## 2. 决策记录 (Decisions)

### 2.1 认证模式与凭证
- 首期支持 **用户名/邮箱 + 密码** 认证。
- 密码必须采用抗 GPU/ASIC 碰撞的现代单向哈希算法，严禁明文或不可靠哈希。
- 认证逻辑采用 Strategy 模式解耦，为未来接入 OAuth (GitHub/WeChat) 或短信/邮件 OTP 预留扩展点。

### 2.2 令牌机制与会话管理
- **双 Token 机制**：
  - **Access Token**：短期有效 JWT（建议 15~30 分钟），用于 REST API 请求头 Bearer 鉴权与 WebSocket 握手。
  - **Refresh Token**：长期有效（建议 7~30 天），支持 Token 轮转机制（Refresh Token Rotation）。
- **Redis 状态与黑名单联动**：
  - 使用 Redis 维护活跃会话映射：`auth:session:{userId}:{deviceType}` 记录当前活跃的设备实例。
  - 主动登出或被踢下线时，将未过期的 Access Token `jti` 写入 Redis 黑名单（TTL = Token 剩余寿命），确保即时生效。

### 2.3 ORM 与数据持久化
- 采用 **TypeORM** 作为数据持久化与模型管理层。
- 建立独立的用户表 `User` 与必要的用户凭证表，支持迁移与实体关系映射。

### 2.4 多设备并发与踢人策略 (Multi-Device Strategy)
- 规则定为：**同设备类型互斥，不同设备类型共存**。
- 设备类型划分：`web`、`mobile`、`desktop`、`other`。
- 同一用户最多可同时有 1 个 Web + 1 个 Mobile + 1 个 Desktop 会话。当同一个 `deviceType` 发生新的登录成功时，服务端自动失效旧设备的 Refresh Token，并将旧 Access Token 记录至黑名单。

### 2.5 模块功能边界
- 闭环实现：
  1. `POST /auth/register` (用户注册)
  2. `POST /auth/login` (用户登录)
  3. `POST /auth/refresh` (令牌轮转刷新)
  4. `POST /auth/logout` (主动注销)
  5. `GET /auth/me` (当前用户 Profile 与认证守卫)

---

## 3. 结果与影响 (Consequences)

### 正面影响
- **低延迟鉴权**：正常 API 请求仅需本地验证 JWT 签名，极少数场景查询 Redis 黑名单，性能极高。
- **可控的踢人与注销**：突破了传统无状态 JWT 无法及时作废的限制，完美契合 IM 踢线与顶号业务。
- **高可扩展性**：策略模式方便随时无缝横向增加短信、邮箱、微信登录等模块。

### 负面影响 / 权衡
- 引入了 Redis 外部依赖（需处理 Redis 缓存击穿与网络容灾降级）。
- 需要在网关或 Guards 中加入轻量的 Redis 黑名单校验逻辑。
