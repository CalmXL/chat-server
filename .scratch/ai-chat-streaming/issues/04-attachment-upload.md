# 04: 附件上传与读取

**What to build:** 登录用户经 `POST /uploads`（multipart 多文件）上传附件：图片（jpg/png/webp/gif）登记为 `image`，文档（pdf/txt/md）登记为 `document` 并**同步提取纯文本**存入 `extractedText`，提取失败则整个文件被拒绝（40012），坏文件不入库不留盘。文件以 uuid 命名落入可配置目录（`UPLOAD_DIR`），单文件大小上限可配（`AI_MAX_UPLOAD_MB`，默认 10），超限 41301、类型不在白名单 40011。用户可 `GET /uploads/:id` 查元数据、`GET /uploads/:id/download` 裸流下载（正确 Content-Type，走票据 01 的信封旁路）；两者仅上传者本人可用，他人访问 40402。此票附件 `messageId` 为 NULL（绑定在票据 07 回填）。

**Blocked by:** 01（下载需要响应信封旁路）

**Status:** ready-for-agent

- [ ] 上传成功返回 `{attachmentIds[]}` 及各文件元数据；DB 与磁盘一致
- [ ] 白名单/大小/提取失败三类拒绝分别返回 40011/41301/40012，且无残留文件与脏记录
- [ ] 元数据与下载接口仅属主可用，跨用户 40402
- [ ] 下载为裸流且带正确 Content-Type，不包信封
- [ ] e2e：真实临时目录 + fixture（pdf/txt/md/图片）覆盖上传、提取、下载、越权
