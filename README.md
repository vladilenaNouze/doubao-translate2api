# doubao-translate2api

把豆包网页的文本翻译入口转换为 OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages API。项目依据开发规格书独立实现，使用 MIT 许可证。

这是非官方项目，只提供文本翻译。豆包私有接口和登录 Cookie 可能失效，使用者应自行确认服务条款与使用场景。

## Docker 启动

### 从 Docker Hub 拉取

镜像地址为 `muzileee/doubao-translate2api`，提供 `linux/amd64` 和 `linux/arm64`。首次镜像发布成功后使用本节；仓库建立但尚未上传镜像时不能拉取。

服务器只需要 `docker-compose.hub.yml`、`.env.example` 和数据目录，不需要本地构建。将部署文件命名为 `compose.yaml`：

```sh
cp docker-compose.hub.yml compose.yaml
cp .env.example .env
mkdir -p data/admin
sudo chown 1000:1000 data/admin
chmod 700 data/admin
```

在 `.env` 设置自己的 `API_KEY`。默认运行用户为 `1000:1000`；自定义 `APP_UID` / `APP_GID` 时，管理目录与可选 Cookie 文件的所有者也须匹配该非 root 用户，父目录须可遍历。预构建镜像不需要重新构建。

```sh
docker compose -f compose.yaml pull
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
curl -fsS http://127.0.0.1:8390/health
```

服务默认仅在服务器本机开放。可用 SSH 隧道 `ssh -L 8390:127.0.0.1:8390 用户@服务器`，然后在本机访问 `http://127.0.0.1:8390/admin`。首次密码保存在服务器 `data/admin/initial-password.txt`；可执行 `sudo cat data/admin/initial-password.txt` 查看，然后登录导入 Cookie。公网部署使用 TLS 反向代理，相关设置见管理页一节。

升级时在 `.env` 设置 `IMAGE_TAG=新版本号`，然后再次执行 `pull` 和 `up -d`。默认版本固定为 `0.1.0`；也提供 `latest` 标签。保留整个 `data` 目录，升级前备份；回退时指定旧版本并确认数据格式兼容。

### 从源码构建

需要 Docker Compose：

```sh
cp .env.example .env
mkdir -p data/admin
```

在 `.env` 设置自己的 `API_KEY`。Cookie 可以启动后在管理页导入，也可以把已登录豆包的 Cookie header 写入 `data/cookie.txt`，使用一行 `name=value; name=value` 格式，至少包含非空的 `sessionid`、`sid_tt`、`uid_tt`；建议保留完整 Cookie。文件末尾换行允许，内部换行及非 ASCII 字符会被拒绝。

```sh
# 使用本地 Cookie 文件时执行：
# chmod 600 data/cookie.txt
docker compose up -d --build
```

默认仅监听宿主机 `127.0.0.1:8390`。对外提供服务时使用 TLS 反向代理；需要局域网访问时，在 `.env` 明确设置 `BIND_ADDRESS`。不要将 `data` 目录公开为静态文件。

容器默认 UID/GID 为 `1000:1000`。Linux 上 `600` 文件必须由容器 UID 所有，管理数据目录也须由该用户可写：普通用户可用 `id -u` / `id -g` 查看自己的 UID/GID，并写入 `.env` 的 `APP_UID` / `APP_GID`，然后重新构建。不要使用 UID 0。也可将 Cookie 文件与管理目录的所有者改为容器的非 root UID，保持父目录可被该用户遍历。Docker Desktop 的文件共享行为应在实际宿主机验证。

`data` 仍只读挂载在 `/data`，`data/admin` 单独可写挂载在 `/admin-data`。管理页导入的 Cookie 与账号状态写入后者；原来的 `data/cookie.txt` 不会被覆盖。使用本地文件时，每次上游调用前重新读取；编辑或原子替换不需要重启或重建容器。所有 Cookie 都缺失或不可用时，翻译会返回明确错误。

### 发布镜像

GitHub 仓库 Actions Secrets 需要 `DOCKERHUB_USERNAME`（`muzileee`）和 `DOCKERHUB_TOKEN`（Docker Hub Read & Write Token）。凭据不得写入文件或镜像。

推送与 `package.json` 版本一致的稳定版标签触发发布，例如：

```sh
git tag v0.1.0
git push origin v0.1.0
```

发布流程先完成类型检查、100 项测试、浏览器测试和 Docker smoke（包含非 root、Cookie 热更新、管理数据挂载和重启密码持久化），全部通过后构建双架构镜像并上传 `0.1.0` 与 `latest`。在 GitHub Actions 查看 `Publish Docker image` 的结果；仅在 `publish` 成功后部署该版本。发布前须先提交并推送对应实现代码，不要复用已发布版本标签。

## 管理页

