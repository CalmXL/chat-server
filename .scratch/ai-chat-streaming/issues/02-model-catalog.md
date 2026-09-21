# 02: 模型目录与供应商配置

**What to build:** 运维通过 `AI_PROVIDERS_JSON` 环境变量配置 OpenAI 兼容供应商列表（`baseURL + apiKey + models`），缺失或格式非法时应用启动即失败并给出清晰错误（沿用 ADR-0003 fail-fast 约定）。登录用户调用 `GET /ai/models` 获得可切换模型目录 `{id, label, provider}[]`，响应中绝不包含 apiKey。后续票据据此校验 `modelId` 合法性。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `AI_PROVIDERS_JSON` 经 Zod 校验，缺失/非法时启动 fail-fast 且报错可读
- [ ] `GET /ai/models`（JWT 保护）返回全部供应商的模型目录，字段仅 `{id, label, provider}`
- [ ] 任何接口响应与日志中不出现 apiKey
- [ ] e2e：登录用户拿到目录；未登录 401
