# Spec: AI 问答流式接口（多轮会话 / 多模型切换 / 附件 / 自定义流式处理）

> 架构决策详见 ADR-0004（D1–D20），术语见 glossary 第 4 节，数据契约见 domain-model-ai.md。本文档为发布用规格说明。

## Problem Statement

终端用户在与 AI 模型交互时，当前系统没有任何问答能力：无法上传文件和图片让模型理解，无法在不同模型之间切换，回答只能等待完整生成（长时间无反馈），且服务端无法对模型输出做任何自定义加工（如聚合落库、内容过滤、用量统计）。客户端开发者也没有稳定的流式协议和模型目录可对接。

## Solution

为用户提供一个登录即可用的 AI 问答接口：先通过上传接口提交图片/文档附件，再发起流式问答——回答以 SSE 事件逐字下发，首帧即告知会话与消息标识；用户可在每次提问时从模型目录中自由切换模型；问答自动归入多轮会话，历史可回看、可重命名、可删除；断连后已生成的半截回答被保留，重进会话可见。服务端在流式管道中完成聚合落库与用量提取，并向业务方开放自定义加工 stage 的注册点。所有成本护栏（并发流数、请求频率、上传大小、上下文窗口）均可由运维通过环境变量配置。

## User Stories

1. As a 终端用户, I want to 注册并登录后使用 AI 问答, so that 我的对话数据与他人隔离且可追溯.
2. As a 终端用户, I want to 查看可切换的模型目录, so that 我能根据场景选择合适模型.
3. As a 终端用户, I want to 在每次提问时指定模型, so that 不同问题可以使用不同模型回答.
4. As a 终端用户, I want to 提问后逐字看到回答流出, so that 我不必长时间等待空白屏幕.
5. As a 终端用户, I want to 在流的第一帧就拿到会话与消息标识, so that 我的客户端能把流与本地记录关联起来.
6. As a 终端用户, I want to 首条提问自动创建会话并自动生成标题, so that 我不必手动建会话就能开始问答.
7. As a 终端用户, I want to 查看我的会话列表（按最近活跃排序、分页）, so that 我能快速回到之前的对话.
8. As a 终端用户, I want to 查看某个会话的完整消息历史（含附件元数据）, so that 我能回顾之前的问答内容.
9. As a 终端用户, I want to 重命名会话, so that 我能用有意义的标题组织对话.
10. As a 终端用户, I want to 删除会话, so that 我不再需要的对话及其附件被彻底清除（含磁盘文件）.
11. As a 终端用户, I want to 上传图片（jpg/png/webp/gif）并随问题一起提交, so that 模型能看图回答.
12. As a 终端用户, I want to 上传文档（pdf/txt/md）并随问题一起提交, so that 模型能基于文档内容回答.
13. As a 终端用户, I want to 上传类型/大小不合规时收到明确错误, so that 我知道该传什么文件.
14. As a 终端用户, I want to 文档解析失败时上传即被拒绝, so that 我不会拿着坏文件提问却得到莫名回答.
15. As a 终端用户, I want to 下载/查看自己上传过的附件, so that 我能在历史消息中回看图片和文件.
16. As a 终端用户, I want to 无法访问他人上传的附件, so that 我的文件不会被其他用户窥探.
17. As a 终端用户, I want to 多轮对话中模型记得之前的上下文, so that 我能追问而不用重复粘贴历史.
18. As a 终端用户, I want to 历史中的图片不重复消耗我的上下文额度, so that 长对话不会因图片 token 膨胀而失控.
19. As a 终端用户, I want to 断网/关页面后已生成的半截回答被保留, so that 我重进会话时能看到回答进行到哪里.
20. As a 终端用户, I want to 看到每次回答的 token 用量, so that 我能理解每次调用的消耗.
21. As a 终端用户, I want to 触发频率/并发限制时收到明确的 429 错误, so that 我知道稍后再试而不是面对无声失败.
22. As a 终端用户, I want to 上游模型出错时收到结构化错误事件, so that 我的客户端能统一处理失败而不是解析半截 JSON.
23. As a 客户端开发者, I want to 流式协议有固定的事件类型（meta/delta/usage/done/error）与心跳, so that 我能写出健壮、防代理超时的解析器.
24. As a 客户端开发者, I want to 拒绝类错误（鉴权/限流/参数）走标准错误信封、流中错误走 error 事件, so that 我的错误处理路径清晰可预测.
25. As a 运维, I want to 通过环境变量配置供应商列表与全部护栏阈值且缺失必填项时启动即失败, so that 错误配置不会以运行期故障的形式出现.
26. As a 运维, I want to API Key 只存在于服务端且从不出现在任何接口响应中, so that 密钥不会泄漏给客户端.
27. As a 业务方, I want to 向流式管道注册自定义加工 stage（如敏感词过滤）, so that 我能按业务需要定制输出而不改动核心代码.

