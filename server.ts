import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import {
	type AgentSession,
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	defineTool,
	getAgentDir,
	ModelRegistry,
	SessionManager,
} from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_CWD = process.env.PI_CWD ?? process.cwd();
const SETTINGS_FILE = join(import.meta.dirname, "data", "settings.json");
// 设置页可改：默认模型。API Key 交给 pi 存在 ~/.pi/agent/auth.json，不进项目目录
const settings: { defaultModel?: string } = existsSync(SETTINGS_FILE) ? JSON.parse(readFileSync(SETTINGS_FILE, "utf8")) : {};
const saveSettings = () => writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
const defaultModel = () => settings.defaultModel || process.env.PI_MODEL || "opencode-go/deepseek-v4-flash";
const DATA = join(import.meta.dirname, "data");
const BOTS_FILE = join(DATA, "bots.json");
const html = join(import.meta.dirname, "public", "index.html");
mkdirSync(DATA, { recursive: true });

interface Bot {
	id: string;
	name: string;
	avatar: string; // emoji 或单字
	prompt: string; // 人设，追加到 pi 默认 system prompt 之后
	model: string; // "provider/id"，空=默认模型
	cwd: string; // 空=DEFAULT_CWD
	pinned: boolean;
	pinOrder?: number; // 置顶区内的顺序，越小越靠前
	lastAt: number;
	lastText: string;
}

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

let bots: Bot[] = existsSync(BOTS_FILE) ? JSON.parse(readFileSync(BOTS_FILE, "utf8")) : [];
if (!bots.length) bots.push(newBot({ name: "Pi", avatar: "π" }));
const saveBots = () => writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));

function newBot(p: Partial<Bot>): Bot {
	return { id: Math.random().toString(36).slice(2, 10), name: "新 Bot", avatar: "🤖", prompt: "", model: "", cwd: "", pinned: false, lastAt: Date.now(), lastText: "", ...p };
}

const getBot = (id: string) => bots.find((b) => b.id === id);
const cwdOf = (b: Bot) => b.cwd || DEFAULT_CWD;
const sessionDir = (b: Bot) => join(DATA, "sessions", b.id);
// OpenCode Go/Zen 要求带 x-opencode-session 头做路由（pi 0.73 不会自动加），按 bot 固定
const findModel = (key: string, botId: string) => {
	const [provider, ...rest] = key.split("/");
	const model = modelRegistry.find(provider, rest.join("/"));
	if (!model || !provider.startsWith("opencode")) return model;
	return { ...model, headers: { ...model.headers, "x-opencode-session": `pi-im-${botId}` } };
};

// ---- 每个 bot 独立的长期记忆 data/bots/<id>/MEMORY.md ----
const memFile = (b: Bot) => join(DATA, "bots", b.id, "MEMORY.md");
const readMem = (b: Bot) => (existsSync(memFile(b)) ? readFileSync(memFile(b), "utf8") : "");
function writeMem(b: Bot, text: string) {
	mkdirSync(join(DATA, "bots", b.id), { recursive: true });
	writeFileSync(memFile(b), text);
}

// 记忆变了需要 reload 才进 system prompt；忙时等 agent_end 再 reload
const memDirty = new Set<string>();
async function refreshMemory(id: string) {
	const s = live.get(id)?.session;
	if (!s) return;
	if (busyBots.has(id)) return void memDirty.add(id);
	memDirty.delete(id);
	await s.reload();
}

const rememberTool = (bot: Bot) =>
	defineTool({
		name: "remember",
		label: "记忆",
		description:
			"把值得长期记住的信息（用户偏好、身份、约定、重要事实）写入你的长期记忆，换新会话后仍然有效。只记稳定、有复用价值的内容，一条一句，不记临时任务细节。用户说“记住…”时必须调用。",
		parameters: Type.Object({ content: Type.String({ description: "要记住的一条信息，一句话" }) }),
		execute: async (_id, { content }) => {
			mkdirSync(join(DATA, "bots", bot.id), { recursive: true });
			appendFileSync(memFile(bot), `- ${content.trim()}
`);
			memDirty.add(bot.id);
			broadcast({ t: "memory", bot: bot.id, text: readMem(bot) });
			return { content: [{ type: "text", text: "已记住" }], details: {} };
		},
	});

// ---- 每个 bot 一个常驻 AgentSession ----
const live = new Map<string, { session: AgentSession; unsub: () => void }>();

