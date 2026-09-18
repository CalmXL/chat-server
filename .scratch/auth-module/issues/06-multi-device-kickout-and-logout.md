# 06: 多端顶号踢线与主动注销纵向切片

**What to build:** 完善即时通讯多端会话管控，实现“同端互斥（顶号踢线）、异端共存”策略，并提供主动注销接口（`/auth/logout`），结合 Redis Access Token 黑名单机制实现毫秒级失效。

**Blocked by:** 05: 令牌轮转与防重放攻击纵向切片

**Status:** ready-for-agent

- [ ] 在登录流程中集成**同端顶号踢线（Kickout）**逻辑：当同一用户在相同 `deviceType` 上有新设备登录时，将旧设备的 Access Token JTI 写入 Redis 黑名单 `auth:blacklist:{jti}`（TTL 等于 Token 剩余寿命），并用新设备覆盖活跃会话。
- [ ] 验证并确保不同 `deviceType`（如 Web 与 Mobile、Desktop）之间的登录状态独立共存，互不影响。
- [ ] 实现 `POST /api/v1/auth/logout` 接口，将当前调用的 Access Token JTI 写入 Redis 黑名单，并清除 Redis 中的设备活跃会话记录。
- [ ] 在 `JwtAuthGuard` 中集成 Redis 黑名单查验：凡命中黑名单的 Access Token 立即拒绝访问并返回 `40105 TOKEN_REVOKED`。
- [ ] 编写完整的多端顶号与注销 E2E 测试，覆盖同端顶号后旧设备被拦截、异端双设备同时访问通过、主动注销后即时失效的场景。
