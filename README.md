# AI Website

一个可直接运行的 AI 聊天网站，包含：
- 前端聊天界面（移动端和桌面端适配）
- Node.js 后端代理调用 Anthropic Claude API（不在前端暴露 key）

## 1) 配置环境变量

创建 `.env` 文件（可复制 `.env.example`）：

```env
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
PORT=3000
```

## 2) 启动

```bash
npm start
```

打开 `http://localhost:3000`

## 3) 推送到 GitHub

```bash
git add .
git commit -m "feat: create AI website"
git push -u origin main
```