访问 `http://127.0.0.1:8390/admin`；本地 npm 启动则为 `http://127.0.0.1:8000/admin`。

首次启动自动生成一个独立管理密码，保存为宿主机 `data/admin/initial-password.txt`，权限为 `600`。密码不会出现在服务日志或公开接口中。Docker 中也可以读取：

```sh
docker compose exec doubao-translate2api node -e \
  "console.log(require('fs').readFileSync('/admin-data/initial-password.txt','utf8').trim())"
```

管理密码与客户端 `API_KEY` 分开使用。登录后可导入多份 Cookie、重命名、更新、启停、删除及检测登录状态；支持 Cookie Header 文本和 Cookie-Editor 等工具导出的 JSON 数组，也支持 `.txt` / `.json` 文件。JSON 中的其它域名会被过滤。已保存的 Cookie 值不会返回管理页面，更新时输入新值即可。

Cookie 调度支持：

| 方式 | 行为 |
| --- | --- |
| 故障切换（默认） | 优先使用当前账号；登录失效、限流、上游网络或临时 HTTP 错误时尝试下一份 Cookie |
| 轮询 | 每个新翻译请求分配下一份可用 Cookie，同一个请求的多批翻译沿用该账号；发生故障时仍可切换 |
| 固定账号 | 只使用指定账号，不自动切换 |

登录失效的 Cookie 会避开，更新 Cookie 或成功检测后重新可用；网络错误与限流进入 60 秒冷却。已知参数错误不会触发账号切换。同一请求最多遍历池内账号一次，避免在失效账号之间无限循环。账号停用后不参与调度；无可用账号时返回 502 `no_available_cookie`。本地 Cookie 文件内容发生变化会清除其旧故障状态。`/auth/status` 检测当前首选账号，不消耗轮询分配次数。

安全设置可修改管理密码，也可随机生成新密码；保存后全部管理会话失效，需要重新登录，首次密码文件会删除。会话最长 8 小时，服务重启后需要重新登录。连续失败登录受到限制；管理写入要求同源与 CSRF 验证。列表仅返回名称与状态。

账号及密码哈希存储在管理目录的私有 JSON 文件中，不使用数据库。备份时应保护整个管理目录，其中包含 Cookie。`ADMIN_PASSWORD` 仅用于第一次初始化；已有管理密码不会被环境变量自动覆盖。`ADMIN_ENABLED=false` 可关闭管理页和账号池，恢复单文件 Cookie 模式。

公网 TLS 反代部署时配置 `ADMIN_COOKIE_SECURE=true`、`ADMIN_ORIGIN=https://你的域名`，并使用 `TRUST_PROXY` 指定实际可信反代 IP 或网段，让服务正确识别 HTTPS。不要将可信代理设置为全部来源。

## 本地开发

需要 Node.js 24：

```sh
npm ci
npm run typecheck
npm test
npm run build
API_KEY=your-local-key DOUBAO_COOKIE_FILE=./data/cookie.txt npm run dev
```

本地默认端口为 8000。`npm run dev` 不自动加载 `.env`；也可先构建后使用 `node --env-file=.env dist/server.js`，在 `.env` 将 Cookie 路径改为本地路径。

## 模型与接口

| 模型 ID | 上游 translate_service | 标签 |
| --- | --- | --- |
| `doubao-ai` | `"1"` | 豆包 AI |
| `volcengine-translate` | `"0"` | 火山引擎机器翻译 |
| `microsoft-translator` | `"3"` | 微软翻译 |

三个模型都是代理定义的路由 ID，都使用同一个豆包网页端点和 Cookie，不直接访问各厂商公开 API。

| 接口 | 用途 |
| --- | --- |
| `GET /`、`GET /health` | 无需鉴权；不访问豆包 |
| `GET /info` | 协议、模型、19 种目标语言 |
| `GET /auth/status` | 探测 Cookie 登录状态 |
| `GET /v1/models`、`GET /v1/models/:model` | OpenAI 模型查询 |
| `POST /v1/chat/completions` | Chat Completions |
| `POST /v1/responses` | Responses |
| `POST /v1/messages` | Anthropic Messages |

除根路径和健康检查外均需鉴权。所有协议支持 `Authorization: Bearer <API_KEY>` 或 `x-api-key`；两者同时存在时以 Authorization 为准。`API_KEYS` 配置存在时覆盖 `API_KEY`。只有显式 `ALLOW_NO_AUTH=true` 才关闭鉴权。

目标语言优先级为：body `target_lang` > `X-Doubao-Target-Lang` > instructions/system/developer 中的翻译指令 > 最后一条 user 的明确指令前缀。未识别返回 400，不默认猜语言；同一优先级的冲突指令返回 400。

