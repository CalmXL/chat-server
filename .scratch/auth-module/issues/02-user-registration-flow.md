# 02: 用户注册全链路纵向切片

**What to build:** 提供新用户账号创建与注册能力，包括用户数据持久化实体建立、严格的注册参数白名单校验、Argon2id 密码安全单向哈希，以及重复用户名或邮箱注册冲突检测。

**Blocked by:** 01: 基础设施配置、数据库/Redis 模块与全局响应管道基准

**Status:** completed

- [x] 创建 `User` TypeORM 实体，包含 UUID 主键、唯一索引约束的 `username` 与 `email`、`passwordHash`、`nickname`、`avatar`、`status` 及时间戳字段。
- [x] 实现 `RegisterDto`，包含严格的数据格式与长度校验规则（用户名、邮箱格式、密码复杂度）。
- [x] 实现 `PasswordService`，使用 `@node-rs/argon2` 的 Argon2id 算法执行安全的密码哈希计算与比对。
- [x] 实现 `POST /api/v1/auth/register` 控制器与服务层逻辑，当用户名或邮箱已存在时返回 `40901 USER_ALREADY_EXISTS`，成功时返回脱敏后的用户基本信息。
- [x] 编写用户注册端到端（E2E）测试，覆盖合法注册成功、入参校验失败拦截以及重复注册冲突拦截场景。
