# Web 版 AI 旅行规划师 (AI Travel Planner)

GitHub repo 地址:

https://github.com/JessieGoya/AITravelPlanner

## 快速开始

### 环境要求
- Node.js 18+、npm 9+（本地开发时需要）。
- Java 17+、Maven 3.9+（运行 Spring Boot 后端）。
- Docker 24+（使用一键部署时需要）。

### 使用 Docker Compose 一键部署

项目提供 `Dockerfile` 与 `docker-compose.yml`，在项目根目录执行：

```bash
docker compose up --build
```

启动成功后：
- 前端入口：http://localhost:8080
- 后端：http://localhost:8081/ （“测试按钮仅用于测试是否能正常运行”）

默认情况下，前端通过同源 `/api` 代理访问后端，无需额外配置。如需自定义后端地址，可在构建前设置 `VITE_BACKEND_URL` 环境变量。

### 本地开发

前端与后端可独立启动，便于断点调试：

```bash
# 1. 启动前端 (Vite)
npm install
npm run dev

# 2. 启动后端 (Spring Boot)
cd backend-java
mvn spring-boot:run
```

开发模式下前端会请求 `http://localhost:8080/api`，可在 `.env.development` 里重写 `VITE_BACKEND_URL` 以对接远程后端。

### 仅运行后端

```bash
cd backend-java
mvn spring-boot:run
```

后端默认监听 `8080` 端口，可通过 `server.port` 重写；对外提供 `/api/llm/chat` 代理接口。

## 部署说明
部署前需要在 `./public` 下的 `ai-travel-planner-config.json` 文件中填写LLM、Supabase等的配置信息。

- **生产构建**：执行 `npm run build` 生成 `dist/`，由根目录 `Dockerfile` 拷贝至 Nginx 镜像；后端独立通过 Maven 构建 `jar`。
- **反向代理**：`nginx.conf` 将前端静态文件服务在 `80` 端口，转发 `/api` 到 `backend:8080`，保持同源调用。
- **环境变量**：可在打包阶段注入 `VITE_BACKEND_URL`、`VITE_SUPABASE_URL` 等变量，或部署前在 `./public` 下的 `ai-travel-planner-config.json` 文件中填写LLM和地图等的配置信息，也可以在进入页面后在设置页面动态设置 LLM 与地图 Key。
- **Supabase 集成**：部署前在 `./public` 下的 `ai-travel-planner-config.json` 文件中填写 Supabase URL、Anon Key（可选 Service Role Key），即可启用云端表 `travel_plans`、`user_preferences`、`budget_records` 等。

## 配置说明
- 所有运行时配置存储在浏览器 `localStorage` 的 `runtime_config_v1` 字段，可在 Settings 页面查看、导入、导出。
- 必填配置：
  - LLM：Base URL（兼容 OpenAI 格式，如阿里通义兼容模式）、API Key、模型名称。
  - 地图：选择地图服务商并填入对应 Key；OpenStreetMap 模式无需 Key。
  - Supabase：填写 URL 与匿名 Key 后即可启用云端同步，留空则使用本地模式。
- 前端会在调用 LLM 或地图服务前检测配置，缺失时在 UI 里提示。

## 项目介绍
- 基于 React + Spring Boot 的全栈旅行助手，集成大模型生成功能、预算管理和地图可视化。
- 前端内置语音输入、Markdown 渲染和多地图适配，支持高德、百度与 OpenStreetMap。
- 后端通过统一的 `/api/llm/chat` 接口代理第三方 LLM，内置超时与重试控制，方便快速扩展模型供应商。
- 支持 Supabase 云端同步，也兼容纯本地存储，满足演示与生产两种场景。

### 核心技术栈
- 前端：React 18、Vite、React Router、Web Speech API、Leaflet / 高德 / 百度地图 SDK。
- Markdown & 富文本：自定义 MarkdownPreview 组件、语义化 UI 卡片布局。
- 数据与状态：浏览器 `localStorage / sessionStorage`、Supabase JS SDK、本地 Supabase 兼容层。
- 后端：Spring Boot 3、RestTemplate、Apache HttpClient5、Docker/Nginx 反向代理。

## 功能概览

### 智能行程规划 (`src/pages/Planner.jsx`)
- 支持目的地、天数、预算、同行人数与旅行偏好等多维度输入，可通过语音快速录入（Web Speech API 自动加标点）。
- 调用大模型生成逐日行程，解析并渲染 Markdown，自动提取景点与路线。
- 内置行程存档、草稿自动保存、偏好同步；可选择驾车、步行、公交等路线策略。

### 费用管理与 AI 分析 (`src/pages/Budget.jsx`)
- 记录每日出行费用、分类统计和预算余额提示，支持语音输入快速生成账目。
- 可选 LLM 分析功能，一键生成支出结构总结与优化建议。
- 支持云端保存历史预算，提供最后同步时间并可反复加载。

### 地图可视化与导航 (`src/shared/MapView.jsx`)
- 动态加载对应地图 SDK，自动选择适配的瓦片服务，解析地点后批量绘制彩色标记。
- 支持行政区过滤、路线规划（驾车/步行/公交）与地图状态持久化。
- 提供地图快照缓存与失败回退策略，提升大模型解析不稳定时的用户体验。

### 用户体系与资料管理 (`src/pages/Login.jsx`, `src/pages/Profile.jsx`)
- 提供本地模拟登录 & Supabase 真正认证的双模式，兼容演示与上线。
- 用户资料、偏好设置、行程与预算记录均可在登录后同步到 Supabase。
- Profile 页面支持偏好分类、云端导入/导出、自定义偏好标签。

### 配置中心 (`src/pages/Settings.jsx`)
- 在浏览器侧保存所有运行配置：LLM Base URL/Key/模型、地图服务商与 Key、预算币种、Supabase 连接信息。
- 提供导入导出、重置、云端配置保存等操作；敏感信息仅保存在客户端，不进入仓库。

## 目录结构

```
.
├─ docker-compose.yml        # 前后端一体化部署编排
├─ Dockerfile                # 构建前端 + Nginx 静态站点
├─ nginx.conf                # Nginx 反向代理与静态资源配置
├─ backend-java/             # Spring Boot 后端
│  ├─ src/main/java/com/ai/travel/web/ApiController.java
│  └─ src/main/resources/application.yml
└─ src/                      # 前端源码 (React + Vite)
   ├─ App.jsx                # 路由与整体布局
   ├─ pages/                 # 功能页面 (Planner/Budget/Settings/Login/Profile)
   ├─ services/              # LLM、Supabase、配置、解析等业务模块
   └─ shared/                # 地图、语音输入、Markdown 等共享组件
```

欢迎根据业务需求扩展模块，并在提交前运行 `npm run build` 与后端测试，确保部署一致性。
