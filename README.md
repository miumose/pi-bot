# pi-bot

一个极简的多 bot AI 聊天 Web UI，基于 [pi coding agent](https://github.com/badlogic/pi-mono) 的 SDK。

像 IM 一样管理多个 bot：每个 bot 有自己的头像、人设、模型、工作目录、会话和长期记忆，可以同时并行回答。

- 单个 `server.ts` + 单个 `public/index.html`，无构建步骤
- 流式输出，显示思考过程与工具调用（read / bash / edit / write）
- bot 列表：置顶（5 个一排，可拖动排序）、未读红点、运行中指示
- 每个 bot 独立的长期记忆（`remember` 工具 + 可在编辑面板中查看修改）
- 设置页里配置各家 API Key 和默认模型

## 运行

需要 Node.js 22+。

```bash
npm install
npm start
```

打开 http://localhost:3000 ，在左上角 ⚙ 设置里填入 API Key（如 OpenCode Go、DeepSeek、Anthropic、OpenAI、OpenRouter 等），选择默认模型即可。

如果你已经在用 pi CLI，`~/.pi/agent/auth.json` 和 `models.json` 里的配置会直接复用。

### 环境变量

| 变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 端口 | `3000` |
| `PI_CWD` | bot 默认工作目录 | 启动目录 |
| `PI_MODEL` | 默认模型（设置页里改过则以设置页为准） | `opencode-go/deepseek-v4-flash` |
| `OPENCODE_API_KEY` / `DEEPSEEK_API_KEY` / ... | 各服务商 API Key，等同于设置页配置 | — |

## 数据存放

| 内容 | 位置 |
|---|---|
| API Key | `~/.pi/agent/auth.json`（由 pi 管理，不在项目目录） |
| bot 列表、默认模型 | `data/bots.json`、`data/settings.json` |
| 会话记录 | `data/sessions/<bot id>/*.jsonl`（pi 原生格式） |
| 长期记忆 | `data/bots/<bot id>/MEMORY.md` |

`data/` 已在 `.gitignore` 中。

## ⚠️ 安全说明

本项目面向**自己在本机/内网使用**：没有登录鉴权，bot 默认拥有完整的 shell 与文件读写能力，并且服务监听所有网卡。能访问这个端口的人就能在你的机器上执行任意命令。**不要暴露到公网**；需要的话请自行加反向代理鉴权，或改成只监听 `127.0.0.1`。

## License

MIT
