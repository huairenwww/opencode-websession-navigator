# OpenCode Session Navigator

左侧列出 OpenCode sessions 和每次用户消息，支持按消息文本搜索、显示发送日期；点击消息会跳到对应的 `message-<id>` 锚点。右侧嵌入 OpenCode Web。

## 启动

```bash
npm install
npm start
```

访问：

```text
http://127.0.0.1:8093
```

默认配置：

```text
PORT=8093
OPENCODE_URL=http://127.0.0.1:9966
OPENCODE_DIRECTORY=当前工作目录
```

可通过环境变量覆盖：

```bash
PORT=8093 OPENCODE_URL=http://127.0.0.1:9966 OPENCODE_DIRECTORY=/path/to/your/project npm start
```

后端使用官方 `@opencode-ai/sdk` 获取 sessions 和 messages，浏览器不直接跨端口调用 API。
