# Cloudflare Workers 部署指南

Workers 版本是实验版本。已提供接口实现与本地 Workers 运行时测试；尚未完成真实 Cloudflare 出口到豆包、免费额度表现和真实沉浸式扩展的验收。

Workers 让 Cloudflare 运行你的翻译接口，无需购买服务器、安装 Docker 或迁移域名。翻译仍由豆包网页接口完成，不使用 Workers AI。

## 准备两个不同的凭据

| 名称 | 用途 | 填在哪里 |
| --- | --- | --- |
| `DOUBAO_COOKIE` | 让 Worker 访问自己的豆包账号 | Cloudflare Worker 的 Secret |
| `API_KEY` | 让沉浸式翻译访问自己的 Worker | Worker Secret 与沉浸式翻译 API Key |

API Key 自己生成，至少 16 位、最多 256 位，不包含空格。可以在本机执行：

```sh
openssl rand -hex 32
```

`DOUBAO_COOKIE` 使用 Cookie Header 字符串，必须包含 `sessionid`、`sid_tt`、`uid_tt`。Workers 第一版不接受 Cookie 导出 JSON。

取得 Cookie：

1. 在浏览器登录自己的豆包账号。
2. 打开开发者工具的 Network/网络面板，触发一次豆包网页翻译。
3. 选择发往 `www.doubao.com` 的请求，在 Request Headers/请求标头中找到 Cookie。
4. 将 Cookie 的值填写到 Secret；开头带 `Cookie:` 也能识别。

Cookie 是账号登录凭据，不填写到 GitHub 文件，也不填写到沉浸式翻译的 API Key 输入框。本地文件 `.dev.vars` 已被 Git 忽略。

## 方式一：通过浏览器部署

准备自己的 Cloudflare 和 GitHub 账号。从含有 `wrangler.jsonc` 的本项目源码版本进入部署：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mu-zi-lee/doubao-translate2api)

按钮指向主仓库的默认分支。如果默认分支尚未包含 Workers 实现，请先使用下面的命令行路线部署本地代码；按钮不能部署尚未推送的本地文件。

1. 登录 Cloudflare，按部署页面提示连接 GitHub 并复制源码到自己的仓库。
2. 为 Worker 选择名称，例如 `my-doubao-translate`。
3. 查看构建设置：项目根目录为仓库根目录；构建命令使用 `npm run build:workers`；部署命令使用 `npm run deploy:workers`。仓库的 `.node-version` 指定 Node.js 24。不要将根目录改为 `src/workers`，它需要仓库里的共享代码。
4. 在页面要求的 Secrets 中填写 `API_KEY` 和 `DOUBAO_COOKIE`。如果页面没有收集 Secrets，部署后进入该 Worker 的 Settings/设置 → Variables and Secrets/变量与密钥，按 Secret 类型添加这两个值，并部署设置。
5. 完成部署，复制 `https://Worker名称.账号子域.workers.dev` 地址。无需先配置自己的域名。

Secret 未配置完整时，公开健康检查仍能成功，但受保护的接口返回 `configuration_error`。这是服务配置未完成，并不表示翻译可用。

Cloudflare 的页面名称可能变化，以实际控制台为准。按钮的实际复制、Secret 提示与首次构建流程仍需要在用户账号验收。

## 方式二：从当前本地仓库部署

本项目开发环境使用 Node.js 24。已有本地仓库时，在项目目录执行：

```sh
npm ci
npx wrangler login
npm run deploy:workers
npx wrangler secret put API_KEY
npx wrangler secret put DOUBAO_COOKIE
```

`wrangler login` 会打开浏览器，由你登录自己的 Cloudflare 账号并授权。Secret 命令会提示输入对应值，不要把真实值直接拼到命令行。

配置里的 Worker 名称默认是 `doubao-translate2api`。如你的账号已有同名 Worker，先修改 `wrangler.jsonc` 的 `name`，避免部署覆盖现有应用；修改名字后 Secret 命令使用同一项目配置。

