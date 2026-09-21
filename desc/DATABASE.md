# 数据库相关代码梳理

本文档梳理 `chat-server` 中与数据库（PostgreSQL + TypeORM）相关的代码结构、职责与配置方式。

> 说明：会话（Session）、Token 黑名单等状态存在 **Redis**，不在本文档范围内。本文档只覆盖关系型数据库（PostgreSQL）部分。

---

## 1. 技术栈与总体设计

- **ORM**：TypeORM（`typeorm` + `@nestjs/typeorm`）
- **数据库**：PostgreSQL（驱动 `pg`）
- **接入方式**：`TypeOrmModule.forRootAsync` 异步初始化，配置来自 `@nestjs/config`
- **实体加载**：`autoLoadEntities: true`，通过 `TypeOrmModule.forFeature([...])` 按模块注册实体，无需手动维护实体列表
- **建表方式**：`synchronize` 自动同步表结构（开发用；生产应改为 migration，见第 8 节）

数据流向：

```
.env
  └─> ConfigModule（validateEnv + configuration）
        └─> ConfigService
              └─> DatabaseModule（TypeOrmModule.forRootAsync）
                    └─> TypeORM DataSource（PostgreSQL 连接池）
                          └─> Repository<User>
                                └─> UserService（业务数据访问层）
                                      └─> AuthService（注册 / 登录 / 刷新 / 个人信息）
```

---

## 2. 文件清单与作用

| 文件 | 作用 |
| :--- | :--- |
| `src/database/database.module.ts` | 数据库连接模块，创建 TypeORM 根连接 |
| `src/config/configuration.ts` | 读取环境变量，组装 `database.*` 配置对象 |
| `src/config/env.validation.ts` | 用 Zod 校验环境变量，缺失/非法时启动阶段 Fail-Fast |
| `src/app.module.ts` | 全局导入 `DatabaseModule`、`ConfigModule` |
| `src/modules/user/entities/user.entity.ts` | `users` 表的实体定义（字段、约束、索引） |
| `src/modules/user/user.service.ts` | 用户数据访问层（CRUD 查询） |
| `src/modules/user/user.module.ts` | 通过 `forFeature([User])` 注册实体并导出 `UserService` |
| `src/modules/auth/auth.service.ts` | 业务层，调用 `UserService` 完成注册/登录/刷新/查询 |
| `.env` | 数据库连接参数（本地环境，已被 `.gitignore` 忽略） |

---

## 3. 数据库配置

### 3.1 环境变量

在根目录 `.env` 中配置（默认值见括号）：

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `DATABASE_HOST` | `localhost` | 数据库主机 |
| `DATABASE_PORT` | `5432` | 端口 |
| `DATABASE_USERNAME` | `postgres` | 用户名 |
| `DATABASE_PASSWORD` | `postgres` | 密码 |
| `DATABASE_NAME` | `chat_server` | 数据库名 |
| `DATABASE_SYNCHRONIZE` | `true` | 是否自动同步表结构（非 `false` 即为开启） |

### 3.2 配置装配

`src/config/configuration.ts:4` 将环境变量映射为嵌套的 `database` 配置对象：

```ts
database: {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'chat_server',
  synchronize: process.env.DATABASE_SYNCHRONIZE !== 'false',
}
```

`src/config/env.validation.ts` 使用 Zod 对上述变量做类型/默认值校验；`DATABASE_SYNCHRONIZE` 会被预处理为布尔值。

### 3.3 连接模块

`src/database/database.module.ts:7`：

```ts
TypeOrmModule.forRootAsync({
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    host: configService.get<string>('database.host', 'localhost'),
    port: configService.get<number>('database.port', 5432),
    username: configService.get<string>('database.username', 'postgres'),
    password: configService.get<string>('database.password', 'postgres'),
    database: configService.get<string>('database.database', 'chat_server'),
    autoLoadEntities: true,
    synchronize: configService.get<boolean>('database.synchronize', true),
    logging: configService.get<string>('nodeEnv') === 'development',
  }),
  inject: [ConfigService],
})
```

要点：

- `type: 'postgres'`：使用 PostgreSQL 驱动
- `autoLoadEntities: true`：只加载通过 `forFeature` 注册的实体
- `synchronize`：开发环境自动建表/改表
- `logging`：仅在 `development` 环境打印 SQL，便于调试

---

## 4. 实体定义：`User`

`src/modules/user/entities/user.entity.ts`，对应表名 `users`。

