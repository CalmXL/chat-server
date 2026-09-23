# ADR-0004: AI 问答流式接口架构（多轮会话 / 多模型 / SSE / 附件）

- **状态 (Status)**: 已接受 (Accepted)
- **日期 (Date)**: 2026-09-21
- **修订 (Amended)**: 2026-09-22 — D2/D12 的供应商配置由内联 `AI_PROVIDERS_JSON` 迁移为受版本管理的 `config/ai-providers.json`（`AI_PROVIDERS_FILE`）+ `apiKeyEnv` 密钥间接引用；`AI_PROVIDERS_JSON` 降级为内联覆盖入口。
- **决策者 (Deciders)**: 架构团队 / 用户

---

## 1. 上下文 (Context)

系统需要在现有用户认证体系（ADR-0001 ~ ADR-0003）之上提供 AI 问答能力：用户可上传文件与图片、可切换底层模型、回答以流式方式输出，且流式处理过程支持服务端自定义加工。需确定会话形态、供应商接入方式、流式传输协议、附件策略与成本护栏。

约束：全局 `TransformInterceptor` 会将所有响应包装为统一信封（ADR-0003），与流式响应冲突；项目当前未引入任何 LLM SDK 与 WebSocket 依赖。

---

## 2. 决策记录 (Decisions)

### 2.1 多轮持久化会话 (D1)
- 采用服务端持久化的多轮会话，新增 `conversations`、`messages`、`attachments` 三张表。
- 服务端按会话组装上下文发送给模型；单轮问答视为多轮的退化形态，不单独提供无状态接口。

### 2.2 OpenAI 兼容的供应商抽象 (D2)
- 所有模型供应商统一走 **OpenAI 兼容协议**（`baseURL + apiKey + model` 三元组），覆盖 OpenAI / DeepSeek / 通义 / 豆包等国内主流厂商。
- 模型目录为**静态配置**（`config/ai-providers.json` + 环境变量，Zod 校验 fail-fast，沿用 ADR-0003 约定）。
- API Key 仅存在于**服务端**环境变量（目录里只写 `apiKeyEnv` 变量名），不下发、不支持用户自带 Key（BYOK 列为后续增强）。

### 2.3 SSE 流式传输 (D3)
- 采用 **SSE**（`POST` + `text/event-stream`）作为流式协议，使用原生 Express `Response` 手写事件流，不使用 `@Sse()` 装饰器（避免 Observable 绑定限制自定义处理）。
- 流式路由**显式绕开**全局 `TransformInterceptor`，不包装统一响应信封。
- 客户端断连通过 `req.on('close')` 感知并中止上游请求。
- 不引入 WebSocket（双向交互需求出现前不增加 `@nestjs/websockets` 依赖）。

### 2.4 服务端流式管道 + 自定义事件协议 (D4)
- 上游 token 流经服务端 **StreamPipeline**（可插拔 transform 链）后再编码为 SSE 事件下发。
- SSE 事件协议固定为四类：`delta`（增量内容）/ `usage`（token 用量）/ `done`（正常结束）/ `error`（错误）。
- 管道同时负责将完整回答聚合后落库（挂 D1）。

### 2.5 附件策略 (D5)
- 提供独立 `POST /uploads` 接口（multipart），文件存本地磁盘并在 DB 登记，问答请求仅携带 `attachmentIds[]`。
- **图片**：转 base64 data URL 内联进模型请求的 `messages[].content`（vision 模型标准做法）。
- **文档**：服务端提取纯文本后注入 prompt；不使用任何供应商专有 Files API（保持 D2 的兼容性）。

### 2.6 可配置的成本护栏 (D6)
- 首版护栏：JWT 鉴权（不标 `@Public()`）+ 每用户并发流上限 + 请求频率限制 + 上传大小上限 + 历史窗口长度。
- **所有阈值均为环境变量可配置**（Zod 校验、带默认值），不写死。
- 按 token 计费与精细化配额列为后续迭代。

### 2.7 消息状态机与部分回答落库 (D7)
- `messages.status` 枚举：`streaming / done / partial / error`。
- 流开始插入 `streaming` 记录；正常结束转 `done`；客户端断连转 `partial`（保留已生成内容）；上游错误转 `error`（保留部分内容）。
- assistant 消息记录 `modelId` 与 token 用量（`jsonb`：`{promptTokens, completionTokens}`）。
- `attachments` 以外键 `messageId` 归属单条消息。

