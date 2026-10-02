# 审核清单（review-checklist）

维护者收录插件时的逐项检查表。提交者也可在提 PR 前用它自查。全部通过才能合并。

---

## 一、结构检查

- [ ] 目录名与 `manifest.json` 的 `id` 一致，全小写连字符
- [ ] 目录内只有：`manifest.json` + 入口文件（`index.cjs`/`index.js`/`index.mjs`）+ `README.md` + 插件自带资源（如 `ui.html`、图片等，需在 PR 里说明用途），没有源码工程文件
- [ ] `registry.json` 已登记该插件，字段与 manifest 一致（id、name、version、description、author）
- [ ] README「已收录插件」表格已添加（或更新）对应行，版本与简介和 manifest 一致
- [ ] 单插件单 PR
- [ ] 提交者未上传 ZIP（ZIP 一律由维护者从审核过的源码打包）

---

## 二、manifest 校验

- [ ] `apiVersion` 为 `1`
- [ ] `version` 是严格 SemVer（三段式）
- [ ] `entry` 是裸文件名，无子目录、无 `..`，扩展名受支持
- [ ] `deps` 只含已知能力值，且逐项确认用途合理（最小权限）
- [ ] 如声明 `icon`：文件存在、格式与大小合规（≤2MiB），内容无问题

## 三、代码安全检查

- [ ] 无 `eval` / `new Function` / `vm` 模块
- [ ] 无动态 `require`（变量拼接模块路径）
- [ ] 无混淆或压缩到不可读的产物（正常 minify 可接受，需在 PR 说明）
- [ ] 网络访问点逐个确认：目标域名、传输内容、是否包含用户数据
- [ ] 文件读写逐个确认：只读写自己目录或用户明确授权路径；不得触碰 Cyrene 数据目录之外的敏感位置
- [ ] 如启动子进程：确认启动的是什么、参数是否来自用户输入
- [ ] 密钥处理：API key 只经 `ctx.deps.secrets` 存取，不落明文文件、不打进日志
- [ ] 不监听宿主 `host:*` 事件之外的可疑事件、不伪造其他插件事件
- [ ] 无定时器/子进程泄漏：停用后能干净退出（`unregister` 可重复调用）

## 四、契约检查

- [ ] 所有工具 id 以 `<插件id>_` 为前缀
- [ ] 工具的 `risk` 声明与实际行为一致（如声明只读就不得有写操作）
- [ ] 申请的 `deps` 与实际使用一一对应
- [ ] 私有 IPC 通道名合法（字母数字 `.` `_` `-`，≤64 字符）
- [ ] 错误处理走稳定错误码分支，不吞异常

## 五、产物检查

- [ ] 入口产物自包含：在空目录 `require` 入口文件不抛 `MODULE_NOT_FOUND`
- [ ] 用 SDK 的 `createMockPluginContext()` 冒烟：`register(ctx)` 正常执行，注册的工具/提示词数量与 README 描述一致
- [ ] 包体积合理（含二进制资源时逐个说明用途）

## 六、文档检查

- [ ] README 说清：功能、启用方式、配置项、网络/存储行为
- [ ] 有已知限制或风险时如实披露

---

## 七、发布流程（维护者）

审核通过并合并 PR 后，按下面的顺序发布。**ZIP 一律由维护者从审核过的 `plugins/<插件id>/` 源码打包，不接受提交者上传的包。**

### 1. 打包

在仓库根目录把插件目录整体压成 ZIP，**保留一层插件目录**（与 GitHub 「Download ZIP」形态一致，宿主导入逻辑依赖这个层级）：

```powershell
Compress-Archive -Path plugins/<插件id> -DestinationPath zips/<插件id>-<版本>.zip -Force
```

核对 `zips/<插件id>-<版本>.zip` 解出的内容与 `plugins/<插件id>/` 完全一致（自包含检查见「五、产物检查」）。

### 2. 放行 ZIP 入库

`zips/` 默认整体忽略，只放行 registry 当前正在分发的版本。在 `.gitignore` 的 `zips/*` 白名单里为这个新包加一行：

```gitignore
!zips/<插件id>-<版本>.zip
```

发新版时把上一版的白名单行删掉，避免历史包继续占用仓库体积。

### 3. 回写索引与直链

- `registry.json`：该条目的 `version` 改为新版本，补 `zip` 与 `sha256`，并把 `downloads` 置 `0`（缺失该字段的条目会被市场客户端整条丢弃）；顶层 `updatedAt` 改为当天
- README「已收录插件」表格：更新该行的版本与简介，并把「直接下载」列填成 ZIP 链接

`zip` 字段与 README 直链统一使用 **Gitee raw 直链**（客户端主源在 Gitee，且 GitHub 大文件下载不稳定）：

```text
https://gitee.com/playa0/cyrene-plugins/raw/main/zips/<插件id>-<版本>.zip
```

`sha256` 用下面命令生成，全小写：

```powershell
(Get-FileHash zips/<插件id>-<版本>.zip -Algorithm SHA256).Hash.ToLowerInvariant()
```

### 4. 提交并推送

```powershell
git add zips/<插件id>-<版本>.zip registry.json README.md .gitignore
git commit -m "发布 <插件id> <版本>：补 registry 下载地址与 README 直链"
git push origin HEAD:main
```

### 5. 同步 Gitee 并校验

**Gitee 镜像只在每天北京时间 04:00 由 Actions 自动同步**，刚推完直链会 404。想立刻生效就手动触发一次：

```powershell
gh workflow run aggregate-downloads.yml --repo Playa-Cyrene/Cyrene-Plugins
```

同步完成后从 Gitee 拉回 ZIP 校验，确认镜像与本地一致再算发布完成：

```powershell
Invoke-WebRequest "https://gitee.com/playa0/cyrene-plugins/raw/main/zips/<插件id>-<版本>.zip" -OutFile "$env:TEMP\verify.zip"
(Get-FileHash "$env:TEMP\verify.zip" -Algorithm SHA256).Hash.ToLowerInvariant()
```

### 说明

- `scripts/publish-plugins.ps1` 是早期的 GitHub Release 方案，与现行的 Gitee 直链分发不一致，**不要再执行**（它会把 `zip` 写成 Release 附件地址）
- `scripts/aggregate-downloads.mjs` 统计的是 GitHub Release 附件下载次数，仓库改用 Gitee 直链后该口径已失效，`downloads` 目前只是占位字段

---

## 审核记录模板（贴进 PR）

```text
审核人：
日期：
插件：<id>@<version>
结构检查：通过/不通过（备注）
manifest 校验：通过/不通过
代码安全：通过/不通过（网络/文件/子进程逐项备注）
契约检查：通过/不通过
产物检查：通过/不通过
文档检查：通过/不通过
结论：收录 / 退回 / 需修改
```
