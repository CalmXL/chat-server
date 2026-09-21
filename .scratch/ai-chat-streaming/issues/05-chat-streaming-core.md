# 05: 流式问答主干（SSE）

**What to build:** 登录用户对已有会话发起 `POST /ai/chat`（`{conversationId, modelId, content}`，此票**不支持**附件与历史上下文），立即收到 SSE 事件流：`meta`（首帧，会话/消息/模型标识）→ `delta`×N（纯增量文本）→ `usage`（token 用量）→ `done`（finishReason）；15 秒 `: ping` 心跳。服务端经 OpenAI 兼容 Provider（原生 fetch，零 SDK）调用上游，token 流经注册式 StreamPipeline（内置 accumulate/usageExtract/sseEncode 三段，支持 `use(stage)` 注入自定义加工）后编码下发。assistant 消息完整生命周期落库：`streaming → done`；客户端断连即中止上游并转 `partial`（保留已生成内容）；上游错误转 `error`（保留部分内容）并下发 `error` 事件。双轨错误：响应头未发走标准信封，已发走 `error` 事件。user 消息同样落库。

来自设计文档的关键类型（决策编码，照此实现）：

```typescript
interface LlmProvider {
  streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<UpstreamChunk>;
}
interface UpstreamChunk { delta?: string; usage?: TokenUsage; finishReason?: 'stop' | 'length'; }
// MessageStatus: 'streaming' | 'done' | 'partial' | 'error'
```

**Blocked by:** 01（SSE 需信封旁路）、02（modelId 校验）、03（会话与消息表）

**Status:** ready-for-agent

- [ ] 事件序列与字段严格符合 domain-model-ai.md 第 4 节（meta 永远首帧）
- [ ] 15s 心跳注释行；连接关闭即中止上游（AbortController）且消息转 `partial`
- [ ] 正常结束消息转 `done` 并含聚合全文与 token 用量；上游错误转 `error` 且保留部分内容
- [ ] 管道支持注册自定义 stage 并被执行（e2e 注入一个记录型 stage 验证）
- [ ] `modelId` 非法 40010、会话不存在或越权 40401，均走标准信封
- [ ] e2e（FakeProvider DI 替换）：完整事件序列、断连转 `partial`、双轨错误、自定义 stage
