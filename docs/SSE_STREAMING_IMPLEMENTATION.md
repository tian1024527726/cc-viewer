# SSE 实时流式打字机效果 — 项目状态与接手手册

> **给下一次会话的 Claude / 开发者**：这份文档是 SSE 流式特性的**最新真实状态**。直接读它就能接手，不需要翻长对话。
>
> 最后更新：2026-04-17
> 路径：`/Users/sky/.npm-global/lib/node_modules/cc-viewer/`

---

## 🚀 快速接手（3 分钟上手）

### 1. 看当前 git 状态

```bash
cd /Users/sky/.npm-global/lib/node_modules/cc-viewer
git log --oneline -3
git status --short
cat package.json | grep '"version"'
```

**预期**：
- 最后 commit：`aadef2f feat: SSE live typewriter effect for latest assistant message, bump 1.6.161`
- 版本：`1.6.161`
- 工作区可能有"方案 D"的未 commit 改动（`src/components/ChatView.jsx` + `src/components/ChatView.module.css`，~21 行）
- 未 push 到 origin，未 npm publish

### 2. 确认构建和测试

```bash
npm run build  # 应成功
npm run test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```
**预期**：870/870 pass

### 3. 看迭代详细历史（可选深入）

`/Users/sky/.claude/plans/mossy-plotting-clarke.md` — 每一次迭代的 Context、方案、实施步骤、风险、验证。

---

## 🏗️ 当前架构（方案 D 现状）

### 数据流

```
Claude CLI (PTY child)
  ↓ HTTP request via ANTHROPIC_BASE_URL → proxy (cc-viewer main process)
cc-viewer 主进程
  ├─ interceptor.js: patched fetch (通过 proxy 转发路径)
  │    ├─ 判定 willLiveStream = !!_livePort && mainAgent && !_isTeammate
  │    ├─ 创建 liveAssembler (createStreamAssembler)
  │    ├─ 节流 flush (100ms / 16KB / content_block_stop)
  │    └─ POST /api/stream-chunk (带 x-cc-viewer-internal: 1 header)
  │         payload 仅 4 字段: {timestamp, url, response.body: snap, body.model}
  │
  ├─ server.js: /api/stream-chunk endpoint
  │    ├─ 鉴权: loopback + internal header
  │    ├─ _liveStreamLastSeq 乱序防护（>200 FIFO 驱逐）
  │    ├─ 8MB 413 熔断
  │    └─ sendEventToClients(clients, 'stream-progress', payload)
  │
  └─ SSE stream → 前端 /events
       ├─ AppBase.jsx: addEventListener('stream-progress', ...)
       │    └─ setState({ streamingLatest: {timestamp, url, content, model} })
       │
       └─ ChatView.jsx: streamingLiveItem = <ChatMessage ... showTrailingCursor />
            ├─ 方案 D: Last Response 内容保留；Divider 通过 CSS 隐藏
            ├─ pendingBubble 在 overlay 之前（时间顺序）
            ├─ 双 rAF 吸底（Virtuoso / 非 Virtuoso 通用）
            ├─ thinking Collapse controlled activeKey：text 到达时动画折叠
            └─ MarkdownBlock 的 trailingCursor 控制 ::after 光标定位
```

### 生命周期

**创建** → `stream-progress` 首 chunk 到达 → setState streamingLatest
**更新** → 每个后续 chunk 覆盖 state（latest-wins）
**终结**（只有两种路径）：
1. **正常**：最终 entry 到达 log-watcher → `_flushPendingEntries` 原子清除 `streamingLatest: null` + 更新 requests
2. **异常**：SSE 连接死亡 → 45s heartbeat 超时 → `_reconnectSSE` 清 streamingLatest（也调 setLivePort(null)）

**不再**有的清除路径（早期激进策略已移除）：
- ~~10s 无更新 timeout~~（长 thinking 误杀）
- ~~`onerror` 即时清除~~（网络抖动误杀）