Secret 上传命令可能创建并立即部署新版本。两个 Secret 都设置好之前，受保护接口会返回配置错误。部署输出和控制台里可以找到访问地址。

### 本地预览

将 `.dev.vars.example` 的内容填写到本地 `.dev.vars`，补上自己的凭据，然后执行：

```sh
npm run dev:workers
```

Wrangler 会打印本地地址，通常为 `http://localhost:8787`。没填凭据也能检查 `/health`，但不能进行翻译。

本地翻译请求使用本机网络；本地成功不能证明 Cloudflare 出口请求成功。

## 部署后先验证接口

先打开 `https://你的Worker地址/health`，预期看到 `{"status":"ok"}`。它只说明代码运行正常。

再检查模型、登录和真实翻译。下面命令避免把访问密钥写入命令历史：

```sh
export WORKER_URL='https://你的Worker地址'
read -rs 'WORKER_API_KEY?输入你设置的 API Key: '
printf '\n'
export WORKER_API_KEY
node --input-type=module <<'JS'
const base = process.env.WORKER_URL.replace(/\/$/, "");
const headers = { Authorization: `Bearer ${process.env.WORKER_API_KEY}` };
for (const path of ["/v1/models", "/auth/status"]) {
  const response = await fetch(base + path, { headers });
  console.log(path, response.status, await response.text());
}
const response = await fetch(base + "/v1/chat/completions", {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "doubao-ai",
    messages: [{ role: "user", content: "Translate to Chinese:\n\nHello, world!" }],
  }),
});
console.log("translation", response.status, await response.text());
JS
unset WORKER_API_KEY
```

上述 `read` 输入示例用于 macOS 的 zsh。其他终端也可以使用自己的 API 客户端发送带 `Authorization: Bearer ...` 的请求。

验收标准是登录检查显示 `authenticated: true`，且翻译请求返回完整译文。账号有效但翻译被拒绝时，需要继续检查上游访问拒绝、翻译权限或接口变化。

## 接入沉浸式翻译

在支持自定义 API 地址的 OpenAI 服务设置中填写：

| 字段 | 值 |
| --- | --- |
| 自定义接口地址 | `https://你的Worker地址/v1/chat/completions` |
| API Key | Worker 中设置的 `API_KEY` |
| 模型 | `doubao-ai` |
| 并发 | 建议先设为 1，测试后再增加 |

如果客户端字段要求的是 Base URL 而非完整接口路径，则填写 `https://你的Worker地址/v1`。以实际扩展字段说明为准。

当前支持 `doubao-ai`、`volcengine-translate`、`microsoft-translator` 三种模型。它们是翻译引擎，不是通用聊天模型。

默认 `TRANSLATION_PROFILE=immersive-translate`：

- 支持纯文本，以及独立一行的 `%%` 批量分隔符。
- 分隔符不发送到上游翻译，结果按原位置恢复。
- 不支持 YAML 模板、`<text>` 包装模板或富 HTML；先关闭富文本翻译并使用纯文本模板。
- 自定义提示词不会作为模型指令执行；系统提示词主要用于现有目标语言识别。

可在需要自定义模板时使用以下普通/多段/字幕用户提示词形式：

```text
Translate to {{to}}:

{{text}}
```

多段输入仍需使用扩展的纯文本 `%%` 分隔形式。这是支持的模板边界，不代表已经验证扩展所有版本和所有视频站点。

先测试一段网页文本，再测试字幕。若显示接口调用成功但页面没有替换，检查输入输出模板，不要只增加重试次数。

普通 API 客户端需要翻译字面值 `%%` 或其他文本时，可将 `TRANSLATION_PROFILE` 改成 `plain`；这会取消沉浸式格式保护，不会增加 HTML/YAML 结构保留能力。

## 默认限制与配置

