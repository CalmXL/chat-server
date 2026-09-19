# 03: 凭证登录与双 Token 签发纵向切片

**What to build:** 提供基于账号/邮箱加密码的用户身份登录验证机制，签发高安全性短期 Access Token（15 分钟）与长期 Refresh Token（7 天），并在 Redis 中记录与管理该设备的活跃会话状态。

**Blocked by:** 02: 用户注册全链路纵向切片

**Status:** completed

- [x] 实现 `LoginDto`，支持使用 username 或 email 作为身份标识（`identifier`），并强制校验 `password`、`deviceType`（枚举约束）与 `deviceId`（非空）。
- [x] 实现 `TokenService` 与 `SessionService`，为通过密码验证的活跃用户签发携带唯一 `jti` 与设备元数据的 Access Token 和 Refresh Token。
- [x] 登录成功时在 Redis 中写入活跃设备会话 `auth:session:{userId}:{deviceType}`，记录 `deviceId`、`refreshTokenJti`、登录 IP 与时间戳，并设置 7 天 TTL。
- [x] 实现 `POST /api/v1/auth/login` 控制器接口，返回包含双 Token、过期秒数及用户公开资料的统一响应。
- [x] 编写登录端到端（E2E）测试，覆盖用户名/邮箱登录成功、密码错误拒绝、禁用账号拒绝以及 Redis 会话正确写入。
