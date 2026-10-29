# 配置说明

开发时使用未提交的 `.dev.vars`；生产时使用托管平台的运行时变量和密钥设置。

| 变量 | 用途 |
| --- | --- |
| `APP_ORIGIN` | 允许写入请求的站点来源，如 `https://your-site.example`。未设置时使用当前站点来源；本机预览仍只运行在本机。 |
| `AI_ALLOWED_EMAIL` | 允许使用模型额度的空间主人邮箱。 |
| `AI_PROVIDERS_JSON` | 模型服务配置列表。 |
| `DEEPSEEK_API_KEY` | 示例 DeepSeek 模型密钥，可选联网搜索也读取该变量。 |
| `OPENAI_API_KEY` | 可选 OpenAI 服务密钥。 |
| `CLAUDE_API_KEY` | 可选兼容服务的密钥，在配置中指定对应 `keyEnv`。 |
| `COURSE_IMPORT_OWNER_EMAIL` | 可选课程目录导入的主人邮箱，也是旧缓存归属判断的配置来源之一。 |
| `COURSE_IMPORT_JSON` | 可选初始课程目录，遵循学习快照格式；不要公开私人课程内容。 |
| `QUARK_ALLOWED_EMAIL` | 允许使用个人夸克归档的邮箱。 |
| `QUARK_AUTH_JSON` | 自己通过授权流程取得的网盘配置，包括令牌与根目录信息。 |
| `QUARK_ENCRYPTION_KEY` | 加密网盘令牌的 AES-GCM 密钥，Base64 编码的 32 字节随机值。 |

## 模型配置结构

```json
[
  {
    "id": "deepseek",
    "label": "DeepSeek",
    "baseURL": "https://api.deepseek.com/v1",
    "protocol": "chat",
    "keyEnv": "DEEPSEEK_API_KEY",
    "models": [{"id": "deepseek-flash", "label": "DeepSeek Flash", "vision": true}]
  }
]
```

模型 ID、图片能力必须按服务商实际能力填写。示例不是服务商可用模型清单。当前地址白名单见 `lib/ai-providers.ts`。配置支持 `chat` 与 `responses` 两类协议；PDF 原件直读只对声明支持 PDF 的 `responses` 模型启用。

默认模型优先匹配当前实现中的 DeepSeek Flash ID，其他情况回退到可用模型。快速、标准、深入会改变思考参数和输出预算。

## 夸克归档

不配置夸克时，学习记录仍可保存到 D1 / R2。网盘归档是额外的原件保存能力，对话附件出现不等于归档成功。

仓库不包含网盘令牌。授权需使用自己具备权限的夸克接口配置；令牌在服务端加密保存。
