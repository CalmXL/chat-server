# 01: 基础设施配置、数据库/Redis 模块与全局响应管道基准

**What to build:** 为整个聊天服务端建立健壮的基础设施基准，包括强类型环境变量启动校验、PostgreSQL 与 Redis 连接生命周期管理、全局统一响应结构拦截器及全局业务异常过滤器，确保所有后续业务模块具备统一的配置、数据存储与错误响应规范。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 引入并配置 `@nestjs/config` 搭配 Zod 校验环境变量，当缺失关键配置（数据库连接、Redis 地址、JWT 密钥）时在启动阶段立即中断并输出明确错误。
- [ ] 封装并注册 `DatabaseModule`（基于 TypeORM + PostgreSQL）与 `RedisModule`（基于 `ioredis`），支持连接池与优雅停机销毁。
- [ ] 实现全局 `TransformInterceptor`，将所有控制器的正常返回值自动包装为 `{ code: 0, message: "success", data: ..., timestamp: number }`。
- [ ] 实现全局 `AllExceptionsFilter`，统一捕获 HTTP 异常与未捕获错误，并将其转换为符合 `docs/api-spec.md` 规范的统一业务错误响应。
- [ ] 编写基础端到端测试，验证全局拦截器、过滤器及数据库/Redis 模块正常协作。
