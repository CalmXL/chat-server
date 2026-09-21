# Domain Glossary (领域词汇表)

本文档定义聊天系统（Chat Server）中与**用户认证（Authentication）与会话管理（Session Management）**相关的核心领域概念与术语规范。

---

## 1. 核心概念与实体 (Core Entities)

| 术语 (Term) | 英文标识 | 描述与业务规则 |
| :--- | :--- | :--- |
| **用户 (User)** | `User` | 聊天系统中的唯一用户主体，拥有全局唯一 `id`（UUID 或 BigInt），可绑定用户名、邮箱、手机号等登录标识。 |
| **凭证 (Credential)** | `Credential` | 用于证明用户身份的秘密信息（如哈希后的密码、OAuth Token、一次性验证码等）。密码禁止明文存储。 |
| **设备类型 (Device Type)** | `DeviceType` | 用户客户端的物理形态分类：`web` (网页端)、`mobile` (手机/平板移动端)、`desktop` (桌面客户端)、`other` (其他/小程序/Bot)。 |
| **设备标识 (Device ID)** | `DeviceId` | 客户端生成或绑定的唯一设备识别码（UUID/Fingerprint），用于精确识别具体终端实例。 |
| **会话 (Session / UserSession)** | `Session` | 用户在某一特定设备上的活跃登录状态。记录了当前设备、签发的 Refresh Token 摘要、登录 IP、最近活跃时间及过期时间。 |

---

## 2. 鉴权与令牌术语 (Auth & Token Terminology)

| 术语 (Term) | 英文标识 | 描述与业务规则 |
| :--- | :--- | :--- |
| **访问令牌 (Access Token)** | `AccessToken` | 短期有效的无状态 JWT（通常有效 15-30 分钟），用于 REST API 接口鉴权和 WebSocket 长连接握手验证。Payload 携带 `sub` (userId), `devType`, `devId`, `jti`。 |
| **刷新令牌 (Refresh Token)** | `RefreshToken` | 长期有效的 JWT 或安全随机凭证（通常有效 7-30 天），仅用于向认证服务器换发新的 Access Token / Refresh Token 对。 |
| **令牌轮转 (Token Rotation)** | `RefreshTokenRotation` | 每次使用 Refresh Token 换发新 Token 时，旧 Refresh Token 立即失效并生成全新 Refresh Token。若检测到已作废的 Token 被重复使用，触发**重放攻击防护**，强制注销该设备全部会话。 |
| **JWT 唯一标识 (JWT ID)** | `JTI` | 包含在 JWT Claims 中的全局唯一 UUID。用于在 Redis 黑名单中精确作废特定 Token。 |
| **会话互斥 / 踢出 (Kickout)** | `Kickout` | 同一设备类型（如 `web`）发生新登录时，服务端将同类型已有设备的会话置为无效或加入黑名单，并通过消息通知旧设备被顶替下线。 |
| **黑名单 (Token Blacklist)** | `TokenBlacklist` | 存储于 Redis 中的已提前注销/被踢下线的 Access Token JTI 集合，生命周期等于该 Token 剩余 TTL。 |

---

## 3. 系统边界与接口 (System Boundaries & Interfaces)

| 接口/动作 | 路径/标识 | 语义说明 |
| :--- | :--- | :--- |
| **用户注册** | `POST /auth/register` | 创建新用户记录，完成密码安全哈希，初始化用户信息。 |
| **凭证登录** | `POST /auth/login` | 校验身份凭证（账号/密码），生成双 Token，在 Redis 登记活跃会话并处理同端互斥。 |
| **令牌刷新** | `POST /auth/refresh` | 校验 Refresh Token 与 Redis 会话状态，执行轮转并下发新 Token 对。 |
| **主动登出** | `POST /auth/logout` | 作废当前设备的会话与 Token（将 JTI 加入 Redis 黑名单，清除 Redis 中的活跃会话记录）。 |
| **当前信息** | `GET /auth/me` | 基于有效 Access Token 提取当前用户资料与登录设备信息。 |

---

## 4. AI 问答与流式处理术语 (AI Chat & Streaming)

| 术语 (Term) | 英文标识 | 描述与业务规则 |
| :--- | :--- | :--- |
| **供应商 (Provider)** | `LlmProvider` | OpenAI 兼容协议（`baseURL + apiKey + model`）接入的模型服务方。接口统一为 `streamChat(req, signal): AsyncIterable<UpstreamChunk>`，API Key 仅存服务端环境变量。 |
| **模型目录 (Model Catalog)** | `ModelCatalog` | 静态配置（`AI_PROVIDERS_JSON`）中可切换的模型清单，经 `GET /ai/models` 暴露给前端，响应不含 Key。 |
| **上游块 (Upstream Chunk)** | `UpstreamChunk` | 供应商 SSE 流经归一化后的最小单位：`{delta?, usage?, finishReason?}`。思维链字段不透传。 |
| **流式管道 (Stream Pipeline)** | `StreamPipeline` | 上游块 → 可注册 transform 链（`pipeline.use(stage)`）→ SSE 事件的服务端加工管道。内置 `accumulate` / `usageExtract` / `sseEncode` 三段，是"自定义流式处理"的扩展点。 |
| **AI 会话 (Conversation)** | `Conversation` | 用户与模型的一组多轮问答，归属单一用户。可在首次提问时隐式创建，标题取首条内容前 20 字。 |
| **消息状态 (Message Status)** | `MessageStatus` | assistant 消息生命周期：`streaming`（生成中）→ `done`（完成）/ `partial`（断连截断，保留已生成内容）/ `error`（上游错误，保留部分内容）。 |
| **部分回答 (Partial Message)** | `PartialMessage` | 客户端断连时已流出部分内容并以 `partial` 状态落库的 assistant 消息，用户重进会话可见。 |
| **附件 (Attachment)** | `Attachment` | 经 `POST /uploads` 上传的文件（图片 `jpg/png/webp/gif` 或文档 `pdf/txt/md`），落盘 + DB 登记，提问时经 `attachmentIds` 绑定到用户消息。仅上传者本人可读取。 |
| **提取文本 (Extracted Text)** | `ExtractedText` | 文档附件在上传时同步提取的纯文本，存 `attachments.extractedText`，随首次提问完整注入 prompt，历史轮次截断重放。 |
| **上下文窗口 (History Window)** | `HistoryWindow` | 组装模型请求时携带的最近 N 条消息（默认 20，`AI_HISTORY_WINDOW` 可配）。窗口内历史图片降级为占位文本，仅当前轮图片内联 base64。 |
| **并发流护栏 (Concurrent Stream Guard)** | `ConcurrentStreamGuard` | Redis 计数器 `ai:streams:{userId}`（INCR/DECR + 10 分钟安全 TTL），限制单用户同时进行的流式问答数（`AI_MAX_CONCURRENT_STREAMS`，默认 3）。 |
| **SSE 事件 (SSE Event)** | `SseEvent` | 流式问答的下行事件：`meta`（首帧，关联信息）/ `delta`（增量文本）/ `usage`（token 用量）/ `done`（结束）/ `error`（错误），辅以 15s `: ping` 心跳。 |