async function load(bot: Bot, sm?: SessionManager) {
	const old = live.get(bot.id);
	if (old) {
		if (!sm) return old.session;
		old.unsub();
		old.session.dispose();
	}
	const cwd = cwdOf(bot);
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		agentDir: getAgentDir(),
		appendSystemPromptOverride: (base) => (bot.prompt ? [...base, bot.prompt] : base),
		// 共用的 AGENTS.md 之外，再注入这个 bot 自己的记忆（每次 reload 重新读取）
		agentsFilesOverride: (base) => {
			const mem = readMem(bot).trim();
			if (!mem) return base;
			return { agentsFiles: [...base.agentsFiles, { path: memFile(bot), content: `# 你的长期记忆（${bot.name}）

${mem}` }] };
		},
	});
	await resourceLoader.reload();
	// 默认模型没配 key 时交给 pi 自己挑一个可用的
	let model = findModel(bot.model || defaultModel(), bot.id);
	if (model && !bot.model && !modelRegistry.hasConfiguredAuth(model)) model = undefined;
	const { session } = await createAgentSession({
		cwd,
		authStorage,
		modelRegistry,
		resourceLoader,
		...(model ? { model } : {}),
		customTools: [rememberTool(bot)],
		sessionManager: sm ?? SessionManager.continueRecent(cwd, sessionDir(bot)),
	});
	const unsub = session.subscribe((e) => onEvent(bot.id, session, e));
	live.set(bot.id, { session, unsub });
	return session;
}

// agent_end 触发时 session.isStreaming 还没复位，忙碌状态自己记
const busyBots = new Set<string>();

function onEvent(id: string, session: AgentSession, e: any) {
	const bot = getBot(id);
	const out = (m: object) => broadcast({ bot: id, ...m });
	switch (e.type) {
		case "agent_start":
			busyBots.add(id);
			out({ t: "busy", v: true });
			return broadcastBots();
		case "agent_end": {
			busyBots.delete(id);
			out({ t: "busy", v: false });
			const last = [...session.messages].reverse().find((m: any) => m.role === "assistant") as any;
			if (bot && last) {
				bot.lastText = textOf(last.content).slice(0, 80) || (last.stopReason === "aborted" ? "[已中断]" : last.errorMessage || "[工具调用]");
				bot.lastAt = Date.now();
				saveBots();
			}
			broadcastBots();
			if (memDirty.has(id)) refreshMemory(id).catch((err) => console.error("reload memory:", err));
			return sendHistory(id);
		}
		case "message_start":
			if (e.message.role === "assistant") out({ t: "assistant_start" });
			return;
		case "message_update": {
			const a = e.assistantMessageEvent;
			if (a.type === "text_delta") out({ t: "text", d: a.delta });
			else if (a.type === "thinking_delta") out({ t: "thinking", d: a.delta });
			return;
		}
		case "message_end":
			if (e.message.role === "assistant" && e.message.errorMessage) out({ t: "error", msg: e.message.errorMessage });
			return;
		case "tool_execution_start":
			return out({ t: "tool_start", id: e.toolCallId, name: e.toolName, args: e.args });
		case "tool_execution_end":
			return out({ t: "tool_end", id: e.toolCallId, isError: e.isError, result: textOf(e.result?.content) });
	}
}

const textOf = (content: any) =>
	typeof content === "string" ? content : (content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");

// ---- 推送 ----
const clients = new Set<WebSocket>();
const send = (ws: WebSocket, msg: unknown) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));
const broadcast = (msg: unknown) => clients.forEach((ws) => send(ws, msg));

const botsMsg = () => ({ t: "bots", list: bots.map((b) => ({ ...b, busy: busyBots.has(b.id) })) });
const broadcastBots = () => broadcast(botsMsg());

async function stateMsg(id: string) {
	const bot = getBot(id)!;
	const s = await load(bot);
	return {
		t: "state",
		bot: id,
		sessionFile: s.sessionFile,
		model: s.model ? `${s.model.provider}/${s.model.id}` : null,
		busy: busyBots.has(id),
		messages: s.messages,
	};
}

async function historyMsg(id: string) {
	const bot = getBot(id)!;
	const list = (await SessionManager.list(cwdOf(bot), sessionDir(bot))).sort((a, b) => +b.modified - +a.modified).slice(0, 30);
	return { t: "history", bot: id, list: list.map((s) => ({ path: s.path, title: s.name || s.firstMessage.slice(0, 30) || "(空)", modified: s.modified })) };
}
const sendHistory = async (id: string) => broadcast(await historyMsg(id));

// ---- 设置：模型列表 / API Key 状态（只回传是否已配置，不回传 key 本身）----
const modelsMsg = () => ({
	t: "models",
	list: modelRegistry.getAvailable().map((m) => `${m.provider}/${m.id}`),
	defaultCwd: DEFAULT_CWD,
	defaultModel: defaultModel(),
});
const settingsMsg = () => {
	const providers = [...new Set(modelRegistry.getAll().map((m) => m.provider))];
	return {
		t: "settings",
		defaultModel: defaultModel(),
		allModels: modelRegistry.getAll().map((m) => `${m.provider}/${m.id}`),
		providers: providers.map((id) => ({ id, ...authStorage.getAuthStatus(id) })),
	};
};

