# coding-plan-pro-max

> ⚠️ **声明**：这是学习 [opencode](https://github.com/anomalyco/opencode) 过程中的个人练手项目，不用于生产环境。

OpenAI 兼容的反向代理，支持**多 Key 轮换**和交互式 CLI。

`coding-plan-pro-max auth login` → 输入上游 URL 和 API Key → `coding-plan-pro-max start` → 完成。代理将标准的 `/v1/chat/completions` 请求转发到任意 OpenAI 兼容的上游，配额耗尽时自动切换 Key。

## 快速开始

```bash
# 1. 安装
npm install

# 2. 登录（交互式 — 引导输入 URL 和 Key）
npx tsx src/index.ts auth login

# 3. 启动代理
npx tsx src/index.ts start

# 或者编译后运行：
npm run build
npm start          # 执行 "node dist/index.js start"
```

## CLI 命令

```
coding-plan-pro-max auth login    交互式配置上游 URL 和 API Key
coding-plan-pro-max auth logout   删除已保存的凭证
coding-plan-pro-max auth status   查看当前认证状态并测试连接
coding-plan-pro-max start         启动代理服务器
coding-plan-pro-max --help        显示帮助
```

## 配置

### 交互式（推荐）

```bash
coding-plan-pro-max auth login
# 会提示输入：
#   1. 上游 API 基础 URL
#   2. API Key（逗号分隔支持多个）
# 自动验证连接，保存到 ~/.config/coding-plan-pro-max/credentials
```

### 环境变量（CI / 自动化）

| 变量 | 必填 | 说明 |
|------|------|------|
| `API_KEY` | 是* | 一个或多个 API Key，逗号分隔 |
| `UPSTREAM_BASE_URL` | 是* | 上游 API 基础 URL |
| `PORT` | 否 | 服务端口（默认 `3000`，范围 1–65535） |
| `COOLDOWN_MS` | 否 | 耗尽 Key 的冷却时间（默认 `18000000` = 5 小时） |

\* 除非已通过 `coding-plan-pro-max auth login` 设置。

### 配置优先级

1. 环境变量（最高优先级 — CI/CD）
2. 凭证文件（`~/.config/coding-plan-pro-max/credentials`）
3. 当前目录的 `.env` 文件（向后兼容）
4. 默认值

### 凭证存储

凭证保存在 `~/.config/coding-plan-pro-max/credentials`（JSON 格式，文件权限 `0600`）。Key 不会被日志记录或在 API 响应中暴露（健康检查端点只显示前 8 位字符）。

### 支持的提供商

查看 **[PROVIDERS.md](PROVIDERS.md)** 获取各主流 Coding Plan 提供商的 API Base URL 列表（智谱、豆包、DeepSeek、Kimi、硅基流动、OpenRouter、OpenAI、Anthropic、Google、通义千问、MiniMax）。

## 多 Key 轮换

配置多个 API Key 时，代理会：

1. **轮询调度** — 将请求均匀分配到各个 Key。
2. **配额耗尽自动切换** — HTTP 429 或 403 含配额关键词 → Key 进入冷却，立即尝试下一个。
3. **冷却恢复** — 经过 `COOLDOWN_MS` 后 Key 重新可用。
4. **全部耗尽返回 503** — 所有 Key 在冷却期 → 返回 `503` + `proxy_error`。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/` | 健康检查 + Key 池状态 |
| `GET` | `/v1/models` | 模型列表（从上游代理） |
| `POST` | `/v1/chat/completions` | 聊天补全（流式 / 非流式） |

Provider 前缀自动去除：`provider/model-name` → `model-name`。

### 使用 OpenAI SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="any-value",  # 代理会注入真实的 API Key
    base_url="http://localhost:3000/v1",
)

response = client.chat.completions.create(
    model="model-name",
    messages=[{"role": "user", "content": "你好"}],
    stream=True,
)
```

## 脚本命令

```bash
npm run dev          # 开发服务器（热重载）
npm run build        # 编译 TypeScript → dist/
npm start            # 运行编译后的 CLI
npm run typecheck    # 仅类型检查
```

## 测试

```bash
# 启动服务后：
./test.sh                # 默认 http://localhost:3000
./test.sh http://host:port  # 自定义地址
```

## 架构

```
src/
  index.ts           CLI 入口（commander）
  credentials.ts     凭证存储（XDG 路径，chmod 600）
  config.ts          配置加载（env > credentials > .env > 默认值）
  server.ts          Hono 应用 + 优雅关闭
  key-pool.ts        轮询 Key 选择、冷却追踪
  proxy.ts           请求处理器含重试逻辑
  commands/
    auth-login.ts    交互式登录
    auth-logout.ts   清除凭证
    auth-status.ts   显示连接状态
    start.ts         启动代理服务器
```

请求流：

```
客户端 → /v1/chat/completions
       → 校验输入
       → 去除模型前缀
       → 从 Key 池选取 Key
       → 携带 Bearer Token 转发到上游
       → 遇到 429/403-配额错误：标记 Key 耗尽，用下一个 Key 重试
       → 透传响应（SSE 或 JSON）回客户端
```

## 错误响应

所有错误遵循 OpenAI 格式：`{ "error": { "message", "type" } }`

| 状态码 | 类型 | 原因 |
|--------|------|------|
| 400 | `invalid_request_error` | 缺少/无效的 `model`、空的 `messages`、JSON 格式错误 |
| 502 | `proxy_error` | 上游不可达或返回空响应 |
| 503 | `proxy_error` | 所有 API Key 均已耗尽（全部在冷却中） |

## 许可证

[Apache-2.0](LICENSE)
