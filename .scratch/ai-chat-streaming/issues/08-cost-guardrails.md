# 08: 成本护栏（限流 + 并发流）

**What to build:** 流式问答接入两道 Redis 护栏（均判定在响应头发送之前，拒绝走标准信封）：频率限制——固定窗口 `ai:rate:{userId}:{minute}` INCR + 60s TTL，超 `AI_RATE_LIMIT_RPM`（默认 20）返回 42901；并发流上限——`ai:streams:{userId}` INCR 后超限则 DECR 回退并返回 42902（默认 3），流正常结束/出错/断连都 DECR，key 带 10 分钟安全 TTL 防崩溃泄漏。阈值全部 env 可配。普通 REST 端点不受限。

**Blocked by:** 05（流式问答主干）

**Status:** ready-for-agent

- [ ] 超限请求收到 42901/42902 标准错误信封，且未触碰上游 Provider
- [ ] 流结束（done/error/断连三种结局）后并发计数正确回退（e2e 断言 Redis 值）
- [ ] 两个阈值 env 可配且改小后立刻生效
- [ ] e2e：连续打满限流、并发占满后新请求被拒、断连后额度恢复