// ---- 指令 ----
async function handle(ws: WebSocket, m: any) {
	const bot = m.bot ? getBot(m.bot) : undefined;
	switch (m.t) {
		case "select":
			if (!bot) return;
			send(ws, await stateMsg(bot.id));
			return send(ws, await historyMsg(bot.id));
		case "prompt": {
			const s = await load(bot!);
			if (s.isStreaming) return s.followUp(m.text);
			bot!.lastAt = Date.now();
			return s.prompt(m.text);
		}
		case "abort":
			return live.get(m.bot)?.session.abort();
		case "new":
			await load(bot!, SessionManager.create(cwdOf(bot!), sessionDir(bot!)));
			broadcast(await stateMsg(bot!.id));
			return sendHistory(bot!.id);
		case "open":
			await load(bot!, SessionManager.open(m.path, sessionDir(bot!)));
			return broadcast(await stateMsg(bot!.id));
		case "model": {
			const model = findModel(m.value, bot!.id);
			if (!model) return;
			await (await load(bot!)).setModel(model);
			bot!.model = m.value;
			saveBots();
			return broadcast(await stateMsg(bot!.id));
		}
		case "settings_get":
			return send(ws, settingsMsg());
		case "set_key": {
			const key = String(m.key ?? "").trim();
			if (key) authStorage.set(m.provider, { type: "api_key", key });
			else authStorage.remove(m.provider);
			modelRegistry.refresh();
			broadcast(modelsMsg());
			return broadcast(settingsMsg());
		}
		case "set_default_model": {
			settings.defaultModel = m.value || undefined;
			saveSettings();
			// 没单独选模型的 bot 跟着切
			for (const b of bots) {
				const s = live.get(b.id)?.session;
				const model = findModel(defaultModel(), b.id);
				if (!b.model && s && model && !busyBots.has(b.id)) await s.setModel(model);
			}
			broadcast(modelsMsg());
			broadcast(settingsMsg());
			if (bot) send(ws, await stateMsg(bot.id));
			return;
		}
		case "memory_get":
			return send(ws, { t: "memory", bot: bot!.id, text: readMem(bot!) });
		case "memory_set":
			writeMem(bot!, m.text);
			broadcast({ t: "memory", bot: bot!.id, text: m.text });
			return refreshMemory(bot!.id);
		case "pin":
			bot!.pinned = !bot!.pinned;
			// 后置顶的排在最后
			if (bot!.pinned) bot!.pinOrder = Math.max(-1, ...bots.filter((b) => b.pinned && b !== bot).map((b) => b.pinOrder ?? 0)) + 1;
			saveBots();
			return broadcastBots();
		case "reorder_pins":
			(m.ids as string[]).forEach((id, i) => {
				const b = getBot(id);
				if (b?.pinned) b.pinOrder = i;
			});
			saveBots();
			return broadcastBots();
		case "save_bot": {
			const { name, avatar, prompt, model, cwd } = m.data;
			const finalName = (name || "新 Bot").trim();
			if (bots.some((b) => b !== bot && b.name.trim().toLowerCase() === finalName.toLowerCase())) throw new Error(`已有名为「${finalName}」的 bot`);
			const fields = { name: finalName, avatar: avatar || "🤖", prompt: prompt ?? "", model: model ?? "", cwd: cwd ?? "" };
			let target = bot;
			if (target) {
				const changed = target.prompt !== fields.prompt || target.cwd !== fields.cwd || target.model !== fields.model;
				Object.assign(target, fields);
				// 人设/目录/模型变了：重建 session（沿用当前会话文件）
				const old = live.get(target.id);
				if (changed && old) await load(target, SessionManager.open(old.session.sessionFile!, sessionDir(target), cwdOf(target)));
			} else {
				target = newBot(fields);
				bots.push(target);
			}
			saveBots();
			broadcastBots();
			send(ws, { t: "selected", bot: target.id });
			return broadcast(await stateMsg(target.id));
		}
		case "delete_bot": {
			if (!bot) return;
			const l = live.get(bot.id);
			l?.unsub();
			l?.session.dispose();
			live.delete(bot.id);
			bots = bots.filter((b) => b !== bot); // 会话文件保留在 data/sessions/<id>
			saveBots();
			return broadcastBots();
		}
	}
}

const server = createServer(async (_req, res) => {
	res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
	res.end(await readFile(html));
});

new WebSocketServer({ server }).on("connection", async (ws) => {
	clients.add(ws);
	ws.on("close", () => clients.delete(ws));
	ws.on("message", (raw) => {
		const m = JSON.parse(String(raw));
		handle(ws, m).catch((err) => send(ws, { t: "error", bot: m.bot, msg: String(err?.message ?? err) }));
	});
	send(ws, modelsMsg());
	send(ws, botsMsg());
});

server.listen(PORT, () => console.log(`pi-bot → http://localhost:${PORT}  (默认模型 ${defaultModel()})`));
