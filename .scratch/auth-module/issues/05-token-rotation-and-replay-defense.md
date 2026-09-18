# 05: 令牌轮转与防重放攻击纵向切片

**What to build:** 实现无感平滑的双 Token 刷新与轮转机制（Refresh Token Rotation），并在检测到已轮转作废的旧 Token 被重复使用（重放攻击）时，立即启动安全熔断机制清除该设备的所有活跃会话。

**Blocked by:** 04: 受保护路由、鉴权守卫与当前用户信息纵向切片

**Status:** ready-for-agent

- [ ] 实现 `RefreshTokenDto`，严格校验 `refreshToken` 字段格式。
- [ ] 实现 `POST /api/v1/auth/refresh` 接口，验证 Refresh Token 签名的有效性。
- [ ] 校验 Refresh Token 中的 `jti` 是否与 Redis 中记录的当前活跃 `refreshTokenJti` 一致：
  - **一致时（正常轮转）**：签发全新的 Access Token 与全新 Refresh Token，原子更新 Redis 中的 `refreshTokenJti` 并刷新会话 TTL 为 7 天。
  - **不一致时（重放攻击检测）**：判定为凭证失窃重放，立即从 Redis 中彻底删除该设备的活跃会话 `auth:session:{userId}:{deviceType}`，并返回 `40106 TOKEN_REUSE_DETECTED` 错误。
- [ ] 编写令牌轮转端到端（E2E）测试，覆盖合法 Token 正常换发新 Token 对、轮转后旧 Token 再次使用触发重放防御拦截并清空会话的完整场景。
