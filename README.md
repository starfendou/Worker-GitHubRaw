# GitHub Raw 文件加速代理 (Cloudflare Worker 版本)

> 一个零依赖、可快速部署到 **Cloudflare Workers** 的 GitHub Raw 反向代理服务，支持私有仓库 Token、URL 随机分流、302 跳转等功能，适用于静态资源 CDN 加速场景。

---

## ✨ 功能特性

- 🔑 **私有仓库支持**：可使用 GitHub Token 直接访问私有仓库或提升速率限制。
- 🚀 **零冷启动**：基于 Workers 运行时，毫秒级响应，全球节点加速。
- 🔀 **多目标随机分流**：通过 `URL/URL302` 环境变量实现多源负载均衡或 302 跳转。
- 🔒 **目录级访问控制**：可通过 `AUTH_PATHS` + `secret` 查询参数保护敏感目录，验证失败将返回 404。
- 📝 **TypeScript 完全重写**：核心逻辑模块化，严格类型检查，易读易维护。

## 📦 目录结构

```text
.
├── src/                # Cloudflare Worker 源码
│   └── index.ts        # Worker 入口文件
├── test/               # Vitest 单元测试
├── worker-configuration.d.ts # Cloudflare 类型声明（自动生成）
├── wrangler.jsonc      # Wrangler 项目配置
├── vitest.config.mts   # 测试配置
└── tsconfig.json       # TypeScript 配置
```

## 🔧 环境依赖

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) / npm / yarn（任选其一）
- Cloudflare 账号 + [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler) >= 3

> **安全提示**：本仓库已在 `.gitignore` 中排除了 `.dev.vars` 文件 —— 这是 Wrangler 在本地 `wrangler dev` 时自动读取的环境变量清单。请将敏感凭据（如 `GH_TOKEN`）写入 `.dev.vars` 而非 `wrangler.jsonc`，以避免泄漏。

## ⚡ 快速开始

1. **克隆项目**

   ```bash
   git clone https://github.com/your-name/cdn-github-proxy-asset.git
   cd cdn-github-proxy-asset
   ```

2. **安装依赖**

   ```bash
   pnpm install      # 或 npm install / yarn install
   ```

3. **本地开发预览**

   ```bash
   # 自动监听 + 热更新
   pnpm dev          # 对应 "scripts": { "dev": "wrangler dev" }
   ```

4. **运行单元测试**

   ```bash
   pnpm test
   ```

5. **生产构建并发布**

   ```bash
   # 打包 & 上传至 Cloudflare Workers
   pnpm deploy       # 对应 "wrangler deploy"
   ```

> **提示**：首次部署前请先执行 `wrangler login` 完成 Cloudflare 授权。

## 🔐 环境变量/配置项

| 变量名      | 是否必需 | 默认值 | 说明 |
|-------------|---------|--------|------|
| `GH_NAME`   | 否      | -      | GitHub 用户/组织名，当请求路径未带全量 URL 时参与拼接 |
| `GH_REPO`   | 否      | -      | 仓库名 |
| `GH_BRANCH` | 否      | 默认分支 | 分支名 |
| `GH_TOKEN`  | 否      | -      | 用于私有仓库或 API 速率提升的 GitHub Token |
| `URL`       | 否      | -      | **根路径**(`/`) 请求时的反代目标列表，逗号/空格/换行分隔 |
| `URL302`    | 否      | -      | 与 `URL` 类似，但使用 302 重定向 |
| `ERROR`     | 否      | 无法获取文件... | GitHub 请求失败时返回的自定义文案 |
| `AUTH_PATHS`| 否      | - | 受保护目录 → 密钥映射表。<br/>格式示例：`"config":"abc123","secret-folder":"xyz789"` 或 `config:abc123,secret-folder:xyz789`。<br/>当请求路径以指定目录开头且未携带匹配查询参数 `secret=密钥` 时，Worker 将直接返回 404。|

### 🔄 动态内容替换功能

该功能允许在返回文件内容前，自动替换文件中的占位符为动态获取的值。适用于配置文件中需要动态注入数据库地址、API密钥、服务器配置等场景。

#### 工作流程

1. **文件请求** → Worker 接收到对特定文件的请求
2. **规则匹配** → 检查文件路径是否匹配 `REPLACE_CONFIG` 中的规则
3. **数据获取** → 从API获取动态值或使用静态配置
4. **内容替换** → 根据占位符模式替换文件中的变量
5. **返回结果** → 将处理后的内容返回给客户端

#### 配置说明

使用单个环境变量 `REPLACE_CONFIG` 配置所有替换规则，支持JSON格式的灵活配置：

