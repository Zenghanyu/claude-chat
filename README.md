# Claude Chat

移动端友好的 Claude AI 对话网页应用，**纯静态版本**——无需服务器，部署到 GitHub Pages 后可在任何地方（手机、电脑）随时访问。

## 功能

- **流式输出** — 打字机效果，实时显示回复
- **多会话管理** — 创建、切换、删除对话，自动命名
- **Markdown 渲染** — 代码高亮、表格、列表等完整支持
- **代码一键复制**
- **模型选择** — Sonnet 4.6（默认）/ Opus 4.6 / Haiku 4.5
- **系统提示词** — 自定义 Claude 的行为
- **移动端适配** — 响应式布局，手机直接使用
- **无需服务器** — 纯 HTML/CSS/JS，浏览器直接调用 API

## 部署到 GitHub Pages（推荐）

### 第一步：推送到 GitHub

```bash
cd ~/claude-chat
git init
git add index.html css/ js/ README.md .gitignore
git commit -m "Initial Claude Chat"
git remote add origin https://github.com/你的用户名/claude-chat.git
git push -u origin main
```

### 第二步：开启 GitHub Pages

1. 进入 GitHub 仓库页面
2. 点击 **Settings** → **Pages**
3. Source 选择 `main` 分支，目录选 `/ (root)`
4. 点击 **Save**

几分钟后即可通过 `https://你的用户名.github.io/claude-chat` 访问。

### 第三步：在手机上使用

1. 用手机浏览器打开上面的 GitHub Pages 链接
2. 点击右上角 ⚙️，输入您的 [Anthropic API Key](https://console.anthropic.com/keys)
3. 保存后即可开始对话

> **提示**：可以将网页"添加到主屏幕"，像 App 一样使用。

## 本地测试

直接双击 `index.html`，或用任意 HTTP 服务器：

```bash
# Python
python3 -m http.server 8000

# Node.js
npx serve .
```

然后打开 http://localhost:8000

## 项目结构

```
claude-chat/
├── index.html       # 单页应用
├── css/
│   └── style.css    # 深色主题样式
├── js/
│   └── app.js       # 前端逻辑（直接调用 Claude API）
└── README.md
```

## 技术栈

- **纯原生** HTML / CSS / JavaScript，无框架无构建工具
- **Markdown**: marked.js + highlight.js + DOMPurify（CDN 加载）
- **API**: 浏览器 `fetch` 直接调用，SSE 流式解析