### 关键模块职责

| 文件 | 职责 |
|---|---|
| `interceptor.js` | fetch 拦截；live-stream POST；`setLivePort(port)` 模块级 setter（不污染 process.env） |
| `lib/interceptor-core.js` | `createStreamAssembler` — 增量解析 SSE events / 深拷贝 snapshot |
| `server.js` | `/api/stream-chunk` endpoint；`setLivePort` 在 listen 回调内调用；`stopViewer` 清 `setLivePort(null)` |
| `src/AppBase.jsx` | `streamingLatest` state；stream-progress listener；`_reconnectSSE` 清除 overlay；项目切换清除 |
| `src/components/ChatView.jsx` | `streamingLiveItem` 渲染；方案 D wrapper；吸底双 rAF；spinner 隐藏；pendingBubble 顺序 |
| `src/components/ChatMessage.jsx` | thinking Collapse 流式 controlled / 非流式 uncontrolled；光标分发 |
| `src/components/MarkdownBlock.jsx` | `trailingCursor` prop → `.streamingTail` class |
| `src/components/MarkdownBlock.module.css` | `.streamingTail > ... ::after` 多选择器（段落/列表/代码/引用/表格） |

---

## 📜 方案演进（重要历史）

| 方案 | 描述 | 状态 |
|---|---|---|
| **早期** | partial entry 走 `data:` SSE 帧，期望前端 dedup 自动替换 | ❌ 被 `isRelevantRequest` 过滤 / sessionMerge 原地 mutation / ChatView 缓存不失效 等阻止 |
| **初版** | 独立 `stream-progress` named event + streamingLatest state + Divider "正在生成 ▌" | ✅ 落地 |
| **方案 A** | 流式期间隐藏 Last Response | ⚠️ 被用户否决：用户读上一轮内容时被打断 |
| **方案 B** | Last Response 淡化 opacity 0.45 + streamingLiveWrap 左蓝条包裹 overlay | ❌ 实测纵向双区叠加弹动，体验差 |
| **方案 C** | overlay 占据 Last Response 位置（`filteredLastResponseItems = null`） | ✅ commit aadef2f 落地 |
| **方案 D**（当前工作区） | 保留 Last Response 内容可供参考/复制；CSS 隐藏 "---Last Response---" Divider 标识 | ⏳ 工作区未 commit |

**方案 D 的动机**：
- 方案 C 下上一轮消失不利于参考对比
- 但 Divider "---Last Response---" 在有 overlay 时语义冗余
- D = 保留内容 + 隐藏标识

---

## ✅ 已完成的修复与优化（截至 commit aadef2f + 方案 D）

### 核心特性
- SSE 实时流式打字机（mainAgent only）
- 光标 ▌ 内联到最后叶子元素末尾（段落/列表/代码块/引用/表格）
- thinking 写完自动带动画折叠（antd Collapse controlled activeKey）
- 吸底（双 rAF，Virtuoso/非 Virtuoso 通用）
- 方案 D：Last Response 内容保留 + Divider 语义隐藏

### 安全 / 架构修复
- `/api/stream-chunk` 鉴权（loopback + internal header）
- `setLivePort(port)` 模块级 setter → **不污染主进程 process.env**，防泄漏到 Bash 工具 / MCP / Electron tab-worker
- `stopViewer` 清 `setLivePort(null)` 防重启窗口丢包
- payload 精简 4 字段（消除 O(N²) 完整 requestEntry 克隆）
- skeleton POST 首帧传 onDone 支持 413 熔断

### 稳定性修复
- overlay 不再中途消失（移除 10s timeout + onerror 激进清除，改用 `_flushPendingEntries` 原子清除 + `_reconnectSSE` 连接死亡清除）
- workspace_stopped / project_selected / handleReturnToWorkspaces 清 streamingLatest 防僵尸

