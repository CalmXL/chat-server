# 06: 上下文组装与隐式建会话

**What to build:** 流式问答获得"记忆"：发起请求时服务端按会话组装最近 `AI_HISTORY_WINDOW`（默认 20，可配）条消息发给模型（user/assistant 原样，含 `partial` 半截回答；可选 system prompt 由配置注入首位）。用户可以不传 `conversationId` 直接提问——服务端隐式创建会话（标题取 content 前 20 字），`meta` 首帧回传新会话标识；每次新消息都会刷新会话的 `lastMessageAt`（列表排序随之正确）。

**Blocked by:** 05（流式问答主干）

**Status:** done

- [x] 组装请求体包含窗口内历史且按时间升序；窗口外历史不出现（e2e 断言发给 Provider 的请求体）
- [x] 窗口条数与 system prompt 均 env 可配
- [x] 不传 `conversationId` 隐式建会话，标题为 content 前 20 字，`meta` 帧携带新 id
- [x] 新消息刷新 `lastMessageAt`，会话列表排序正确
- [x] 单元测试覆盖组装规则；e2e 覆盖多轮连续性与隐式创建
