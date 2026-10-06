# doubao-translate2api

想法来自 linux.do 中帖子 https://linux.do/t/topic/2988583 

> **免责声明**
>
> 本项目是独立的非官方实现，与豆包及其他相关平台不存在隶属或合作关系，也不代表获得其授权、认可或背书。相关名称与商标属于各自权利人。
>
> 本项目旨在供学习、研究和开发交流。使用者应自行确认并遵守适用法律法规、相关平台的服务条款及账号使用规则，仅使用本人拥有或已获合法授权的账号与 Cookie，不得用于违法活动或侵害他人权益。
>
> 软件按 MIT 许可证以“现状”提供，不保证接口持续可用、翻译准确、账号安全或适用于特定用途。网页接口变更、账号风控或封禁、Cookie 与密钥泄露、服务中断、翻译错误及其他使用风险，均由使用者自行评估并承担。
>
> 在适用法律允许的范围内，作者和贡献者不对使用或无法使用本项目产生的损失、索赔或其他责任负责。下载、部署或使用前，请阅读本声明及 [MIT 许可证](LICENSE)；如无法接受相关风险，请勿使用。

将豆包网页翻译转换为 OpenAI Chat、OpenAI Responses 和 Anthropic Messages API，供翻译客户端调用。支持多 Cookie 管理、故障切换和按请求轮询。

仅提供文本翻译，不是通用聊天模型。

![管理页面：Cookie 账号、调度与 API Key](assets/admin-desktop.png)

<details>
<summary>查看手机界面</summary>

<img src="assets/admin-mobile.png" alt="手机上的 Cookie 管理与 API Key" width="360">

</details>

截图使用模拟账号，API Key 保持隐藏。

## Docker 部署

镜像：`muzileee/doubao-translate2api:latest`，当前版本 `0.1.2`，支持 AMD64 / ARM64。

1. 将 [docker-compose.nas.yml](docker-compose.nas.yml) 保存为项目目录中的 `docker-compose.yml`，或粘贴到 NAS 的 Compose 创建窗口。
2. 在项目目录创建 `data/admin`，确保容器用户有写入权限。
3. 启动项目，打开 `http://服务器IP:8390/admin`。

默认运行用户为 `1000:1000`。需要准备目录权限时，在项目目录执行：

```sh
mkdir -p data/admin
sudo chown 1000:1000 data/admin
sudo chmod 700 data/admin
docker compose up -d
```

NAS 配置默认允许局域网访问。公网部署请使用 HTTPS 反向代理；仅本机访问可改用 [docker-compose.hub.yml](docker-compose.hub.yml)，配合 [.env.example](.env.example)，默认绑定 `127.0.0.1`。

## 首次使用

查看自动生成的管理密码：

```sh
docker compose exec doubao-translate2api cat /admin-data/initial-password.txt
```

也可以在 NAS 文件管理器中查看 `data/admin/initial-password.txt`。登录后：

1. 导入豆包 Cookie，支持 Cookie Header、JSON 导出，以及 `.txt` / `.json` 文件。
2. 点击检测，确认账号登录有效。
3. 复制页面中的 API Key，填入翻译客户端。

管理密码与 API Key 独立。API Key 首次启动生成，重启和升级继续使用；重新生成会立即使旧 Key 失效，需要同步更新客户端。

| Cookie 调度 | 行为 |
| --- | --- |
| 故障切换（默认） | 优先使用当前账号，失效、限流或临时故障时切换 |
| 轮询 | 每个请求分配下一份可用 Cookie，故障时仍可切换 |
| 固定账号 | 只使用指定账号 |

Cookie 过期后更新即可，不提供自动登录。保存的数据在 `data/admin`，包括 Cookie、管理凭据和 API Key；升级时保留并备份此目录，不要公开或上传这些文件。

## 连接客户端

API Key 使用管理页复制的值。