### UX 优化
- loading spinner 在 SSE 活跃时隐藏（无 SSE 保留 fallback）
- pendingBubble 在 streamingLiveItem 之前（时间顺序）
- roleFilter 反选 assistant 时 skip overlay（遵从过滤语义）
- scrollToTimestamp 兜底（filteredLastResponseItems=null 时 streamingLiveItem 承担 _scrollTargetRef）

### 测试覆盖（870/870 pass）
- `test/stream-assembler.test.js` — 9 条 createStreamAssembler 单元测试
- `test/server.test.js` — `/api/stream-chunk` 6 条（403/204/乱序/happy-path/413/广播 shape）
- `test/interceptor-live.test.js` — 5 条 setLivePort / sendStreamChunk

---

## 🚫 绝不可破坏的清单（设计约束）

- `lib/log-watcher.js` — 不改
- `src/utils/helpers.js::isRelevantRequest` — 不改
- `src/utils/sessionMerge.js::mergeMainAgentSessions` — 不改
- `lib/delta-reconstructor.js::createIncrementalReconstructor` — 不改
- `lib/sdk-manager.js` — 不改（SDK 模式有自己的 stream）
- 最终 JSONL `appendFileSync` 时机 / 内容 / 格式 — 不改
- 前端 dedup `_requestIndexMap` — 不改
- Teammate / sub-agent 行为 — 完全不变（只对 mainAgent 启用）
- `_livePort` 未设置时零开销退化（sendStreamChunk 首行 return）

---

## 🛡️ 未启用的 edge case（已知但可接受）

| 场景 | 概率 | 后果 | 跟进路径 |
|---|---|---|---|
| 整个流式响应 < 300ms，thinking 折叠动画被 unmount 打断 | 极低 | 1 帧跳变 | 可选后续 |
| 非 Virtuoso 分支用户滚到中段发 prompt，Last Response 高度变化导致 scroll 偏移 | 中（方案 D 下已缓解，因为 Last Response 不再消失） | 不再是问题 | 已自然解决 |
| Docker/reverse proxy 下 `req.socket.remoteAddress` 是代理 IP | 低 | 鉴权误伤（bind 是 loopback 所以实际不触发） | 记录约束，未来 host=0.0.0.0 时需要重新设计 |
| 深嵌套列表 `<ul><li><ul><li><ul><li>` 第 3 层以上的光标 | 极低 | 光标在外层末 li | `ul:last-child > li:last-child > ul:last-child > li:last-child` 已覆盖 2 层，3 层+ 接受 |
| 最终 entry 因 interceptor bug / log-watcher 挂掉不到达 | 罕见 | overlay 永久卡住到 45s heartbeat | 45s 兜底已就位 |
| liveFlush 节流精确 timing 未测 | N/A | 难稳 | test/ 不补 |

---

## ⏳ 待办（下次可做）

### 未 commit 的工作区（方案 D）
- 实测方案 D 视觉效果是否优于方案 C
- 确认后 → commit 作为 1.6.162 增量 fix（或合到下次发布）

### 未发布（1.6.161 本地 commit 未 push / publish）
- `git push origin main`（需用户授权）
- `npm publish`（需用户授权）

### P3 优化（按需）
- Divider `display: none → block` 的 opacity transition 淡入
- liveFlush 100ms / 16KB 节流 timing unit test
- `body.model = undefined` 前端规范化
- README features 列表是否提一下 SSE 流式特性

---

## ↩️ 回滚路径

### 回退方案 D 到方案 C
```bash
git checkout src/components/ChatView.jsx src/components/ChatView.module.css
```

### 回退整个 SSE 特性
```bash
git reset --hard 9b07556  # 回到 1.6.160（需用户明确确认，会丢 aadef2f）
```

### 回退某一项修复
查 commit aadef2f 内容 → 反向 patch 具体 hunks。

---

## 🔑 关键术语对照

