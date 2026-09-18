# API Specification: 用户认证模块接口规范

本文档定义聊天服务端（Chat Server）登录认证模块的所有 HTTP REST API 契约、入参定义、返回值示例与业务错误码对照表。

---

## 1. 全局约定与协议头 (Global Headers & Format)

- **Content-Type**: `application/json`
- **鉴权 Header**: `Authorization: Bearer <AccessToken>`（针对受保护路由）
- **通用成功响应体**:
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

## 2. 接口定义 (Endpoints)

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

## 3. 业务错误码对照表 (Business Error Codes)

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
| `50001` | 500 | `INTERNAL_SERVER_ERROR`| 服务器内部未知异常 |
