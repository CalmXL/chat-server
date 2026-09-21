# 03: 会话与消息 CRUD

**What to build:** `conversations` 与 `messages` 两表落地（schema 见 domain-model-ai.md）。登录用户可以：创建会话（标题可空）、分页获取自己的会话列表（按 `lastMessageAt` 降序）、查看某会话的消息历史（含消息状态与 token 用量字段）、重命名会话、删除会话（级联删除其消息）。访问他人会话一律 404（`CONVERSATION_NOT_FOUND`），不暴露存在性。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 两张表按 domain-model-ai.md 第 1 节落地（TypeORM，沿用现有 synchronize 约定）
- [ ] 五个端点全部可用且统一走 JWT 鉴权与响应信封
- [ ] 列表按 `lastMessageAt` 降序分页；空标题创建被拒绝或落默认值的规则明确
- [ ] 跨用户访问/修改/删除均返回 40401
- [ ] 删除会话后其消息在库中不可查（级联）
- [ ] e2e 覆盖上述全部路径（消息数据可用测试夹具直接落库）