| 客户端 / 协议 | Base URL |
| --- | --- |
| OpenAI Chat / Responses | `http://服务器IP:8390/v1` |
| Anthropic 官方 SDK | `http://服务器IP:8390` |

模型可选 `doubao-ai`、`volcengine-translate`、`microsoft-translator`，分别对应豆包 AI、火山翻译和微软翻译。三者均通过豆包网页接口调用。

Magpie 选择相应兼容 Provider，并填写 Base URL、API Key 和模型。若客户端自行追加 `/v1`，填写根地址，避免重复路径。

未指定目标语言时默认翻译为简体中文，可在管理页的“默认目标语言”中修改，立即生效并在重启后保留。请求中的 `target_lang`、`X-Doubao-Target-Lang` 或明确的翻译指令按此顺序优先于默认设置；明确指定不支持的语言或同级语言冲突仍返回错误。

客户端可通过 `GET /v1/models` 获取模型列表，或通过 `GET /v1/models/模型ID` 获取单个模型信息；均需要 API Key，兼容 OpenAI 与 Anthropic SDK。

```sh
curl http://服务器IP:8390/v1/chat/completions \
  -H "Authorization: Bearer 你的APIKey" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-ai","target_lang":"zh","messages":[{"role":"user","content":"Hello world"}]}'
```

仅翻译最后一条 user 文本，不支持图片、工具调用或对话记忆。支持流式格式，但会在上游翻译完整成功后发送结果；usage 固定为 0。

## 配置与升级

全部参数见 [.env.example](.env.example)。NAS 模板无须 `.env`；服务参数可在 Compose 的 `environment` 中添加，运行用户则修改 `user` 或在项目 `.env` 设置 `APP_UID` / `APP_GID`。

| 参数 | 默认 / 用途 |
| --- | --- |
| `API_KEY` / `API_KEYS` | 可不填；手动配置优先，管理页不能修改环境变量中的 Key |
| `APP_UID` / `APP_GID` | Compose 运行用户，默认 `1000:1000`，与数据目录所有者匹配 |
| `DOUBAO_MAX_CONCURRENCY` | 上游并发，默认 `8` |
| `DOUBAO_DEFAULT_TARGET_LANG` | 首次初始化的默认目标语言，默认 `zh`；已有管理页设置优先 |
| `ADMIN_COOKIE_SECURE` / `ADMIN_ORIGIN` | HTTPS 反代时设置为 `true` / 实际域名 |
| `TRUST_PROXY` | 仅填写实际可信反代的 IP 或网段 |

Compose 模板使用 `latest` 和 `pull_policy: always`，启动或重新部署时会检查最新版，无须修改版本号。更新正在运行的容器时执行：

```sh
docker compose pull
docker compose up -d
```

运行中的容器不会自行升级。需要定时更新时，可在 NAS 任务计划中定期运行上述命令；保留 `data/admin` 目录即可保留账号、密码、API Key 和默认语言。需要固定版本时，将镜像标签改为 `0.1.2`。

自动生成的 Key 在 `data/admin/api-key.txt`，权限为 `600`。文件损坏或不可读会拒绝启动；不会自动替换。修改管理密码会退出所有管理会话，但不会改变 API Key。

## 本地开发

需要 Node.js 24。

```sh
npm ci
npm run typecheck
npm test
npm run build
DOUBAO_COOKIE_FILE=./data/cookie.txt npm run dev
```

本地管理页：`http://127.0.0.1:8000/admin`。浏览器测试运行 `npm run test:ui`，首次需 `npx playwright install chromium`。CI 包含协议 SDK、浏览器和 Docker 检查；模拟测试通过不代表真实豆包或 Magpie 验收完成。

发布时推送与 `package.json` 版本一致的标签，例如 `v0.1.2`。GitHub Actions 检查通过后自动上传双架构镜像；需要配置 `DOCKERHUB_USERNAME` 和 `DOCKERHUB_TOKEN` Secrets。