## Implementation Decisions

- **模块拆分**：新增 `ai`、`conversation`、`upload` 三个模块，依赖方向单向 `ai → conversation → upload`。`ai` 承载流式问答、Provider 抽象、StreamPipeline 与模型目录；`conversation` 承载会话/消息 CRUD 与上下文组装；`upload` 承载附件上传、文本提取、存储与下载。
- **Provider 抽象**：所有供应商走 OpenAI 兼容协议（`baseURL + apiKey + model`），原生 fetch 调用，不引入 LLM SDK。归一化接口（来自设计文档，精确编码决策）：
  ```typescript
  interface LlmProvider {
    streamChat(req: ChatRequest, signal: AbortSignal): AsyncIterable<UpstreamChunk>;
  }
  interface UpstreamChunk { delta?: string; usage?: TokenUsage; finishReason?: 'stop' | 'length'; }
  ```
  思维链（reasoning）字段不透传。
- **流式管道**：注册式 `StreamPipeline`（`pipeline.use(stage)`），内置三段 `accumulate`（聚合全文落库）→ `usageExtract` → `sseEncode`；自定义 stage 是"自定义流式处理"的扩展点，首版不内置内容安全 stage。
- **传输协议**：SSE（POST + text/event-stream），原生 Response 手写事件流，不用 `@Sse()` 装饰器；该路由显式绕开全局 TransformInterceptor（ADR-0003 信封不适用于流）。事件序列固定：`meta`（首帧 `{conversationId, messageId, modelId}`）→ `delta`×N（`{content}` 纯增量）→ `usage` → `done`（`{messageId, finishReason: stop|length|abort}`）；任何阶段失败发 `error`（`{code, message}`）；每 15s 发 `: ping` 心跳。
- **消息状态机**（来自设计文档）：`streaming → done | partial | error`。流开始插入 `streaming` 记录；正常结束转 `done`；客户端断连转 `partial`（保留已生成内容）；上游错误转 `error`（保留部分内容）。assistant 消息记录 `modelId` 与 `tokenUsage`（jsonb）。
- **断连语义**：`req.on('close')` 触发 AbortController 立即中止上游请求，消息转 `partial`，并发流计数器回退。不提供主动停止接口（关闭 EventSource 即等效）。
- **上下文组装**：取最近 `AI_HISTORY_WINDOW`（默认 20）条消息；仅当前轮图片以 base64 data URL 内联（vision 标准做法），历史图片降级为占位文本 `[图片: 文件名]`；文档提取文本随首次提问完整注入，历史轮次截断为前 `AI_DOC_TRUNCATE_CHARS`（默认 2000）字符 + `...[截断]`；可选 system prompt 由配置注入。
- **Schema 变更**：新增三张表。`conversations`（userId 外键、title、lastMessageAt 索引）；`messages`（conversationId 外键、role、content、modelId、status、tokenUsage jsonb）；`attachments`（uploaderId 外键、messageId 可空外键——上传时未绑定、提问时回填、kind、filename、storagePath、mimeType、size、extractedText）。
- **附件策略**：独立上传接口（multipart 多文件），白名单图片 `jpg/png/webp/gif` + 文档 `pdf/txt/md`；上传时同步提取文档文本，失败即 400（坏文件不入库）；文件落盘（uuid 命名），下载与元数据接口仅属主可访问，下载走裸 Response 不包信封；删除会话级联删除消息、附件记录与磁盘文件。
- **API 契约**：`POST/GET/PATCH/DELETE /conversations[...]`、`POST /uploads`、`GET /uploads/:id[/download]`、`GET /ai/models`、`POST /ai/chat`（SSE）。`POST /ai/chat` body `{conversationId?, modelId, content, attachmentIds?}`，不传 `conversationId` 时隐式建会话（标题取 content 前 20 字）。
- **护栏（全部 env 可配，Zod 校验 fail-fast）**：并发流 `ai:streams:{userId}` INCR/DECR + 10 分钟安全 TTL（默认上限 3）；频率固定窗口 `ai:rate:{userId}:{minute}` INCR + 60s TTL（默认 20 rpm）；上传大小（默认 10MB）；上下文窗口（默认 20 条）；文档截断（默认 2000 字符）。护栏判定在响应头发送之前，拒绝走标准错误信封。
- **错误码双轨制**：新增 `40401/40402/40010/40011/40012/41301/42901/42902/50201` 九个错误码；响应头未发 → 标准信封 + HTTP 状态；响应头已发 → SSE `error` 事件 + 消息转 `error`。
- **配置**：供应商目录走受版本管理的 `config/ai-providers.json`（`AI_PROVIDERS_FILE`），条目用 `apiKeyEnv` 间接引用密钥变量；`AI_PROVIDERS_JSON` 保留为内联覆盖入口。`GET /ai/models` 暴露目录（`{id, label, provider, providerLabel}`）且响应绝不含 Key；model id 跨 provider 全局唯一，冲突 fail-fast。

