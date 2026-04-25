# Coding Plan Providers Reference

A curated list of Coding Plan API endpoints from major AI providers. All endpoints are OpenAI-compatible (`/v1/chat/completions`).

> **Note**: Coding Plan API keys and base URLs are usually separate from standard pay-as-you-go APIs. Obtain them from each provider's platform.

---

## Zhipu GLM (智谱)

| Region | Base URL |
|--------|----------|
| China | `https://open.bigmodel.cn/api/coding/paas/v4` |
| Global | `https://api.z.ai/api/coding/paas/v4` |

- **Auth**: `Authorization: Bearer {api_key}` (same key as standard API)
- **Models**: `glm-5.1`, `glm-5`, `glm-5-turbo`, `glm-4.7`, `glm-4.6`, `glm-4.5`, `glm-4.5-air`
- **Get API key**: [open.bigmodel.cn](https://open.bigmodel.cn)

---

## Doubao / Volcengine (豆包 / 火山引擎)

| Region | Base URL |
|--------|----------|
| China | `https://ark.cn-beijing.volces.com/api/coding/v3` |

- **Auth**: `Authorization: Bearer {api_key}` (same key as standard API)
- **Models**: `Doubao-Seed-2.0-Code`, `Doubao-Seed-2.0-pro`, `Doubao-Seed-2.0-lite`, `Doubao-Seed-Code`
- **Also hosts**: `MiniMax-M2.5`, `Kimi-K2.5`, `GLM-4.7`, `DeepSeek-V3.2` (via Volcengine Coding Plan)
- **Get API key**: [console.volcengine.com/ark](https://console.volcengine.com/ark)

---

## Kimi / Moonshot AI (月之暗面)

| Region | Base URL | Protocol |
|--------|----------|----------|
| China | `https://api.moonshot.cn/anthropic` | Anthropic-compatible |
| Global | `https://api.moonshot.ai/anthropic` | Anthropic-compatible |
| Coding | `https://api.kimi.com/coding/v1` | Kimi native / OpenAI-compatible |

- **Auth**: `x-api-key: {api_key}` (Anthropic) or `Authorization: Bearer {api_key}` (OpenAI)
- **Models**: `kimi-k2.5`, `kimi-k2-turbo-preview`, `k2p5`
- **Get API key**: [platform.moonshot.cn](https://platform.moonshot.cn)

---

## DeepSeek

| Region | Base URL | Protocol |
|--------|----------|----------|
| Global | `https://api.deepseek.com` | OpenAI-compatible |
| Global | `https://api.deepseek.com/anthropic` | Anthropic-compatible |

- **Auth**: `Authorization: Bearer {api_key}`
- **Models**: `deepseek-chat`, `deepseek-reasoner`
- **Get API key**: [platform.deepseek.com](https://platform.deepseek.com)

> DeepSeek does not have a separate "coding plan" endpoint — the same base URL serves all tiers.

---

## SiliconFlow (硅基流动)

| Region | Base URL |
|--------|----------|
| Global | `https://api.siliconflow.com/v1` |

- **Auth**: `Authorization: Bearer {api_key}`
- **Models**: `deepseek-ai/DeepSeek-R1`, `Qwen/Qwen3-235B-A22B`, and many others
- **Get API key**: [cloud.siliconflow.cn](https://cloud.siliconflow.cn)

> SiliconFlow aggregates multiple open-source models under one API. No separate coding plan endpoint.

---

## OpenRouter

| Region | Base URL |
|--------|----------|
| Global | `https://openrouter.ai/api/v1` |

- **Auth**: `Authorization: Bearer {api_key}`
- **Models**: Aggregates 200+ models from DeepSeek, Qwen, Moonshot, Zhipu, MiniMax, ByteDance, Mistral, and more
- **Get API key**: [openrouter.ai](https://openrouter.ai)

> OpenRouter is a meta-provider — single API key, access models from all providers.

---

## OpenAI

| Region | Base URL |
|--------|----------|
| Global | `https://api.openai.com/v1` |

- **Auth**: `Authorization: Bearer {api_key}`
- **Coding models**: `gpt-4o`, `o3`, `o4-mini`, `codex-mini`
- **Get API key**: [platform.openai.com](https://platform.openai.com)

---

## Anthropic (Claude)

| Region | Base URL |
|--------|----------|
| Global | `https://api.anthropic.com/v1` |

- **Auth**: `x-api-key: {api_key}` + `anthropic-version: 2023-06-01`
- **Coding models**: `claude-sonnet-4-20250514`, `claude-opus-4-20250514`
- **Get API key**: [console.anthropic.com](https://console.anthropic.com)

> Anthropic uses a different protocol (Messages API, not `/chat/completions`). For OpenAI-compatible access, use a proxy or gateway that translates the protocol.

---

## Google Gemini

| Region | Base URL |
|--------|----------|
| Global | `https://generativelanguage.googleapis.com/v1beta/openai` |

- **Auth**: `Authorization: Bearer {api_key}` (or `?key={api_key}`)
- **Coding models**: `gemini-2.5-pro`, `gemini-2.5-flash`
- **Get API key**: [aistudio.google.com](https://aistudio.google.com)

---

## Alibaba Qwen / Tongyi (通义千问)

| Region | Base URL |
|--------|----------|
| China | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

- **Auth**: `Authorization: Bearer {api_key}`
- **Models**: `qwen3-235b-a22b`, `qwen-max`, `qwq-plus`
- **Get API key**: [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com)

---

## MiniMax

| Region | Base URL |
|--------|----------|
| China | `https://api.minimax.chat/v1` |
| Global | `https://api.minimaxi.chat/v1` |

- **Auth**: `Authorization: Bearer {api_key}`
- **Models**: `MiniMax-M1`, `MiniMax-M2.5`
- **Get API key**: [platform.minimaxi.com](https://platform.minimaxi.com)

---

## Quick Reference for `coding-plan-pro-max auth login`

When prompted for "upstream API base URL", use the **Base URL** from the table above. Examples:

```bash
# Zhipu GLM Coding Plan (China)
https://open.bigmodel.cn/api/coding/paas/v4

# Zhipu GLM Coding Plan (Global)
https://api.z.ai/api/coding/paas/v4

# Doubao / Volcengine Coding Plan
https://ark.cn-beijing.volces.com/api/coding/v3

# DeepSeek
https://api.deepseek.com

# SiliconFlow
https://api.siliconflow.com/v1

# OpenRouter
https://openrouter.ai/api/v1

# Kimi Coding
https://api.kimi.com/coding/v1
```
