# IDE 账号桥接（Qoder / Trae）

把本机**已经登录**的 Qoder 与 Trae 桌面账号接进 Cyrene，不用走 OAuth，也不用去网页上申请
API Key —— 装好插件，把面板给出的 Base URL 和 token 填进模型档案就能用。

支持四个区域，登录哪个出现哪个：

| 区域 | provider | 上游 |
| --- | --- | --- |
| Qoder CN | `qoder-cn` | `gateway.qoder.com.cn` |
| Qoder 国际 | `qoder` | `api3.qoder.sh` |
| Trae CN | `trae` | `trae-api-cn.mchost.guru` |
| Trae 国际 | `trae-global` | `coresg-normal.trae.ai` |

## 它怎么工作

每个区域跑一个绑定在 `127.0.0.1` 随机端口的本地服务：**对外说 OpenAI 协议，对内翻译成
该区域自己的私有协议**（Qoder 的 COSY 签名 + 自定义 body 编码；Trae 的 SOLO 协议）。
Cyrene 只需要把它当成一个普通的「OpenAI 兼容」模型档案。

```
Cyrene 模型档案（OpenAI 兼容）
  -> 127.0.0.1:<随机端口>/v1        （本插件的回环服务）
  -> COSY 签名 / SOLO 协议
  -> 对应区域的上游网关
```

**真实凭据不出本进程。** Cyrene 拿到的只是这个回环服务的一次性随机 bearer token，
离开 127.0.0.1 就毫无用处；上游令牌只在插件进程内部使用。

## 安装与启用

1. 在 Cyrene 中 **设置 → 插件 → 导入 ZIP**，选择 `ide-account-bridge-<版本>.zip`
2. 在插件列表里**手动启用**（用户插件默认停用）
3. 点插件页的 **Open / 打开**，打开配置面板

面板会列出每个已登录区域的 **Base URL** 与 **token**，点「复制」即可。

## 配置

在 Cyrene 里 **设置 → 模型 → 新增模型档案**：

| 字段 | 填什么 |
| --- | --- |
| 协议 | **OpenAI 兼容** |
| Base URL | 面板中对应区域的 Base URL |
| API Key / token | 面板中对应区域的 token |
| 模型 ID | 面板中该区域列出的模型 ID（如 `DeepSeek-Flash`） |

四个区域是四个独立的模型档案，各用各的账号与额度。

> **端口与 token 每次启用都会重新生成。** 停用插件、重启 Cyrene 之后，需要回到面板重新复制
> 一次。这是刻意的：token 只在本进程生命周期内有效。

### 面板上的三个按钮

| 按钮 | 作用 |
| --- | --- |
| 刷新状态 | 重新读取各区域端点与模型列表 |
| 查询额度 | 读取各区域额度、促销活动与今日签到状态（只读） |
| 领取今日签到 | 向账号领取今日签到额度 —— **本插件唯一会改动账号状态的操作**，点击后会二次确认 |

### 对话工具

插件同时向 Agent 暴露三个工具：

| 工具 | 风险 | 说明 |
| --- | --- | --- |
| `ide-account-bridge_usage` | 只读 | 查询各区域额度与签到状态 |
| `ide-account-bridge_models` | 只读 | 列出各区域可用的模型 ID |
| `ide-account-bridge_checkin` | 改动账号状态 | 领取今日签到。**必须显式传 `confirm=true`**，否则只回报将要执行的动作 |

## 网络访问

插件只访问上述四个区域的上游网关与它们各自的鉴权/额度端点：

- Qoder：`gateway.qoder.com.cn`、`api3.qoder.sh`、`openapi.qoder.com.cn`、`openapi.qoder.sh`
- Trae：`trae-api-cn.mchost.guru`、`coresg-normal.trae.ai`、`growsg-normal.trae.ai`、`solo.trae.cn`、`api.trae.cn`

发送内容就是**你自己在 Cyrene 里发出的对话请求**（模型 ID、消息、工具声明），
以及用于鉴权的账号令牌。没有遥测，没有第三方上报，插件自身不连接任何其他服务器。

## 文件读写

**读取**（仅本机，只读，不修改）：

