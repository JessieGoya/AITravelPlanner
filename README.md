# Web 版 AI 旅行规划师 (AI Travel Planner)

## 快速开始

### 使用 Docker Compose 一键部署

项目已经提供 `Dockerfile` 与 `docker-compose.yml`，可以在根目录直接构建并启动前后端：

```bash
docker compose up --build
docker-compose up -d --build
```

启动成功后：

- 前端入口：http://localhost:8080
- 后端健康检查：http://localhost:8081/actuator/health（Spring Boot 默认端点，如未开启可以忽略）

默认情况下，前端通过同源 `/api` 代理访问后端，无需额外配置。如需自定义后端地址，可在构建前设置 `VITE_BACKEND_URL` 环境变量。

### 本地开发

仍然可以分别启动前端（Vite）和后端（Spring Boot）：

```bash
# 前端
npm install
npm run dev

# 后端（在 backend-java 目录）
mvn spring-boot:run
```

开发模式下前端会直接请求 `http://localhost:8080` 的后端接口。
