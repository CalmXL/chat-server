# 04: 附件上传与读取

**What to build:** 登录用户经 `POST /uploads`（multipart 多文件）上传附件：图片（jpg/png/webp/gif）登记为 `image`，文档（pdf/txt/md）登记为 `document` 并**同步提取纯文本**存入 `extractedText`，提取失败则整个文件被拒绝（40012），坏文件不入库不留盘。文件以 uuid 命名落入可配置目录（`UPLOAD_DIR`），单文件大小上限可配（`AI_MAX_UPLOAD_MB`，默认 10），超限 41301、类型不在白名单 40011。用户可 `GET /uploads/:id` 读取元数据、`GET /uploads/:id/download` 下载文件本体（裸流，不包信封）。他人附件一律 404（`ATTACHMENT_NOT_FOUND`）。

**Blocked by:** 01（下载需要响应信封旁路）

**Status:** done

- [x] 上传成功返回 `{attachmentIds[]}` 及各文件元数据；DB 与磁盘一致
- [x] 白名单/大小/提取失败三类拒绝分别返回 40011/41301/40012，且无残留文件与脏记录
- [x] 元数据与下载接口仅属主可用，跨用户 40402
- [x] 下载为裸流且带正确 Content-Type，不包信封
- [x] e2e：真实临时目录 + fixture（pdf/txt/md/图片）覆盖上传、提取、下载、越权
