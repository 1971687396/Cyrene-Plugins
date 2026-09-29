# 第三方归属声明（THIRD_PARTY_NOTICES）

本插件的协议层不是原创实现，而是从以下两个 MIT 许可项目复用而来。二者各自又是
DeepSeek Harness 插件的移植版，本插件复用的是它们经过实测的协议核心。

## dsh-connect-qoder（Qoder 协议层）

- 上游插件：`@eghrhegpe/dsh-connect-qoder`（DeepSeek Harness 插件）
- 本插件复用的部分：`lib/qoder/lib/` 下的凭据读取（OSCrypt/DPAPI）、COSY 签名与
  body 编码、回环 shim、模型目录、额度与签到逻辑
- 许可：MIT
- 出处：见 <https://www.npmjs.com/package/@eghrhegpe/dsh-connect-qoder>

本插件在其之上改动了三处，均为宿主适配：

1. 凭据副本与目录缓存的根路径改为由宿主注入（Cyrene 的插件存储目录），不再写死 `~/.pi`。
2. 移除了 Pi 专属的模型描述符与 provider 注册（`toPiModel` 保留但不再使用）。
3. 用量/签到从「调用 Pi 的 UI」改为返回结构化数据，由面板与工具各自渲染。

## dsh-connect-trae（Trae 协议层）

- 上游插件：`dsh-connect-trae`（DeepSeek Harness 插件）
- 本插件复用的部分：`lib/trae/lib/trae-core.js`（从 DSH bundle 手术提取的协议核心）——
  凭据存储与刷新、设备身份、回环 shim、SOLO 上游协议、远程模型目录、SSE 桥、
  额度与签到客户端
- 许可：MIT
- 出处：见 <https://www.npmjs.com/package/dsh-connect-trae>

本插件在其之上改动了三处：

1. `setTraeOwnDir()` 新增：插件自有凭据副本的根路径可注入，默认仍是 `~/.pi` 路径
   以保持 Pi 端行为不变。
2. 移除了 Pi 专属的 provider 注册与 `@earendil-works/pi-ai` 依赖。
3. 用量/签到同样改为返回结构化数据。

## 许可

上述两部分的原始 MIT 许可与版权声明随本文件保留。本插件自身的适配层同样以 MIT 发布。