```json
[
  {
    "files": ["/config/app.yml"],
    "mode": "env",
    "api": {
      "url": "https://api.example.com/config/",
      "headers": {"Authorization": "Bearer YOUR_TOKEN"}
    },
    "mappings": {
      "database_host": "data.database.host",
      "api_key": "data.keys.api"
    },
    "cache": 300
  }
]
```

#### 配置字段详解

| 字段 | 类型 | 说明 |
|------|------|------|
| `files` | string[] | 需要进行内容替换的文件路径列表，支持通配符 (*、?) |
| `mode` | string | 替换模式：`env`、`template`、`regex` |
| `pattern` | string | 可选，regex模式下的自定义正则表达式 |
| `api` | object | 可选，API数据源配置 |
| `api.url` | string | API请求地址 |
| `api.method` | string | 请求方法，默认GET |
| `api.headers` | object | 请求头 |
| `mappings` | object | 占位符到JSON路径的映射 |
| `static` | object | 可选，静态替换值（优先级高于API） |
| `onError` | string | 错误处理策略：`keep`、`remove`、`error` |
| `cache` | number | API响应缓存时间（秒） |

#### 文件路径匹配规则

- **精确匹配**：`/config/app.yml` - 仅匹配特定文件
- **通配符匹配**：
  - `/config/*` - 匹配 config 目录下的所有文件（不含子目录）
  - `/config/*.yml` - 匹配 config 目录下的所有 yml 文件
  - `/config/**/*` - 匹配 config 目录及其所有子目录下的文件
  - `/*/app.yml` - 匹配任意一级目录下的 app.yml 文件
  - `/config/app-?.yml` - 匹配如 app-1.yml、app-2.yml 等文件

#### 使用示例

1. **简单替换（使用静态值）**
   ```json
   [{
     "files": ["/config/app.yml"],
     "mode": "env",
     "static": {
       "version": "1.0.0",
       "environment": "production"
     }
   }]
   ```

2. **从API获取数据**
   ```json
   [{
     "files": ["/config/database.yml"],
     "mode": "env",
     "api": {
       "url": "https://api.example.com/config",
       "headers": {"Authorization": "Bearer TOKEN"}
     },
     "mappings": {
       "db_host": "database.host",
       "db_port": "database.port"
     },
     "cache": 600
   }]
   ```

3. **多组规则**
   ```json
   [
     {
       "files": ["/nginx.conf"],
       "mode": "template",
       "static": {"server": "example.com"}
     },
     {
       "files": ["/config/*.yml"],
       "mode": "env",
       "api": {"url": "https://api.example.com/settings"},
       "mappings": {"api_key": "keys.primary"}
     }
   ]
   ```

4. **自定义正则模式**
   ```json
   [{
     "files": ["/custom.conf"],
     "mode": "regex",
     "pattern": "\\$\\[([^\\]]+)\\]",
     "static": {
       "HOST": "localhost",
       "PORT": "8080"
     }
   }]
   ```

#### 替换模式说明

- **env模式**：替换 `${env:variable}` 格式的占位符
- **template模式**：替换 `{{variable}}` 格式的占位符  
- **regex模式**：使用自定义正则表达式匹配和替换

#### 高级特性

- **JSON路径访问**：支持嵌套对象和数组索引，如 `results.0.database_host`
- **缓存机制**：通过 `cache` 字段设置API响应缓存时间，减少请求频率
- **错误处理**：通过 `onError` 控制替换失败时的行为
- **优先级**：`static` 中的值优先于 `api` 获取的值

更多配置示例请参考 [replace-config-examples.md](replace-config-examples.md) 文件。

### 设置示例（`wrangler.jsonc` + `.dev.vars`）

```jsonc
{
  "env": {
    "production": {
      "vars": {
        "GH_NAME": "octocat",
        "GH_REPO": "Hello-World",
        "GH_BRANCH": "main",
        // 生产环境建议使用 wrangler secret put GH_TOKEN 注入 Secret
        "URL": "https://example.com/assets, https://fastly.example.com/assets",
        "ERROR": "文件拉取失败，请检查路径或权限！"
      }
    }
  }
}
```

> `.dev.vars` 示例参见 **.dev.vars.example**，复制并改名为 `.dev.vars` 后填写实际值即可，仅用于本地开发。

## 📥 请求示例

```text
# 公共仓库
https://your-worker.example.workers.dev/path/to/file.js

# 私有仓库（需在 Worker 环境变量中配置 GH_TOKEN）
https://your-worker.example.workers.dev/path/to/secret.js

# 受保护目录（需同时匹配 secret 参数）
https://your-worker.example.workers.dev/config/app.yml?secret=abc123
```

## 🧩 贡献指南

欢迎 PR 和 Issue！提交前请确保：

1. 代码通过 `pnpm lint` 及单元测试。
2. 遵循 **Conventional Commits** 提交规范。

## 📝 License

[MIT](LICENSE) © 2025 Zayrick