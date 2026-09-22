# API Specification: 聊天与 AI 问答服务端接口规范

本文档定义聊天服务端（Chat Server）的所有 HTTP REST API 契约、SSE 流式事件协议、入参定义、返回值示例与业务错误码对照表。

---

## 1. 全局约定与协议头 (Global Headers & Format)

- **Content-Type**: `application/json`（SSE 流为 `text/event-stream`，文件下载为文件原始 MIME 类型裸流）
- **鉴权 Header**: `Authorization: Bearer <AccessToken>`（针对受保护路由）
- **通用成功响应体 (JSON 接口)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "timestamp": 1726650000000
}
```
- **通用错误响应体**:
```json
{
  "code": 40001,
  "message": "用户名或密码错误",
  "error": "Unauthorized",
  "timestamp": 1726650000000
}
```

---

## 2. 认证模块接口定义 (Auth Endpoints)

### 2.1 用户注册 (Register)
- **URL**: `POST /api/v1/auth/register`
- **公开路由**: 是 (`@Public()`)
- **请求体 (Request Body)**:
```json
{
  "username": "alice_dev",
  "email": "alice@example.com",
  "password": "Password123",
  "nickname": "Alice",
  "avatar": "https://example.com/avatar.png"
}
```
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
    "username": "alice_dev",
    "email": "alice@example.com",
    "nickname": "Alice",
    "avatar": "https://example.com/avatar.png",
    "status": "active",
    "createdAt": "2026-09-18T10:00:00.000Z"
  },
  "timestamp": 1726650000000
}
```

---

### 2.2 用户登录 (Login)
- **URL**: `POST /api/v1/auth/login`
- **公开路由**: 是 (`@Public()`)
- **请求体 (Request Body)**:
```json
{
  "identifier": "alice_dev", // 支持用户名或邮箱
  "password": "Password123",
  "deviceType": "web",        // 枚举: 'web' | 'mobile' | 'desktop' | 'other'
  "deviceId": "browser-uuid-12345"
}
```
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "expiresIn": 900,
    "user": {
      "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
      "username": "alice_dev",
      "email": "alice@example.com",
      "nickname": "Alice",
      "avatar": "https://example.com/avatar.png"
    }
  },
  "timestamp": 1726650000000
}
```

---

### 2.3 令牌刷新与轮转 (Refresh Token)
- **URL**: `POST /api/v1/auth/refresh`
- **公开路由**: 是 (`@Public()`)
- **请求体 (Request Body)**:
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
    "expiresIn": 900
  },
  "timestamp": 1726650000000
}
```

---

### 2.4 主动登出 (Logout)
- **URL**: `POST /api/v1/auth/logout`
- **公开路由**: 否 (需携带有效 AccessToken)
- **请求体**: 空对象 `{}`
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "loggedOut": true
  },
  "timestamp": 1726650000000
}
```

---

### 2.5 获取当前登录用户信息 (Get Profile)
- **URL**: `GET /api/v1/auth/me`
- **公开路由**: 否 (需携带有效 AccessToken)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
    "username": "alice_dev",
    "email": "alice@example.com",
    "nickname": "Alice",
    "avatar": "https://example.com/avatar.png",
    "status": "active",
    "deviceType": "web",
    "deviceId": "browser-uuid-12345",
    "createdAt": "2026-09-18T10:00:00.000Z"
  },
  "timestamp": 1726650000000
}
```

---

## 3. AI 问答与会话模块接口定义 (AI & Conversation Endpoints)

### 3.1 获取模型目录 (Get Model Catalog)
- **URL**: `GET /ai/models`
- **公开路由**: 否 (需携带有效 AccessToken)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "gpt-4o",
      "label": "GPT-4o",
      "provider": "openai"
    },
    {
      "id": "deepseek-chat",
      "label": "DeepSeek Chat",
      "provider": "deepseek"
    }
  ],
  "timestamp": 1726650000000
}
```

---

### 3.2 发起流式问答 (Chat Streaming)
- **URL**: `POST /ai/chat`
- **公开路由**: 否 (需携带有效 AccessToken)
- **信封旁路**: 是（响应头 `Content-Type: text/event-stream`，见下文第 4 节 SSE 协议）
- **请求体 (Request Body)**:
```json
{
  "conversationId": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3", // 可选，不传时隐式自动创建
  "modelId": "gpt-4o",                                       // 必填，从 /ai/models 获取
  "content": "请结合附件分析内容",                           // 必填
  "attachmentIds": ["att-uuid-1", "att-uuid-2"]              // 可选，上传返回的附件 UUID 列表
}
```

---

### 3.3 创建会话 (Create Conversation)
- **URL**: `POST /conversations`
- **公开路由**: 否 (需携带有效 AccessToken)
- **请求体 (Request Body)**:
```json
{
  "title": "量子计算讨论" // 可选
}
```
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
    "userId": "user-uuid-1",
    "title": "量子计算讨论",
    "lastMessageAt": null,
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:00:00.000Z"
  },
  "timestamp": 1726650000000
}
```

