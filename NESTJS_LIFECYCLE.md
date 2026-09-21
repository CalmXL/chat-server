# NestJS 生命周期梳理（结合本项目）

本文档分两部分讲解 NestJS 的生命周期，并用 `chat-server` 的真实代码举例：

1. **应用生命周期**：进程从启动、模块初始化到关闭
2. **请求生命周期**：一个 HTTP 请求从进入到返回所经过的处理链

---

## 一、应用生命周期

### 1.1 启动入口：`main.ts`

`src/main.ts` 是整个应用的引导（bootstrap）入口：

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);   // ① 创建应用 + 初始化 IOC 容器

  app.useGlobalPipes(new ValidationPipe({             // ② 全局管道
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  app.useGlobalInterceptors(new TransformInterceptor()); // ③ 全局拦截器
  app.useGlobalFilters(new AllExceptionsFilter());       // ④ 全局异常过滤器

  // ⑤ Swagger 文档
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, { jsonDocumentUrl: 'api-docs-json' });

  const port = configService.get<number>('port', 3000);
  await app.listen(port);                             // ⑥ 启动 HTTP 服务
}
await bootstrap();
```

启动顺序（简化）：

```
NestFactory.create(AppModule)
  ├─ 加载 ConfigModule（.env + Zod 校验，Fail-Fast）
  ├─ 解析模块依赖图（DatabaseModule / RedisModule / UserModule / AuthModule）
  ├─ 实例化所有 Provider（Service / Repository / 全局守卫）
  └─ 调用各 Provider 的初始化钩子
       ↓
注册全局 Pipes / Interceptors / Filters / Swagger
       ↓
app.listen(port) → 开始接收请求
       ↓
（收到 SIGTERM 等）→ 调用销毁钩子 → 关闭连接
```

### 1.2 模块依赖图

`src/app.module.ts` 是根模块：

```
AppModule
├─ ConfigModule.forRoot({ isGlobal: true, load, validate })  // 全局配置
├─ DatabaseModule   → TypeOrmModule.forRootAsync（PostgreSQL 连接）
├─ RedisModule      → @Global，提供 REDIS_CLIENT / RedisService
├─ UserModule       → TypeOrmModule.forFeature([User]) + UserService
└─ AuthModule       → JwtModule + AuthService / TokenService / SessionService ...
```

- `isGlobal: true` 的 `ConfigModule`、`@Global()` 的 `RedisModule` 无需在各模块重复 import，即可全局注入
- `DatabaseModule` 的 `TypeOrmModule.forRootAsync` 在启动阶段异步建立数据库连接（这就是之前「Unable to connect to the database. Retrying…」报错的来源）

### 1.3 生命周期钩子

Nest 提供按顺序触发的钩子：

```
onModuleInit()  →  onApplicationBootstrap()  →  （运行中）
       ↓
onModuleDestroy()  →  beforeApplicationShutdown()  →  onApplicationShutdown()
```

本项目示例：`RedisService` 实现 `OnModuleDestroy`（`src/redis/redis.service.ts:24`），在应用关闭时优雅退出 Redis 连接：

```ts
export class RedisService implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    try {
      await this.redisClient.quit();
    } catch {
      this.redisClient.disconnect();
    }
  }
}
```

> 注意：本项目未显式开启 shutdown hooks（`app.enableShutdownHooks()`），因此 `onModuleDestroy` 主要在模块被销毁或测试环境 teardown 时触发。

---

## 二、请求生命周期

### 2.1 处理顺序

一个 HTTP 请求依次经过：

```
请求
 │
 ├─ 1. Middleware（中间件）        —— 本项目未自定义
 │
 ├─ 2. Guards（守卫）              —— JwtAuthGuard（全局，APP_GUARD）
 │        └─ 未通过：抛异常，直接跳到第 8 步
 │
 ├─ 3. Interceptors（拦截器·前置）  —— TransformInterceptor.intercept()
 │
 ├─ 4. Pipes（管道）               —— 全局 ValidationPipe 校验/转换 DTO
 │
 ├─ 5. Controller / Route Handler  —— AuthController.register() 等
 │
 ├─ 6. Service（业务逻辑）          —— AuthService / UserService ...
 │
 ├─ 7. Interceptors（拦截器·后置）  —— TransformInterceptor 的 map() 包装响应
 │
 └─ 8. Exception Filters（异常过滤器）—— AllExceptionsFilter（仅在出错时）
 │
