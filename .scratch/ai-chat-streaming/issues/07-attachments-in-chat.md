# 07: 附件接入问答（看图 + 读文档）

**What to build:** 提问可携带 `attachmentIds[]`（`{conversationId?, modelId, content, attachmentIds?}`）：当前轮图片以 base64 data URL 内联进模型请求（vision 标准做法），文档的 `extractedText` 完整注入当前轮；附件记录回填绑定到本次 user 消息。历史轮次重放时：图片降级为占位文本 `[图片: 文件名]`，文档文本截断为前 `AI_DOC_TRUNCATE_CHARS`（默认 2000，可配）字符 + `...[截断]`。消息历史接口返回每条消息的附件元数据列表。

**Blocked by:** 04（附件上传）、06（上下文组装与消息绑定时机）

**Status:** done

- [x] e2e 断言发给 Provider 的请求体：当前轮图片为 image_url 块、文档文本完整；历史轮图片为占位文本、文档被截断
- [x] 附件提问后 `messageId` 回填，历史接口返回附件元数据
- [x] 他人附件/已绑定附件传入返回 40402，且不落 user 消息
- [x] 截断长度 env 可配；`partial` 消息参与上下文时同样遵守降级规则