---

### 3.4 分页获取会话列表 (List Conversations)
- **URL**: `GET /conversations?page=1&size=20`
- **公开路由**: 否 (需携带有效 AccessToken)
- **Query 参数**: `page` (默认 1), `size` (默认 20)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
        "userId": "user-uuid-1",
        "title": "量子计算讨论",
        "lastMessageAt": "2026-09-18T10:05:00.000Z",
        "createdAt": "2026-09-18T10:00:00.000Z",
        "updatedAt": "2026-09-18T10:05:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "size": 20
  },
  "timestamp": 1726650000000
}
```

---

### 3.5 获取会话消息历史 (Get Messages)
- **URL**: `GET /conversations/:id/messages`
- **公开路由**: 否 (需携带有效 AccessToken)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "msg-1",
      "conversationId": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
      "role": "user",
      "content": "请分析附件",
      "modelId": null,
      "status": "done",
      "tokenUsage": null,
      "attachments": [
        {
          "id": "att-1",
          "filename": "summary.txt",
          "kind": "document",
          "mimeType": "text/plain",
          "size": 1024,
          "createdAt": "2026-09-18T10:00:00.000Z"
        }
      ],
      "createdAt": "2026-09-18T10:01:00.000Z",
      "updatedAt": "2026-09-18T10:01:00.000Z"
    },
    {
      "id": "msg-2",
      "conversationId": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
      "role": "assistant",
      "content": "根据文档分析如下...",
      "modelId": "gpt-4o",
      "status": "done",
      "tokenUsage": {
        "promptTokens": 150,
        "completionTokens": 80,
        "totalTokens": 230
      },
      "attachments": [],
      "createdAt": "2026-09-18T10:01:01.000Z",
      "updatedAt": "2026-09-18T10:01:05.000Z"
    }
  ],
  "timestamp": 1726650000000
}
```

---

### 3.6 重命名会话 (Update Conversation)
- **URL**: `PATCH /conversations/:id`
- **公开路由**: 否 (需携带有效 AccessToken)
- **请求体 (Request Body)**:
```json
{
  "title": "新会话标题"
}
```
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3",
    "userId": "user-uuid-1",
    "title": "新会话标题",
    "lastMessageAt": "2026-09-18T10:05:00.000Z",
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:10:00.000Z"
  },
  "timestamp": 1726650000000
}
```

---

### 3.7 删除会话 (Delete Conversation)
- **URL**: `DELETE /conversations/:id`
- **公开路由**: 否 (需携带有效 AccessToken)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "success": true
  },
  "timestamp": 1726650000000
}
```

---

## 4. 附件上传与下载接口定义 (Upload Endpoints)

### 4.1 多文件上传 (Upload Files)
- **URL**: `POST /uploads`
- **公开路由**: 否 (需携带有效 AccessToken)
- **Content-Type**: `multipart/form-data`（字段名为 `files`）
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "attachmentIds": [
      "att-uuid-1"
    ],
    "attachments": [
      {
        "id": "att-uuid-1",
        "uploaderId": "user-uuid-1",
        "kind": "document",
        "filename": "readme.md",
        "mimeType": "text/markdown",
        "size": 2048,
        "extractedText": "# Markdown Title\n...",
        "createdAt": "2026-09-18T10:00:00.000Z"
      }
    ]
  },
  "timestamp": 1726650000000
}
```

---

### 4.2 获取附件元数据 (Get Attachment Metadata)
- **URL**: `GET /uploads/:id`
- **公开路由**: 否 (仅属主)
- **响应体 (Response Data)**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "att-uuid-1",
    "uploaderId": "user-uuid-1",
    "messageId": "msg-uuid-1",
    "kind": "document",
    "filename": "readme.md",
    "mimeType": "text/markdown",
    "size": 2048,
    "extractedText": "# Markdown Title\n...",
    "createdAt": "2026-09-18T10:00:00.000Z"
  },
  "timestamp": 1726650000000
}
```

---

### 4.3 文件裸流下载 (Download File)
- **URL**: `GET /uploads/:id/download`
- **公开路由**: 否 (仅属主)
- **信封旁路**: 是（直接返回文件裸流）
- **响应头**: `Content-Type: <file-mime-type>`, `Content-Disposition: inline; filename="<filename>"`

---

## 5. SSE 事件流协议 (Server-Sent Events Wire Protocol)