| 项目 | 默认值 |
| --- | --- |
| 请求体 | 64 KiB，按实际读取字节限制 |
| 提取后的正文 | 20,000 个 JavaScript 字符单位 |
| 上游批次 | 每个请求最多 4 批 |
| 上游响应 | 每次最多 1 MiB |
| 译文正文 | 每次客户端请求累计最多 256 KiB |
| 单批 | 沿用共享核心：最多 50 段、10,000 字符 |
| 上游请求超时 | 45 秒 |
| 总翻译超时 | 90 秒 |
| 登录检查超时 | 10 秒 |
| 单实例并发 | 2 |
| 排队 | 最多 10 个，等待最多 10 秒 |
| 重试 | 默认 0 次 |
| 跨域 | 默认 `*`，实际接口必须验证 API Key |

可调整的普通变量见 `src/workers/config.ts`。凭据必须使用 Secret，其余变量可通过 `wrangler.jsonc` 或控制台设置；使用 Wrangler 重新部署前，应把需保留的普通配置写回配置文件。

`CORS_ORIGINS` 可设为逗号分隔的 HTTP/HTTPS 来源，例如 `https://example.com`，不能带路径或末尾斜杠。来源限制可能影响浏览器扩展；第一次连接建议保留默认值。CORS 不代替访问鉴权。

这里的并发限制不是账号在 Cloudflare 全网的总并发限制。不要将这个单账号版本当作多人共享网关。

免费方案适合先试验，但真实请求的 CPU 消耗和免费额度适用性尚未验收；以 Cloudflare 当前限制和账号账单为准。

## 更新与维护

Cookie 过期：在 Worker 的 Variables and Secrets 中替换 `DOUBAO_COOKIE` 并部署，或运行 `npx wrangler secret put DOUBAO_COOKIE`。API Key 可用同样方式替换，并同步修改客户端设置。

代码更新：将上游更改同步到自己的仓库，再触发构建部署；源码复制后不会自动跟随上游更新。命令行路线则更新本地代码、运行 `npm ci` 后重新部署。

诊断日志仅记录请求 ID、耗时、批次数和错误类别，不记录正文与凭据。可在 Cloudflare 控制台查看日志或运行：

```sh
npx wrangler tail
```

当前只记录应用日志，不添加正文级的 trace 采集。`/auth/status` 使用 API Key 保护，避免公开账号登录状态。

## 常见错误

| 错误 | 处理 |
| --- | --- |
| `configuration_error` | 检查两个 Secret、Cookie Header 格式、Key 长度及普通变量 |
| `unauthorized` | 检查客户端 Key 与 Worker Secret 一致；不要填豆包 Cookie |
| `upstream_auth_error` 且登录检查 `cookie_expired` | 更新自己的豆包 Cookie |
| `upstream_http_error` / 上游 403 | 属于访问拒绝，不能仅据此确认 Cookie 过期；检查云端出口与上游限制 |
| 429 | 降低客户端并发并稍后重试 |
| `upstream_timeout` / `translation_timeout` | 降低请求大小，检查上游耗时和客户端等待时间 |
| `request_too_large` | 减少单次段落数或文本长度 |
| `unsupported_input` | 使用支持的纯文本模板，关闭 YAML/富文本功能 |
| `upstream_incomplete_result` | 上游没有返回全部译文，本次请求整体失败 |
| `origin_forbidden` | 检查 `CORS_ORIGINS` 与扩展实际 Origin |
| Cloudflare 1102 等平台错误 | 检查平台 CPU/内存限制，不等同于豆包超时 |

## 开发与验证

```sh
npm run typecheck
npm test
npm run build
npm run build:workers
npm audit
```

`npm test` 包含 Miniflare/workerd 运行时测试，关闭 Node 兼容功能、使用模拟上游；它不能替代真实云端请求和真实扩展验收。

Workers 在根目录部署，共享代码和依赖一起打包，无数据库绑定。开发依赖与 Wrangler 使用相同版本的 Miniflare，并固定 sharp 修补版本；安装或升级时需重新检查依赖审计与运行时测试。

官方资料：[入门](https://developers.cloudflare.com/workers/get-started/guide/)、[Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[运行限制](https://developers.cloudflare.com/workers/platform/limits/)、[部署按钮](https://developers.cloudflare.com/workers/platform/deploy-buttons/)、[沉浸式模板](https://immersivetranslate.com/docs/prompts/)。