- `%APPDATA%\<Qoder 应用名>\User\globalStorage\state.vscdb`
  —— 应用名取自 `QoderCN` / `Qoder CN` / `QoderWork CN` / `Qoder` / `QoderWork`
- `%APPDATA%\<Trae 应用名>\User\globalStorage\storage.json`
  —— 应用名取自 `Trae CN` / `trae-cn` / `Trae` / `TRAE SOLO CN` / `TRAE SOLO`

这两个文件是桌面应用自己保存登录态的数据库，插件只读它们来复用你已有的登录。

**写入**（只写插件自己的存储目录，由宿主分配）：

- Qoder 模型目录缓存 —— 只含模型元数据，**不含任何令牌**
- Trae 刷新后的凭据副本（`.trae-auth.<区域>.json`）—— **这是一个明文 JSON 文件，内含 `accessToken` 与 `refreshToken`**。Trae 的 access token 有有效期，刷新后写一份副本，这样两个区域同时登录时不会互相覆盖；文件以 `0600`（仅当前用户可读写）创建。请知悉它等同于一枚可用的账号令牌，落在 `ctx.storage.rootDir()` 之下。该设计继承自上游 DSH 插件，本插件未做改动。

插件**不会**写入 Qoder / Trae 应用自己的任何文件。

## 子进程

Windows 上，读取 Qoder 的登录态需要解开 Chromium 的 OSCrypt 密钥，而这一步只能通过
**系统 DPAPI** 完成。插件用 `execFileSync` 启动一次 `powershell.exe`，传入一段固定的、
不含任何用户输入的内联脚本，由它调用 `ProtectedData.Unprotect` 解出密钥，结果经临时文件回传。

- 脚本内容是常量，不拼接任何外部数据，不存在命令注入面
- 仅在 Windows 上执行；其他平台走不同的分支
- 调用是同步的，每次运行只解一次（结果有缓存）

## 已知限制与风险

- **必须先在桌面应用里登录。** 插件读的是桌面应用的登录态；没登录的区域不会出现在面板里，
  也不会占用端口。没有桌面登录时可退回环境变量 `QODERCN_PAT` / `QODER_PAT` 等（Qoder）。
- **上游协议是私有的。** 这套协议由上游插件的作者实测还原，随时可能因为厂商改版而失效。
  它不是厂商公开承诺的 API，出问题时只能等适配更新。
- **请自行确认各厂商的使用条款。** 本插件复用你自己的账号额度，但「第三方客户端接入」
  是否被条款允许，由厂商解释，本插件不对此负责。
- **模型 ID 取自上游的展示名。** 上游给模型改名时，模型档案里的 ID 需要跟着改。
  新模型是新增而非改名，所以既有配置通常不受影响。
- **签到会改动账号状态。** 这是插件里唯一有副作用的操作，工具与面板都做了确认环节，
  且会先读状态、已领取过的不重复请求。
- **Trae 国际版未做端到端实测**：开发机上没有该区域的登录，代码路径与国内版共用，
  但国际版走的是订阅计费分支，未经真实账号验证。

## 源码

协议层复用自 DeepSeek Harness 插件 `@eghrhegpe/dsh-connect-qoder` 与 `dsh-connect-trae`
（均为 MIT），经由它们在 Pi coding agent 上的移植版。

本插件的完整源码（入口、面板、用量与签到、构建脚本）与 Pi 版共用同一个仓库：

**https://github.com/citie114514/pi-connect/tree/main/cyrene/ide-account-bridge**

相对协议层只改了三处：凭据与缓存根路径改为由宿主注入、移除 Pi 专属的 provider 注册、
用量与签到改为返回结构化数据。逐项归属与改动说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 目录内文件说明

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | 插件清单 |
| `index.cjs` | 入口（esbuild 打包的 CommonJS，自包含） |
| `panel/index.html`、`panel/panel.js` | 配置面板：由 `open()` 以 `BrowserWindow` 加载，展示各区域端点与模型、提供刷新/额度/签到按钮 |
| `THIRD_PARTY_NOTICES.md` | 上游 MIT 归属与改动说明 |

## 许可

MIT。