响应
```

> 记忆口诀：**中间件 → 守卫 → 拦截器(前) → 管道 → 控制器 → 服务 → 拦截器(后) → 异常过滤器**。

### 2.2 各阶段在本项目的落点

| 阶段 | 本项目实现 | 说明 |
| :--- | :--- | :--- |
| Middleware | 无 | 默认由 `@nestjs/platform-express` 处理 |
| Guards | `src/common/guards/jwt-auth.guard.ts` | 全局注册，验签 + 查黑名单 |
| Interceptors | `src/common/interceptors/transform.interceptor.ts` | 统一响应包裹 |
| Pipes | `main.ts` 中的 `ValidationPipe` | DTO 校验与类型转换 |
| Controller | `src/modules/auth/auth.controller.ts` | 路由与参数绑定 |
| Service | `src/modules/auth/auth.service.ts` 等 | 业务逻辑 |
| Exception Filters | `src/common/filters/all-exceptions.filter.ts` | 统一错误响应 |

---

## 三、完整请求示例

### 3.1 成功：`GET /api/v1/auth/me`

1. **Guard**：`JwtAuthGuard.canActivate`（`jwt-auth.guard.ts:29`）
   - 读取 `@Public()` 元数据 → 非公开路由
   - 取 `Authorization: Bearer <accessToken>` → `verifyAccessToken` 验签
   - 查 Redis 黑名单 → 未命中
   - 将 payload 写入 `request.user`
2. **Interceptor（前置）**：`TransformInterceptor.intercept` 返回 `next.handle().pipe(map(...))`，先不处理数据
3. **Pipe**：`ValidationPipe` 校验参数（本接口无 body，直接通过）
4. **Controller**：`AuthController.getProfile`（`auth.controller.ts:78`）
   - `@CurrentUser() user` 从 `request.user` 取出 payload
   - 调用 `authService.getProfile(user.sub, user.deviceType, user.deviceId)`
5. **Service**：`AuthService.getProfile`（`auth.service.ts:276`）
   - `userService.findById` 查库、校验状态
   - `sanitizeUser` 过滤敏感字段后返回
6. **Interceptor（后置）**：`map` 把返回值包成统一结构：
   ```json
   { "code": 0, "message": "success", "data": { ... }, "timestamp": 1726650000000 }
   ```
7. 返回 200

### 3.2 失败：`POST /api/v1/auth/login` 密码错误

1. **Guard**：登录是 `@Public()` → 直接放行
2. **Pipe**：`ValidationPipe` 校验 `LoginDto`；缺字段/格式错 → 抛 `BadRequestException`
3. **Controller → Service**：`AuthService.login` 校验密码失败，抛 `BusinessException(40101)`（`auth.service.ts:99`）
4. 异常中断后续流程，跳到 **Exception Filter**
5. **Filter**：`AllExceptionsFilter.catch`（`all-exceptions.filter.ts:21`）
   - 识别为 `BusinessException` → 取 `code`/`message`/`status`
   - 输出：
   ```json
   { "code": 40101, "message": "用户名/邮箱或密码错误", "error": "Unauthorized", "timestamp": ... }
   ```

> 注意：异常发生在 Service 时，后置拦截器的 `map` 不会执行，响应由 Filter 接管。

---

## 四、全局组件的两种注册方式（重要区别）

本项目同时用了两种方式，区别在于**是否参与依赖注入**：

| 组件 | 注册方式 | 位置 | 能否注入依赖 |
| :--- | :--- | :--- | :--- |
| `JwtAuthGuard` | `APP_GUARD` provider | `app.module.ts:29` | ✅ 可注入 `TokenService` / `SessionService` / `Reflector` |
| `ValidationPipe` | `useGlobalPipes` | `main.ts` | ❌ 手动 `new`，无 DI |
| `TransformInterceptor` | `useGlobalInterceptors` | `main.ts` | ❌ 手动 `new` |
| `AllExceptionsFilter` | `useGlobalFilters` | `main.ts` | ❌ 手动 `new` |

原因：`JwtAuthGuard` 需要注入 `TokenService`、`SessionService`、`Reflector`，所以必须用 `APP_GUARD` 交给 Nest 容器实例化；而其余三个当前没有依赖，直接 `new` 即可。

> 若后续 `TransformInterceptor` 需要注入 `ConfigService` 等，应改为 `APP_INTERCEPTOR` 方式注册。

---

## 五、执行上下文（ExecutionContext）

守卫/拦截器可作用于不同传输层，通过 `context.getType()` / `switchToHttp()` / `switchToWs()` 区分：

- `JwtAuthGuard` 使用 `context.switchToHttp().getRequest()`（HTTP）
- `WsAuthGuard` 使用 `context.switchToWs().getClient()`（WebSocket，`ws-auth.guard.ts:28`）

`Reflector` 用于读取装饰器元数据，例如 `JwtAuthGuard` 通过 `getAllAndOverride(IS_PUBLIC_KEY, [handler, class])` 判断是否为公开路由。

---

## 六、时序总览（ASCII）

```
                    ┌──────────── 应用启动 ────────────┐
ConfigModule(校验) → 模块依赖解析 → Provider 实例化 → onModuleInit → listen
                                                              │
                                                              ▼
 请求 ──> Middleware ──> Guard ──> Interceptor(前) ──> Pipe ──> Controller
                          │(拒绝)                                  │
                          │                                        ▼
                          │                                     Service
                          │                                        │
                          │                          ┌─────────────┴─────────────┐
                          │                          ▼                           ▼
                          │                   Interceptor(后)              Exception Filter
                          │                          │                           │
                          └──────────────────────────┴──────────> 响应 <─────────┘
                                                              │
                    ┌──────────── 应用关闭 ────────────┐       │
                    onModuleDestroy → 关闭 DB/Redis 连接 ──────┘
```

---

## 七、常见调试切入点

| 现象 | 可能阶段 | 排查位置 |
| :--- | :--- | :--- |
| 启动即退出，报配置校验错误 | ConfigModule | `src/config/env.validation.ts` |
| 启动卡在重试连接数据库 | DatabaseModule | `src/database/database.module.ts` |
| 接口 401 但 token 看起来正常 | Guard | `jwt-auth.guard.ts`（验签/黑名单） |
| 参数校验报错 400 | Pipe | DTO + `ValidationPipe` 配置 |
| 响应多了/少了 `data` 包裹 | Interceptor | `transform.interceptor.ts` |
| 错误响应结构不对 | Filter | `all-exceptions.filter.ts` |
| 关闭时连接未释放 | 销毁钩子 | `redis.service.ts` 的 `onModuleDestroy` |
