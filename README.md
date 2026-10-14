<div align="center">

# 🤖 pi-bot

### 你自己的 Grok bot 军团 —— 跑在你电脑上，而且会动手干活。

**一个文件的后端 · 一个文件的前端 · 零构建 · `npm start` 即用**

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-black?logo=node.js)](https://nodejs.org)
[![Built on pi](https://img.shields.io/badge/built%20on-pi%20agent-black)](https://github.com/badlogic/pi-mono)
[![GitHub stars](https://img.shields.io/github/stars/miumose/pi-bot?style=social)](https://github.com/miumose/pi-bot/stargazers)

[快速开始](#-30-秒上手) · [功能](#-它能干嘛) · [对比](#-为什么不直接用-grok--chatgpt) · [路线图](#-路线图)

</div>

---

在 X 上，@grok 一下，它就来回答你。

**pi-bot 把这种体验搬回你自己的机器上，而且不止一个：**
想要几个 bot 就建几个，每个都有自己的头像、性格、模型、记忆和工作目录。它们像 IM 里的联系人一样排在左边，置顶的、未读的、正在打字的，一眼就能看到。

最关键的是，它们底下是 [pi coding agent](https://github.com/badlogic/pi-mono)：**不只是聊天，还能读文件、跑命令、改代码。**

```
你 → 🔧运维小弟：看下 3000 端口被谁占了，顺便把它停了
🔧运维小弟：
      ⚙ bash  netstat -ano | findstr :3000
      ⚙ bash  taskkill /PID 7860 /F
      搞定，是一个残留的 node 进程，已经停了。
```

## ✨ 它能干嘛

| | |
|---|---|
| 🧑‍🤝‍🧑 **多 bot，一个界面** | 翻译官、周报助手、毒舌 code reviewer、运维小弟……一人一个窗口，**同时并行干活**，互不打扰 |
| 📌 **像 IM 一样顺手** | 置顶 bot 5 个一排，拖动排序；未读红点、"正在回答"转圈；悬停预览最新消息 |
| 🧠 **每个 bot 有自己的长期记忆** | 说一句"记住我叫阿木，爱喝冰美式"，换会话、重启服务它都记得。记忆是纯 Markdown，随时手改 |
| 🛠️ **真·能动手** | 继承 pi 的 `read` / `bash` / `edit` / `write` 工具，思考过程和每一次工具调用都实时可见 |
| 🎭 **人设一秒切换** | 内置翻译 / 润色 / 代码 / 简洁 / 毒舌模板，点一下就套上 |
| 🔌 **31 家模型随便换** | OpenCode Go、DeepSeek、Anthropic、OpenAI、OpenRouter、Gemini、Kimi、GLM、Qwen、xAI……每个 bot 可以用不同的模型 |
| 🔑 **Key 不进项目目录** | 在设置页填 API Key，由 pi 存到 `~/.pi/agent/auth.json`，网页拿不到明文 |
| ⚡ **极简到离谱** | 后端一个 `server.ts`，前端一个 `index.html`。没有 React、没有打包、没有数据库，想改什么直接改 |

## 🚀 30 秒上手

```bash
git clone https://github.com/miumose/pi-bot.git
cd pi-bot
npm install
npm start
```

打开 **http://localhost:3000** → 点左上角 **⚙** 填一个 API Key → 点 **＋ 新建**，输入名字回车。完事。

> 已经在用 pi CLI？`~/.pi/agent` 里的 key 和 `models.json` 会被直接复用，连 key 都不用填。

## 🥊 为什么不直接用 Grok / ChatGPT？

| | Grok / ChatGPT 网页 | **pi-bot** |
|---|:---:|:---:|
| 同时养一堆不同人设的 bot | 😐 | ✅ |
| 每个 bot 独立的长期记忆，可直接编辑 | ❌ | ✅ |
| 能在你电脑上跑命令、读写文件 | ❌ | ✅ |
| 想用哪家模型用哪家，按 bot 切换 | ❌ | ✅ |
| 聊天记录存在你自己硬盘上 | ❌ | ✅ |
| 整个项目两个源文件，看得懂、改得动 | ❌ | ✅ |

## ⚙️ 配置

| 环境变量 | 说明 | 默认 |
|---|---|---|
| `PORT` | 端口 | `3000` |
| `PI_CWD` | bot 默认工作目录 | 启动目录 |
| `PI_MODEL` | 默认模型（设置页改过则以设置页为准） | `opencode-go/deepseek-v4-flash` |
| `OPENCODE_API_KEY` / `DEEPSEEK_API_KEY` / `ANTHROPIC_API_KEY` / ... | 各家 Key，等同于在设置页填写 | — |

<details>
<summary><b>数据都存在哪？</b></summary>

| 内容 | 位置 |
|---|---|
| API Key | `~/.pi/agent/auth.json`（pi 管理，不在项目目录） |
| bot 列表、默认模型 | `data/bots.json`、`data/settings.json` |
| 会话记录 | `data/sessions/<bot id>/*.jsonl`（pi 原生格式，pi CLI 也能打开） |
| 长期记忆 | `data/bots/<bot id>/MEMORY.md` |

`data/` 已在 `.gitignore` 中。

</details>

## 🗺️ 路线图

- [ ] 群聊：把多个 bot 拉进同一个房间，`@` 谁谁回答
- [ ] 图片 / 文件拖进对话
- [ ] 联网搜索工具
- [ ] 每个 bot 单独开关工具权限
- [ ] 登录鉴权，安全地放到公网
- [ ] 移动端适配

想要哪个？[开个 issue](https://github.com/miumose/pi-bot/issues) 投票，或者直接 PR —— 两个文件，读完不用十分钟。

## 🙏 致谢

- [pi](https://github.com/badlogic/pi-mono) —— 本项目的全部 agent 能力都来自它
- [Grok Bot](https://x.com/grok) —— "@ 一下就来"的灵感来源

---

<div align="center">

[![Star History Chart](https://api.star-history.com/svg?repos=miumose/pi-bot&type=Date)](https://star-history.com/#miumose/pi-bot&Date)

MIT © [miumose](https://github.com/miumose)

</div>
