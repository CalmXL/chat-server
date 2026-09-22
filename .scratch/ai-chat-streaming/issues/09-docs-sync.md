# 09: 文档同步收尾

**What to build:** 文档与实现对齐：`docs/api-spec.md` 补齐全部新端点契约（含 SSE 事件协议一节：事件序列、字段、双轨错误）；`docs/openapi.json` 重新生成；`docs/implementation-plan.md` 勾选 AI 问答各阶段状态；README 的 API 概览更新。glossary 第 4 节与 domain-model-ai.md 已先行，仅需校对与实现的一致性（字段名、错误码、默认值）。

**Blocked by:** 07（附件接入问答）、08（成本护栏）

**Status:** done

- [x] api-spec.md 覆盖 10 个新端点 + SSE 协议节，与实现逐字段一致
- [x] openapi.json 由 swagger 重生成且无手工残留差异
- [x] implementation-plan.md 状态勾选完成；README 概览更新
- [x] 校对 glossary 第 4 节 / domain-model-ai.md 与最终实现的一致性并修正偏差