| 字段 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `uuid` | 主键，自动生成 | 用户 ID |
| `username` | `varchar(32)` | 唯一、非空、索引 | 用户名 |
| `email` | `varchar(255)` | 唯一、非空、索引 | 邮箱 |
| `passwordHash` | `varchar(255)` | 非空 | 密码哈希（argon2，不存明文） |
| `nickname` | `varchar(64)` | 可空 | 昵称 |
| `avatar` | `varchar(512)` | 可空 | 头像 URL |
| `status` | `varchar(20)` | 默认 `active` | 用户状态，取值 `UserStatus`（`active`/`disabled`/`pending`） |
| `createdAt` | `timestamptz` | `@CreateDateColumn` | 创建时间 |
| `updatedAt` | `timestamptz` | `@UpdateDateColumn` | 更新时间 |

- `username`、`email` 同时使用 `@Index({ unique: true })` 和列级 `unique: true` 声明唯一约束
- `status` 使用枚举 `UserStatus`（`src/common/enums/index.ts`）

---

## 5. 数据访问层：`UserService`

`src/modules/user/user.service.ts`，通过 `@InjectRepository(User)` 注入 TypeORM `Repository`。

| 方法 | 作用 |
| :--- | :--- |
| `create(userData)` | 创建并保存用户，返回实体 |
| `findByUsername(username)` | 按用户名查询（注册查重、登录） |
| `findByEmail(email)` | 按邮箱查询（注册查重） |
| `findByIdentifier(identifier)` | 按用户名**或**邮箱查询（登录用） |
| `findById(id)` | 按主键查询（刷新令牌、获取个人信息） |
| `isUsernameOrEmailTaken(username, email)` | 判断用户名或邮箱是否已被占用 |

模块注册（`src/modules/user/user.module.ts`）：

```ts
imports: [TypeOrmModule.forFeature([User])],
providers: [UserService],
exports: [UserService, TypeOrmModule],
```

---

## 6. 与业务层的集成

`AuthService`（`src/modules/auth/auth.service.ts`）是数据库的主要消费方：

- **注册**：`findByUsername` / `findByEmail` 查重 → `PasswordService.hashPassword` 生成哈希 → `UserService.create` 落库 → `sanitizeUser` 过滤敏感字段后返回
- **登录**：`findByIdentifier` 取用户 → 校验 `status` 与密码 → 生成 Token（Redis 存会话）→ 返回用户信息
- **刷新令牌**：`findById` 校验用户是否仍存在/可用
- **获取个人信息**：`findById` 查询并返回
- `sanitizeUser`（`auth.service.ts:305`）只输出 `id/username/email/nickname/avatar/status/createdAt`，**不暴露 `passwordHash`**

`AuthModule` 通过 `imports: [UserModule]` 拿到 `UserService`。

---

## 7. 启动与建库

1. 确认 PostgreSQL 可用（本地示例：Docker 容器 `my-postgres`，映射 `5432`）
2. 创建数据库：

   ```bash
   docker exec my-postgres psql -U postgres -c "CREATE DATABASE chat_server;"
   ```

3. 启动应用，`synchronize: true` 会自动创建 `users` 表：

   ```bash
   bun run start:dev
   ```

4. 若连接参数不同，修改 `.env` 中的 `DATABASE_*` 变量

---

## 8. 注意事项

- **`synchronize` 仅用于开发**：它会根据实体自动改表，生产环境有数据丢失风险。上线前应设为 `false`，并改用 TypeORM migration 管理表结构变更（当前仓库尚无 migration 目录）。
- **密码安全**：数据库只存 `passwordHash`，使用 argon2 哈希，任何接口都不应返回该字段。
- **唯一约束**：用户名/邮箱唯一性由数据库唯一索引保证，业务层在插入前也会先查重（`AuthService.register`）。
- **连接池**：由 TypeORM / `pg` 管理，未额外配置池大小；如需调优可扩展 `DatabaseModule` 的 options。
- **测试**：e2e 测试（`test/auth.e2e-spec.ts:174`）通过 `getRepositoryToken(User)` 覆盖 `Repository`，不依赖真实数据库。

---

## 9. 如何新增一张表 / 一个实体

1. 在对应模块的 `entities/` 下新建 `xxx.entity.ts`，用 `@Entity()` 声明
2. 在模块中 `TypeOrmModule.forFeature([Xxx])`
3. 在 Service 中 `@InjectRepository(Xxx)` 注入并使用
4. 开发环境启动后 `synchronize` 会自动建表；生产环境需编写 migration