### 2.8 SSE 事件协议 (D8)
- 事件序列：`meta`（首帧，`{conversationId, messageId, modelId}`）→ `delta`×N（`{content}` 纯增量）→ `usage`（`{promptTokens, completionTokens, totalTokens}`）→ `done`（`{messageId, finishReason: stop|length|abort}`）。
- 任何阶段失败发 `error` 事件（`{code, message}`，code 复用 `error-codes.ts` 规范）。
- 每 15s 发送 `: ping` 注释行心跳，防代理掐断空闲连接。

### 2.9 断连即中止 (D9)
- 客户端断连（`req.on('close')`）→ AbortController 立即中止上游请求，消息按 D7 转 `partial`。
- 不提供主动停止接口；前端关闭 EventSource 即等效（刻意取舍）。

### 2.10 上下文组装策略 (D10)
- 历史窗口：最近 N 条消息（默认 20，`AI_HISTORY_WINDOW` 可配），不引入 tokenizer 按 token 截断。
- 仅当前轮图片内联 base64；历史图片降级为占位文本 `[图片: 文件名]`。
- 文档提取文本随首次提问完整注入；历史轮次截断为前 `AI_DOC_TRUNCATE_CHARS`（默认 2000）字符 + `...[截断]`。

### 2.11 上传白名单与同步提取 (D11)
- 白名单：图片 `jpg/png/webp/gif` + 文档 `pdf/txt/md`（`docx` 列后续）。
- 上传时同步提取文本存 `attachments.extractedText`；提取失败直接 400（`UPLOAD_TEXT_EXTRACT_FAILED`），坏文件不入库。
- 孤儿附件（上传后未被引用）清理机制首版不做。

### 2.12 配置 Schema (D12)
- 供应商目录：默认从受版本管理的 `config/ai-providers.json` 加载，路径由 `AI_PROVIDERS_FILE` 指定（默认 `./config/ai-providers.json`）。每条为 `{id, baseURL, apiKeyEnv, models[]}`。
- 密钥解耦：目录中写 `apiKeyEnv: "DEEPSEEK_API_KEY"` 引用同名环境变量，明文密钥只留在 `.env`（不入库、不提交）；被引用变量缺失时 fail-fast。
- `AI_PROVIDERS_JSON`（单变量 JSON 数组，`{id, baseURL, apiKey|apiKeyEnv, models[]}`）保留为**内联覆盖**入口，优先级高于 `AI_PROVIDERS_FILE`（用于测试 / CI）。
- 两种来源均经同一 Zod schema 校验 fail-fast。
- 护栏阈值独立数值变量带默认值：`AI_MAX_CONCURRENT_STREAMS=3`、`AI_RATE_LIMIT_RPM=20`、`AI_MAX_UPLOAD_MB=10`、`AI_HISTORY_WINDOW=20`、`AI_DOC_TRUNCATE_CHARS=2000`。
- `GET /ai/models`（JWT 保护）向前端暴露模型目录 `{id, label, provider}[]`，响应绝不包含 Key。

### 2.13 REST API 面与隐式建会话 (D13)
- `POST /conversations`、`GET /conversations`（分页，按最近活跃）、`GET /conversations/:id/messages`、`PATCH /conversations/:id`、`DELETE /conversations/:id`（级联消息+附件+磁盘文件）。
- `POST /uploads`（multipart 多文件）、`GET /ai/models`、`POST /ai/chat`（SSE）。
- `POST /ai/chat` body：`{conversationId?, modelId, content, attachmentIds?}`；不传 `conversationId` 时隐式创建会话，标题取 content 前 20 字，可后续 PATCH 重命名。

### 2.14 注册式流管道 (D14)
- `StreamPipeline` 提供 `pipeline.use(stage)` 注册机制；首版内置三段：`accumulate`（聚合全文落库）→ `usageExtract` → `sseEncode`。
- 敏感词过滤等内容安全 stage 不内置，由业务方按需注入——这是"自定义流式处理"的扩展点。

### 2.15 模块拆分 (D15)
- 三个模块：`modules/ai`（chat 控制器 + provider 抽象 + StreamPipeline + 模型目录）、`modules/conversation`（会话/消息 CRUD + 上下文组装）、`modules/upload`（附件上传/提取/存储/下载）。
- 依赖方向单向：`ai → conversation → upload`，禁止反向依赖。上下文组装归属 conversation（它是"读历史"的行为），ai 模块只接收组装好的 messages 数组。

