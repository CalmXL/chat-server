# 04: 受保护路由、鉴权守卫与当前用户信息纵向切片

**What to build:** 构建全系统通用的身份鉴权守卫（`JwtAuthGuard`）与 `@CurrentUser()` 装饰器，默认保护所有业务接口，并通过受保护的 `/auth/me` 接口验证身份并返回当前登录用户的 Profile 资料与会话元数据。

**Blocked by:** 03: 凭证登录与双 Token 签发纵向切片

**Status:** ready-for-agent

- [ ] 实现全局生效的 `JwtAuthGuard`，自动从 HTTP `Authorization: Bearer <token>` 头提取并验证 Access Token 签名与有效期，未认证请求返回 `401` 业务错误。
- [ ] 实现 `@Public()` 自定义元数据装饰器，为注册、登录、刷新等公开接口提供白名单放行支持。
- [ ] 实现 `@CurrentUser()` 自定义参数装饰器，方便在控制器方法中直接注入当前已解析的 `JwtPayload`。
- [ ] 抽象并定义通用的 `WsAuthGuard` 契约接口，确保未来长连接握手可无缝复用相同的 Token 校验逻辑。
- [ ] 实现受保护路由 `GET /api/v1/auth/me`，返回当前用户的详细资料、当前设备类型及设备 ID。
- [ ] 编写鉴权守卫端到端（E2E）测试，验证有效 Token 访问通过、无 Token 拦截、伪造/过期 Token 拦截以及 `@Public()` 路由正常放行。
