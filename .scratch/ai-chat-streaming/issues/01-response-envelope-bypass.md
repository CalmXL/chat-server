# 01: Prefactor — 统一响应信封旁路机制

**What to build:** 路由处理器可以声明"本路由的响应不包装统一信封"（`{code, message, data}`，ADR-0003）。声明后，全局 TransformInterceptor 对该路由原样透传响应；未声明的路由行为完全不变。这是 SSE 流式响应（票据 05）与附件裸流下载（票据 04）的前置——两者都无法被 JSON 信封包装。

**Blocked by:** None (can start immediately)

**Status:** done

- [x] 提供路由级声明机制（装饰器 + 元数据），TransformInterceptor 识别并旁路
- [x] 未声明路由的包装行为不变，现有拦截器测试全部保持绿色
- [x] 单元测试覆盖：声明路由不包装、未声明路由照常包装
