import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import configuration from '../src/config/configuration.js';
import { validateEnv } from '../src/config/env.validation.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { UserService } from '../src/modules/user/user.service.js';
import { PasswordService } from '../src/modules/auth/password.service.js';
import { TokenService } from '../src/modules/auth/token.service.js';
import { SessionService } from '../src/modules/auth/session.service.js';
import { RedisService, SessionData } from '../src/redis/redis.service.js';
import { User } from '../src/modules/user/entities/user.entity.js';
import { DeviceType, UserStatus } from '../src/common/enums/index.js';
import { ErrorCode } from '../src/common/constants/error-codes.js';

class InMemoryUserRepository {
  private users: User[] = [];

  create(userData: Partial<User>): User {
    const user = new User();
    Object.assign(user, {
      id: crypto.randomUUID(),
      nickname: null,
      avatar: null,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...userData,
    });
    return user;
  }

  async save(user: User): Promise<User> {
    const existingIndex = this.users.findIndex((u) => u.id === user.id);
    if (existingIndex >= 0) {
      this.users[existingIndex] = user;
    } else {
      this.users.push(user);
    }
    return user;
  }

  async findOne(options: {
    where:
      | Record<string, unknown>
      | Array<Record<string, unknown>>;
  }): Promise<User | null> {
    if (Array.isArray(options.where)) {
      for (const cond of options.where) {
        const found = this.matchUser(cond);
        if (found) return found;
      }
      return null;
    }
    return this.matchUser(options.where);
  }

  private matchUser(cond: Record<string, unknown>): User | null {
    const found = this.users.find((u) => {
      for (const [k, v] of Object.entries(cond)) {
        if ((u as unknown as Record<string, unknown>)[k] !== v) {
          return false;
        }
      }
      return true;
    });
    return found ? { ...found } : null;
  }

  clear() {
    this.users = [];
  }
}

class InMemoryRedisService {
  private store = new Map<string, string>();
  private blacklists = new Set<string>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.store.has(key) ? 1 : 0;
  }

  async getSession(
    userId: string,
    deviceType: string,
  ): Promise<SessionData | null> {
    const key = `auth:session:${userId}:${deviceType}`;
    const data = this.store.get(key);
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  async setSession(
    userId: string,
    deviceType: string,
    session: SessionData,
  ): Promise<void> {
    const key = `auth:session:${userId}:${deviceType}`;
    this.store.set(key, JSON.stringify(session));
  }

  async delSession(userId: string, deviceType: string): Promise<number> {
    const key = `auth:session:${userId}:${deviceType}`;
    const existed = this.store.delete(key);
    return existed ? 1 : 0;
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    return this.blacklists.has(jti);
  }

  async blacklistToken(jti: string): Promise<void> {
    this.blacklists.add(jti);
  }

  clear() {
    this.store.clear();
    this.blacklists.clear();
  }
}