## Testing Decisions

- **好测试的标准**：只断言外部可观察行为（HTTP 状态、响应体、SSE 事件序列、数据库落库结果、Redis 计数器值），不断言内部实现（管道内部调用次序、私有方法、字段拷贝）。
- **接缝**（与用户确认）：唯一测试入口是 **HTTP e2e（supertest）**；唯一新替换点是 **`LlmProvider` DI 接缝**，测试中以 `FakeProvider` 覆盖注册，可编程产出 delta 序列 / usage / finishReason / 中途错误 / 挂起（用于断连测试）。上传用真实临时目录，PDF 提取用真实库 + fixture，Redis 走 ioredis-mock。
- **e2e 覆盖**：完整 SSE 事件序列（meta→delta×N→usage→done）、断连转 `partial` 且计数器回退、429 双护栏、隐式建会话与自动标题、附件全流程（上传→提问→历史元数据→属主下载/越权拒绝）、多轮上下文连续性、上游错误双轨制。
- **单元覆盖**：StreamPipeline 三段、上下文组装（窗口/图片降级/文档截断）、上传提取（pdf/txt）。
- **Prior art**：`test/auth.e2e-spec.ts`（supertest + pg-mem + ioredis-mock 全栈 e2e）、`auth.service.spec.ts` / `token.service.spec.ts`（服务级单测）。不测真实供应商连通性（属运维探针）。

## Out of Scope

- WebSocket 双向通道（含 `@nestjs/websockets` 依赖引入）
- 主动停止生成接口（前端关闭 EventSource 等效）
- 用户自带 API Key（BYOK）与 DB 化模型目录
- 供应商专有 Files API 与原生文件理解能力
- 思维链（reasoning）内容透传
- 孤儿附件定时清理、按 token 计费与精细化配额
- docx 支持、滑动窗口限流（固定窗口边界突刺可接受）
- 真实供应商连通性测试

## Further Notes

- 完整决策链：ADR-0004（D1–D20）；数据契约：domain-model-ai.md；术语：glossary 第 4 节。
- 实现期间需同步更新 `docs/api-spec.md` 与 `docs/implementation-plan.md`（沿用 auth 模块的文档惯例）。
- 发布待办：`gh` 完成认证后，将本 spec 发布为 GitHub Issue（repo: CalmXL/chat-server）并应用 `ready-for-agent` 标签。
