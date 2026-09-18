# ADR-0002: 数据持久化、加密算法与安全轮转技术选型

- **状态 (Status)**: 已接受 (Accepted)
- **日期 (Date)**: 2026-09-18
- **决策者 (Deciders)**: 架构团队 / 用户

---

## 1. 上下文 (Context)

在确定了认证与多端会话体系的顶层设计（参见 ADR-0001）后，需要明确具体的存储引擎、密码学安全算法、令牌轮转策略以及底层客户端依赖。

---

## 2. 决策记录 (Decisions)

### 2.1 数据库引擎与 ORM 驱动
- 选择 **PostgreSQL** 作为核心关系型数据库。
- TypeORM 使用 `pg` 驱动连接 PostgreSQL。
- 实体主键采用 **UUID**（生成策略使用 PostgreSQL `uuid-ossp` / `gen_random_uuid()` 或应用层 UUID v4/v7）。

### 2.2 密码哈希方案
- 选用 **Argon2id** 算法进行单向密码加盐哈希（优先通过 `@node-rs/argon2` 或 `argon2` 实现）。
- 严禁任何明文密码或仅 MD5/SHA-256 处理的凭证落库。
- 采用推荐内存开销（19 MiB+）与迭代轮次，抵御离线彩虹表和 GPU 并行暴力破解。

### 2.3 令牌生命周期与轮转机制 (Token Lifespan & Rotation)
- **Access Token**：
  - 有效期：**15 分钟**
  - 内容：携带 `sub` (userId), `username`, `deviceType`, `deviceId`, `jti`
- **Refresh Token**：
  - 有效期：**7 天**
  - 内容：包含专属 `jti` 与关联的 `familyId` / `deviceId`
  - **轮转策略 (Rotation)**：每次客户端调用 `/auth/refresh`，服务端立即废弃旧 Refresh Token 并生成全新双 Token。
  - **重放攻击检测 (Reuse Detection)**：在 Redis 中记录当前合法 Refresh Token 的摘要。若检测到已过期的旧 Refresh Token 被用于刷新，立即判定为 Token 被盗窃重放，直接清除该设备的所有活跃会话并强制下线。

### 2.4 Redis 客户端与会话存储结构
- 选用 **`ioredis`** 作为 Redis 通信客户端。
- Redis 键名命名空间规范：
  - `auth:session:{userId}:{deviceType}` -> 记录设备活跃会话详情 `{ deviceId, refreshTokenJti, lastLoginAt, ip, userAgent }`（TTL = 7 天）。
  - `auth:blacklist:{jti}` -> 记录被注销/被踢下线的 Access Token JTI，TTL 为 Access Token 剩余时间。

---

## 3. 结果与影响 (Consequences)

### 正面影响
- **最高安全基线**：Argon2id + UUID + 轮转与重放检测，彻底防范凭证伪造、暴力碰撞与 Token 截获重放。
- **高并发与扩展性**：PostgreSQL 配合 Redis 缓存，具备应对百万级长连接与会话状态调度的底层支撑力。

### 负面影响 / 运维要求
- 本地开发与生产部署需要运行 PostgreSQL 14+ 与 Redis 6.2+。