| 术语 | 含义 |
|---|---|
| PTY mode | Claude CLI 作为 PTY 子进程运行，通过 proxy 把 API 请求转发到 cc-viewer 主进程 |
| SDK mode | cc-viewer 直接用 `@anthropic-ai/sdk` 库调用 Claude API（同进程）— 有自己的实时流，不走 SSE overlay |
| mainAgent | 主对话 API 请求（非 sub-agent / teammate）— 由 `isMainAgentRequest()` 判定 |
| stream-progress | 新增的 SSE named event |
| streamingLatest | 前端 state，存当前流式 overlay 的 `{timestamp, url, content, model}` |
| streamingLiveItem | ChatView render 时生成的 ChatMessage React element |
| Last Response | ChatView 底部突出显示"最新一轮完整回复"的区域 |
| 方案 D | 当前工作区方案：保留 Last Response 内容，隐藏 Divider 标识 |
| `_livePort` | interceptor.js 模块级变量，由 server.js `setLivePort(port)` 注入；替代 `process.env.CCVIEWER_PORT` |

---

## 📂 关键文件索引

### 改动的文件（commit aadef2f + 方案 D 工作区）

```
.gitignore                                  [commit: +1 .claude/worktrees/]
history.md                                  [commit: +14 "1.6.161" section]
interceptor.js                              [commit: setLivePort + sendStreamChunk + live-flush logic]
lib/interceptor-core.js                     [commit: createStreamAssembler new export]
package.json                                [commit: version 1.6.160 → 1.6.161]
server.js                                   [commit: /api/stream-chunk endpoint + auth + setLivePort + stopViewer cleanup]
src/App.jsx                                 [commit: streamingLatest prop pass-through]
src/AppBase.jsx                             [commit: streamingLatest state + listener + _reconnectSSE cleanup + project switch clear]
src/Mobile.jsx                              [commit: streamingLatest prop pass-through]
src/components/ChatMessage.jsx              [commit: showTrailingCursor + thinking Collapse controlled + cursor dispatch]
src/components/ChatView.jsx                 [commit + 方案 D: streamingLiveItem + 方案 D wrapper + scroll anchor + sticky rAF]
src/components/ChatView.module.css          [方案 D: +.hideLastResponseDivider]
src/components/MarkdownBlock.jsx            [commit: trailingCursor prop]
src/components/MarkdownBlock.module.css     [commit: .streamingTail ::after + multi-selector]
docs/SSE_STREAMING_IMPLEMENTATION.md        [本文件]
test/interceptor-live.test.js               [commit: 5 cases]
test/server.test.js                         [commit: 6 /api/stream-chunk cases]
test/stream-assembler.test.js               [commit: 9 cases]
```

### 参考但未改动的文件

```
lib/log-watcher.js             # sendEventToClients 支持 named event
lib/sdk-manager.js:204-296     # SDK mode 实时流参考（独立路径）
lib/delta-reconstructor.js     # delta reconstructor 不受干扰
src/utils/sessionMerge.js      # 理解为何早期方案失败
src/utils/helpers.js:476-495   # isRelevantRequest 过滤器
pty-manager.js:131-136         # PTY 子进程 env.CCVIEWER_PORT 注入（给 ask-bridge/perm-bridge）
pty-manager.js:282-284         # shellEnv 清理 CCVIEWER_PORT 防非 cc-viewer Claude 实例泄漏
```

---

## ✅ 接手前 Checklist

- [ ] `git log --oneline -1` = `aadef2f`？
- [ ] `git status --short` 是否只有 ChatView.jsx + ChatView.module.css 两个 M？
- [ ] `npm run build` 通过？
- [ ] `npm run test` = 870/870？
- [ ] 了解方案 D 还未 commit？
- [ ] 知道要看 `/Users/sky/.claude/plans/mossy-plotting-clarke.md` 了解详细迭代历史？

---

**End of document.** 如果实测方案 D OK，下一步就是 commit 方案 D 并决定是否 push/publish。