`POST /ai/chat` 在成功通过前置检查（鉴权、参数校验、限流与并发流检查）后，立即返回 HTTP 200 与 `Content-Type: text/event-stream; charset=utf-8`。

### 5.1 事件序列规范
```
event: meta
data: {"conversationId":"c1f7a0c0-67a3-48ef-82b5-31f0cf8f20b3","messageId":"msg-assistant-1","modelId":"gpt-4o"}

event: delta
data: {"content":"你好"}

event: delta
data: {"content":"！我是 AI 助手。"}

event: usage
data: {"promptTokens":20,"completionTokens":10,"totalTokens":30}

event: done
data: {"messageId":"msg-assistant-1","finishReason":"stop"}

: ping
```

### 5.2 事件与 Payload 清单

| 事件 (Event) | 触发时机 | Payload 字段说明 |
| :--- | :--- | :--- |
| `meta` | **永远作为下行第一帧** | `conversationId` (会话ID), `messageId` (助理消息ID), `modelId` (模型标识) |
| `delta` | 上游生成文本片段时 (0..N 帧) | `content` (增量生成内容字符串) |
| `usage` | 上游返回 token 消耗统计时 (单帧，在 `done` 之前) | `promptTokens`, `completionTokens`, `totalTokens` |
| `done` | 生成完毕正常结束 | `messageId`, `finishReason` (`'stop'` \| `'length'` \| `'abort'`) |
| `error` | 流式传输期间发生错误 | `code` (业务错误码), `message` (错误描述) |
| `: ping` | 传输期间每 15 秒定时发送 | 注释行心跳，防止中间代理网关因空闲断开连接 |

### 5.3 双轨制错误处理 (Dual-Track Error Handling)
- **响应头发送前**：发生鉴权失败、参数非法、429 超频/并发超限或模型不存在，直接返回对应 HTTP 状态码与标准 JSON 错误信封。
- **响应头发送后**：发生上游连接断开、网络异常或 Provider 报错，发送 `event: error` SSE 事件并关闭连接，数据库助理消息状态置为 `error`（保留已生成内容）。客户端断连触发 AbortController 中止上游，消息状态置为 `partial`。

---

## 6. 业务错误码对照表 (Business Error Codes)

| 业务错误码 | HTTP 状态码 | 错误标识 | 描述与原因 |
| :--- | :--- | :--- | :--- |
| `0` | 200 / 201 | `SUCCESS` | 请求成功 |
| `40001` | 400 | `VALIDATION_FAILED` | 请求参数校验失败（字段缺失或格式不合法） |
| `40101` | 401 | `INVALID_CREDENTIALS` | 用户名/邮箱或密码错误 |
| `40102` | 401 | `USER_DISABLED` | 用户账号已被封禁或注销 |
| `40103` | 401 | `TOKEN_EXPIRED` | Access Token 已过期 |
| `40104` | 401 | `TOKEN_INVALID` | Token 签名非法或格式无效 |
| `40105` | 401 | `TOKEN_REVOKED` | Token 已被注销或列入黑名单（被主动登出或顶号踢下线） |
| `40106` | 401 | `TOKEN_REUSE_DETECTED`| 检测到已作废的 Refresh Token 重放，触发安全防护清除全量会话 |
| `40901` | 409 | `USER_ALREADY_EXISTS` | 用户名或邮箱已被注册占用 |
| `40401` | 404 | `CONVERSATION_NOT_FOUND` | 会话不存在或不属于当前用户 |
| `40402` | 404 | `ATTACHMENT_NOT_FOUND` | 附件不存在或不属于当前用户 |
| `40010` | 400 | `AI_MODEL_NOT_FOUND` | 指定的模型标识不在可用模型目录中 |
| `40011` | 400 | `UPLOAD_TYPE_NOT_ALLOWED` | 上传的文件类型不在允许的白名单内 |
| `40012` | 400 | `UPLOAD_TEXT_EXTRACT_FAILED` | 文档文本提取失败（如损坏的 PDF/无法解析的文件） |
| `41301` | 413 | `UPLOAD_TOO_LARGE` | 上传的文件超出单文件最大大小限制 |
| `42901` | 429 | `AI_RATE_LIMITED` | AI 提问请求频率超出限制（每分钟请求数超限） |
| `42902` | 429 | `AI_CONCURRENT_STREAM_LIMIT` | AI 并发流式问答连接数超出限制 |
| `50201` | 502 / SSE error | `AI_PROVIDER_ERROR` | 上游 AI 供应商服务不可用或返回错误 |
| `50001` | 500 | `INTERNAL_SERVER_ERROR`| 服务器内部未知异常 |