describe('Authentication & Session Management E2E', () => {
  let app: INestApplication;
  let inMemoryUserRepo: InMemoryUserRepository;
  let inMemoryRedisService: InMemoryRedisService;

  beforeEach(async () => {
    inMemoryUserRepo = new InMemoryUserRepository();
    inMemoryRedisService = new InMemoryRedisService();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          validate: validateEnv,
        }),
        JwtModule.register({
          secret: 'chat-server-jwt-access-secret-key-min-32-chars-long!',
          signOptions: { expiresIn: '15m' },
        }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        UserService,
        PasswordService,
        TokenService,
        SessionService,
        {
          provide: getRepositoryToken(User),
          useValue: inMemoryUserRepo,
        },
        {
          provide: RedisService,
          useValue: inMemoryRedisService,
        },
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('1. User Registration (POST /api/v1/auth/register)', () => {
    it('should register a new user successfully and return uniform response envelope', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'alice_dev',
          email: 'alice@example.com',
          password: 'Password123',
          nickname: 'Alice',
          avatar: 'https://example.com/avatar.png',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        code: 0,
        message: 'success',
        data: {
          username: 'alice_dev',
          email: 'alice@example.com',
          nickname: 'Alice',
          avatar: 'https://example.com/avatar.png',
          status: 'active',
        },
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(typeof res.body.timestamp).toBe('number');
    });

    it('should reject registration when validation fails (short password or invalid email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'al',
          email: 'invalid-email',
          password: '123',
        })
        .expect(400);

      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('should reject duplicate username or email with USER_ALREADY_EXISTS (409)', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'alice_dev',
          email: 'alice@example.com',
          password: 'Password123',
        })
        .expect(201);

      // Duplicate username
      const res1 = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'alice_dev',
          email: 'alice_diff@example.com',
          password: 'Password123',
        })
        .expect(409);

      expect(res1.body.code).toBe(ErrorCode.USER_ALREADY_EXISTS);

      // Duplicate email
      const res2 = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'alice_diff',
          email: 'alice@example.com',
          password: 'Password123',
        })
        .expect(409);

      expect(res2.body.code).toBe(ErrorCode.USER_ALREADY_EXISTS);
    });
  });

  describe('2. User Login (POST /api/v1/auth/login)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'bob_dev',
          email: 'bob@example.com',
          password: 'Password123',
        })
        .expect(201);
    });

    it('should login successfully using username and issue dual tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'bob_dev',
          password: 'Password123',
          deviceType: 'web',
          deviceId: 'browser-uuid-1',
        })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.expiresIn).toBe(900);
      expect(res.body.data.user.username).toBe('bob_dev');
    });

    it('should login successfully using email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'bob@example.com',
          password: 'Password123',
          deviceType: 'desktop',
          deviceId: 'desktop-uuid-1',
        })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.user.email).toBe('bob@example.com');
    });

    it('should reject login with wrong password (401 INVALID_CREDENTIALS)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'bob_dev',
          password: 'WrongPassword!',
          deviceType: 'web',
          deviceId: 'browser-uuid-1',
        })
        .expect(401);

      expect(res.body.code).toBe(ErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('3. Protected Profile (GET /api/v1/auth/me)', () => {
    let accessToken: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'charlie',
          email: 'charlie@example.com',
          password: 'Password123',
          nickname: 'Charlie Chaplin',
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'charlie',
          password: 'Password123',
          deviceType: 'web',
          deviceId: 'charlie-web-1',
        })
        .expect(200);

      accessToken = loginRes.body.data.accessToken;
    });

    it('should return profile with valid Bearer token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toMatchObject({
        username: 'charlie',
        email: 'charlie@example.com',
        nickname: 'Charlie Chaplin',
        deviceType: 'web',
        deviceId: 'charlie-web-1',
      });
    });

    it('should reject request without Authorization header', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body.code).toBe(ErrorCode.TOKEN_INVALID);
    });

    it('should reject request with tampered token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.token.value')
        .expect(401);

      expect(res.body.code).toBe(ErrorCode.TOKEN_INVALID);
    });
  });

  describe('4. Token Rotation & Replay Attack Defense', () => {
    let refreshToken: string;

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          username: 'david_dev',
          email: 'david@example.com',
          password: 'Password123',
        })
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'david_dev',
          password: 'Password123',
          deviceType: 'mobile',
          deviceId: 'david-iphone',
        })
        .expect(200);

      refreshToken = loginRes.body.data.refreshToken;
    });

    it('should rotate tokens and return a brand new token pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.refreshToken).not.toBe(refreshToken);

      // New access token works
      const profileRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.data.accessToken}`)
        .expect(200);

      expect(profileRes.body.data.username).toBe('david_dev');
    });

    it('should detect replay attack when old rotated refresh token is used, and wipe session', async () => {
      // First rotation: valid
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const newRefreshToken = refreshRes.body.data.refreshToken;

      // Attacker tries to replay the old `refreshToken`
      const replayRes = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(replayRes.body.code).toBe(ErrorCode.TOKEN_REUSE_DETECTED);

      // Verify that the active session has been completely purged:
      // Even the newly generated refresh token will now fail!
      const subsequentRefresh = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: newRefreshToken })
        .expect(401);

      expect(subsequentRefresh.body.code).toBe(ErrorCode.TOKEN_INVALID);
    });
  });

  describe('5. Multi-Device Kickout & Logout', () => {
    const userCredentials = {
      username: 'eve_dev',
      email: 'eve@example.com',
      password: 'Password123',
    };

    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(userCredentials)
        .expect(201);
    });

    it('should kick out old device on same deviceType, while allowing new device', async () => {
      // 1. Login on Web from Device A
      const loginA = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'eve_dev',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'chrome-laptop',
        })
        .expect(200);

      const tokenA = loginA.body.data.accessToken;

      // 2. Device A can access profile
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // 3. Login on Web from Device B (same deviceType: Web)
      const loginB = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'eve_dev',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'firefox-desktop',
        })
        .expect(200);

      const tokenB = loginB.body.data.accessToken;

      // 4. Device A is kicked out: tokenA is blacklisted
      const resAAfterKick = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(401);

      expect(resAAfterKick.body.code).toBe(ErrorCode.TOKEN_REVOKED);

      // 5. Device B is active
      const resB = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(resB.body.data.deviceId).toBe('firefox-desktop');
    });

    it('should allow different deviceTypes (Web & Mobile) to coexist independently', async () => {
      // 1. Login on Web
      const loginWeb = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'eve_dev',
          password: 'Password123',
          deviceType: DeviceType.WEB,
          deviceId: 'web-browser',
        })
        .expect(200);

      // 2. Login on Mobile
      const loginMobile = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'eve_dev',
          password: 'Password123',
          deviceType: DeviceType.MOBILE,
          deviceId: 'mobile-app',
        })
        .expect(200);

      // Both should succeed
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginWeb.body.data.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${loginMobile.body.data.accessToken}`)
        .expect(200);
    });

    it('should logout and blacklist accessToken immediately', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: 'eve_dev',
          password: 'Password123',
          deviceType: DeviceType.DESKTOP,
          deviceId: 'desktop-client',
        })
        .expect(200);

      const token = loginRes.body.data.accessToken;

      // Access before logout
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(logoutRes.body.data.loggedOut).toBe(true);

      // Access after logout is blocked with TOKEN_REVOKED
      const postLogoutRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(postLogoutRes.body.code).toBe(ErrorCode.TOKEN_REVOKED);
    });
  });
});