### 2.16 Provider 接口与零 SDK 实现 (D16)
- 接口：`LlmProvider.streamChat(req, signal): AsyncIterable<UpstreamChunk>`，`UpstreamChunk = {delta?, usage?, finishReason?}` 三出口归一化。
- 唯一实现 `OpenAiCompatibleProvider`：原生 `fetch` 调 `{baseURL}/chat/completions`（`stream: true`），手写上游 SSE 解析；**不引入 openai SDK**。
- 客户端标识：所有上游请求带专属 `User-Agent`（`chat-server/<version>`，可由 provider 的 `userAgent` 覆盖），不使用通用 HTTP 库默认 UA。
- 会话透传：`ChatRequest.sessionId`（取 `conversation.id`）在 provider 配置了 `sessionHeader` 时作为该请求头发送，满足 OpenCode Go 的 `x-opencode-session` 路由/缓存要求（D21）。
- 思维链（reasoning）字段首版不透传。
- 测试缝：e2e 以同接口 `FakeProvider` 经 DI 替换，不碰真实网络。

### 2.17 Redis 护栏结构 (D17)
- 并发流：`ai:streams:{userId}`，`INCR` 后判超限则 `DECR` 回退并拒绝；流结束（无论成败）`DECR`；key 带 10 分钟安全 TTL 防崩溃泄漏。
- 频率限制：固定窗口 `ai:rate:{userId}:{yyyyMMddHHmm}`，`INCR` + 60s TTL，超 `AI_RATE_LIMIT_RPM` 拒绝；不引入 Lua 滑动窗口（边界突刺可接受）。
- 两项判定均在**响应头发送之前**，拒绝时走 ADR-0003 标准错误信封。

### 2.18 错误码与流中错误双轨制 (D18)
- 新增错误码：`40401 CONVERSATION_NOT_FOUND`、`40402 ATTACHMENT_NOT_FOUND`、`40010 AI_MODEL_NOT_FOUND`、`40011 UPLOAD_TYPE_NOT_ALLOWED`、`40012 UPLOAD_TEXT_EXTRACT_FAILED`、`41301 UPLOAD_TOO_LARGE`、`42901 AI_RATE_LIMITED`、`42902 AI_CONCURRENT_STREAM_LIMIT`、`50201 AI_PROVIDER_ERROR`。
- 双轨制：响应头未发 → 标准错误信封（对应 HTTP 状态）；响应头已发（流中）→ SSE `error` 事件 + 消息转 `error` 并保留部分内容。

### 2.19 附件读取通道 (D19)
- `GET /uploads/:id`（元数据 JSON）与 `GET /uploads/:id/download`（裸 `Response` 流式返回文件本体，带正确 `Content-Type`，不包信封）。
- 权限：仅上传者本人可访问。

### 2.20 测试策略 (D20)
- 单元测试：StreamPipeline 三段、上下文组装（窗口/图片降级/文档截断）、上传提取。
- e2e（vitest + pg-mem + ioredis-mock + supertest）：完整 SSE 事件序列、断连转 `partial`、429 护栏、隐式建会话、附件全流程。
- 不测真实供应商连通性（属运维探针范畴）。

### 2.21 上游客户端标识与会话头 (D21)
- 背景：OpenCode Go 要求客户端发送专属 `User-Agent`，并在 `x-opencode-session` 头携带稳定的会话 ID，否则返回 `400 MissingSessionID`。
- 决策：provider 目录新增可选 `userAgent` 与 `sessionHeader`；`OpenAiCompatibleProvider` 始终发送 `User-Agent`（默认 `chat-server/<version>`），当配置了 `sessionHeader` 且请求带 `sessionId` 时附加该头。会话 ID 取 `conversation.id`（会话内稳定）。
- 通用性：普通 OpenAI 兼容供应商忽略未知请求头，故该机制对 DeepSeek 等无副作用。

---

## 3. 结果与影响 (Consequences)

### 正面影响
- OpenAI 兼容抽象使切换/新增供应商零代码改动（仅改配置）。
- SSE + 原生 Response 使流式管道完全可控，且与统一响应信封的冲突被显式隔离在单一路由。
- 附件与问答解耦（先传后问），multipart 不污染 JSON 请求契约。

### 负面影响 / 取舍
- 历史中的图片若每轮重发将消耗大量 token，需在上下文组装策略中处理（见后续决策）。
- 文档纯文本提取丢失排版信息；不支持供应商原生文件理解能力。
- 护栏阈值依赖运维配置合理性，默认值偏保守。
- 固定窗口限流在窗口边界存在 2 倍突刺容忍。
- 不透传思维链（reasoning）内容，支持思维链模型的厂商该部分能力被裁剪。
- 并发流计数器依赖安全 TTL 兜底崩溃泄漏，极端情况下 10 分钟内计数可能偏高。