支持语言：`en ar de es es-ES fil fr id it ja ko ms pt ru th uz vi zh zh-Hant`。支持常见别名，例如 `zh-CN`、`zh-TW`、`pt-BR`、`es-MX`、`tl`。默认 scene 为数字 `2`，可用顶层 `doubao_scene` 覆盖为整数 1–6。

```sh
curl http://127.0.0.1:8390/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"doubao-ai","target_lang":"zh","messages":[{"role":"user","content":"Hello world"}]}'

curl http://127.0.0.1:8390/v1/responses \
  -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' \
  -d '{"model":"doubao-ai","instructions":"Translate into Simplified Chinese.","input":"Hello world","stream":true}'

curl http://127.0.0.1:8390/v1/messages \
  -H "x-api-key: $API_KEY" -H 'anthropic-version: 2023-06-01' \
  -H 'Content-Type: application/json' \
  -d '{"model":"doubao-ai","max_tokens":1024,"target_lang":"zh","messages":[{"role":"user","content":"Hello world"}]}'
```

## SDK 与 Magpie

OpenAI JS SDK 的 `baseURL` 为 `http://127.0.0.1:8390/v1`：

```js
import OpenAI from "openai";
const client = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: "http://127.0.0.1:8390/v1",
});
const result = await client.responses.create({
  model: "doubao-ai",
  instructions: "Translate to Chinese.",
  input: "Hello world",
});
console.log(result.output_text);
```

Anthropic JS SDK 会自行添加 `/v1/messages`，所以 `baseURL` 使用根地址：

```js
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic({
  apiKey: process.env.API_KEY,
  baseURL: "http://127.0.0.1:8390",
});
const result = await client.messages.create({
  model: "doubao-ai",
  max_tokens: 1024,
  system: "Translate to Chinese.",
  messages: [{ role: "user", content: "Hello world" }],
});
```

Magpie 中依次选择 OpenAI 兼容、OpenAI Responses、Anthropic 兼容 Provider，设置服务 API Key 和模型。按规格配置 Base URL `http://<host>:8390/v1`；若特定客户端自动添加 `/v1`，则使用根地址，确保最终请求路径与接口表一致。客户端不需要也不能提交豆包 Cookie。

## 能力与运行限制

- 仅翻译最后一条 user 文本；不实现通用聊天或持久化会话。system/developer/instructions 用于识别语言，不发送给上游；其中的额外风格要求不会传递给豆包。
- 接受文本字符串和相应协议的纯文本块；拒绝 tools、functions、多模态、结构化输出、多份 completion、reasoning 和会话状态依赖。
- `temperature`、token 上限等无害生成参数不会控制上游翻译。`store` 不会启用持久存储。
- 流式接口在上游完整翻译成功后发送标准 SSE，不是实时 token 输出；上游错误会在 SSE 开始前返回 JSON 错误。
- usage 固定为 0，不代表真实 token 数量或计费。
- 单段最多 9000 个 JavaScript 字符单位，单批最多 50 段/10000 字符单位；不拆 Unicode 代理对。请求体最多 2 MB，单请求最多 10000 个段，单次上游响应和合计译文各最多 8 MB。
- 默认上游并发 8、排队 100、等待 30 秒；每个 batch 超时 45 秒，登录探针超时 10 秒。建议低到中等并发。
- 默认最多重试 2 次；已知登录/参数错误不重试。客户端断开时取消上游和队列等待。
- 队列满返回 429，排队超时 503，上游超时 504；Cookie 过期返回 502，服务 API Key 错误返回 401。
- 默认关闭 CORS；可配置逗号分隔的 `CORS_ORIGINS`。管理写入仍要求同源。默认不信任代理头，可用 `TRUST_PROXY` 显式指定可信反代 IP/网段。
- 日志仅含请求元数据；Cookie、Key、原文、译文及上游原始错误均不输出。生产上游固定为豆包域名并拒绝重定向。

全部运行参数见 `.env.example`。不提供数据库、自动登录或自动刷新 Cookie。

## 验证

```sh
npm run typecheck
npm test
npm run build
npm run test:ui
npm run smoke:local
API_KEY=your-local-key sh scripts/smoke.sh
```

smoke 默认只请求健康检查和模型列表。显式启用 `LIVE_TRANSLATION=true` 时会使用服务端 Cookie 探测登录，并调用三种协议的普通和流式翻译；终端会显示这些测试文本的译文。

自动化测试使用独立本地 HTTP mock，不需要真实 Cookie，不访问豆包。浏览器流程测试使用 Playwright Chromium（首次可运行 `npx playwright install chromium`），覆盖桌面/手机、登录、导入、启停、调度、更新、删除、密码修改和退出；截图保存在忽略的 `.artifacts` 目录。CI 包含 SDK 集成测试、浏览器流程和 Docker smoke。真实上游及 Magpie 验收必须单独完成，状态记录在 `docs/ACCEPTANCE.md`。
