# Trip3D 意大利旅行导览

基于 React、Vite 和 CesiumJS 的意大利旅行规划与 3D 驾驶导览项目。项目包含景点筛选、路线规划、行程导出、账户状态，以及使用 Cesium World Terrain、全球影像和 OSM Buildings 的 3D 地图。

## 快速启动

### 环境要求

- Node.js `20.19+` 或 `22.12+`
- npm
- 一个 [Cesium ion](https://ion.cesium.com/) Access Token

克隆并安装依赖：

```powershell
git clone <repository-url>
cd web3d-project
npm install
```

复制前端环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

编辑 `.env.local`：

```env
VITE_CESIUM_ION_TOKEN=your-cesium-ion-token
VITE_API_BASE_URL=http://127.0.0.1:8000
```

启动前端：

```powershell
npm run dev
```

如果 PowerShell 阻止执行 `npm.ps1`，改用：

```powershell
npm.cmd run dev
```

访问：

```text
http://127.0.0.1:5173/
```

仅启动前端也可以浏览主页和使用 3D 导览。路线规划会优先请求本地后端；后端不可用时，会尝试直接请求公共 OSRM 服务。

## Cesium 配置

3D 导览必须配置 `VITE_CESIUM_ION_TOKEN`。Token 用于加载：

- Cesium World Terrain
- 全球影像
- Cesium OSM Buildings

### 创建和配置 Token

1. 打开 [Cesium ion](https://ion.cesium.com/) 并注册或登录账户。
2. 进入 **Access Tokens** 页面。
3. 点击 **Create token** 创建新的访问令牌。
4. 为 Token 填写容易识别的名称，例如 `Trip3D Local Development`。
5. 在权限设置中允许读取 ion 资源。项目需要访问：
   - Cesium World Terrain
   - Cesium World Imagery
   - Cesium OSM Buildings，ion Asset ID 为 `96188`
6. 保存后复制生成的 Token 字符串。

首次本地开发建议先不要设置 URL/域名限制，确认地图能够正常加载后，再按需要限制允许来源。需要限制时至少加入：

```text
http://127.0.0.1:5173
http://localhost:5173
```

部署后还要加入正式站点来源，例如：

```text
https://example.com
```

### 写入项目配置

如果还没有 `.env.local`，先复制模板：

```powershell
Copy-Item .env.example .env.local
```

将复制的 Token 写入 `.env.local`，不要添加引号：

```env
VITE_CESIUM_ION_TOKEN=eyJhbGciOi...
VITE_API_BASE_URL=http://127.0.0.1:8000
```

环境变量由 Vite 在启动时读取，因此修改后必须停止并重新启动开发服务器：

```powershell
npm run dev
```

进入 3D 导览后，如果能看到真实卫星影像、地形起伏和建筑，则配置成功。

`.env.local` 已被 Git 忽略。不要把真实 Token 写入源码、README、聊天截图或提交记录。前端 Token 最终会发送到浏览器，因此生产环境应使用最小读取权限和来源限制，不能将它当作后端密钥使用。

Vite 在生产构建时会自动复制 Cesium 的 `Workers`、`Assets`、`Widgets` 和 `ThirdParty` 静态资源，无需手动复制。

## 完整后端

后端基于 FastAPI。它提供账户、路线代理、景点、点评和 PostgreSQL 数据接口。

### 安装 Python 依赖

推荐使用 Python `3.11+`。现有 PowerShell 脚本默认使用名为 `web3d-backend` 的 Conda 环境：

```powershell
conda create -n web3d-backend python=3.11
conda run -n web3d-backend pip install -r backend/requirements.txt
```

不使用 Conda 时也可以自行创建虚拟环境并运行：

```powershell
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

此方式未配置 PostgreSQL 时会使用本地 SQLite 保存账户数据。

### PostgreSQL 模式

创建数据库和用户：

```sql
CREATE USER trip3d_app WITH PASSWORD 'replace-with-a-strong-password';
CREATE DATABASE trip3d OWNER trip3d_app;
```

复制后端环境变量：

```powershell
Copy-Item .env.backend.example .env.backend
```

编辑 `.env.backend`：

```env
DATABASE_URL=postgresql://trip3d_app:replace-with-a-strong-password@127.0.0.1:5432/trip3d
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
BACKEND_PORT=8001
GOOGLE_MAPS_API_KEY=
```

使用项目脚本启动：

```powershell
npm run dev:backend:postgres
```

此时需要同步修改 `.env.local`：

```env
VITE_API_BASE_URL=http://127.0.0.1:8001
```

后端地址：

```text
API:    http://127.0.0.1:8001
Docs:   http://127.0.0.1:8001/docs
Health: http://127.0.0.1:8001/api/health
```

`GOOGLE_MAPS_API_KEY` 可选。配置后，后端优先使用 Google Routes；未配置或请求失败时使用 OSRM。

## 数据更新

仓库已包含 `public/data/live-landmarks.json`，首次运行不需要重新抓取。

重新获取 Wikipedia、Wikidata、Open-Meteo 和 OSRM 数据：

```powershell
npm run fetch:live-data
```

将数据导入 PostgreSQL：

```powershell
npm run import:live-data:postgres
```

检查 PostgreSQL 表：

```powershell
$envFile = ".env.backend"
Get-Content $envFile | ForEach-Object {
  if ($_ -match "^([^#][^=]*)=(.*)$") {
    Set-Item -Path "Env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}
conda run -n web3d-backend python tools/check-postgres.py
```

## 常用命令

```powershell
npm run dev                       # 前端开发服务器，127.0.0.1:5173
npm run dev:backend               # SQLite 后端，127.0.0.1:8000
npm run dev:backend:postgres      # PostgreSQL 后端，端口来自 .env.backend
npm run fetch:live-data           # 更新公开景点数据
npm run import:live-data:postgres # 导入 PostgreSQL
npm run build                     # 生产构建
npm run preview                   # 本地预览生产构建
```

## 主要功能

- 景点搜索、筛选、收藏、对比和路线排序
- 按天生成行程并导出 TXT 或打印为 PDF
- 游客本地状态及登录用户 PostgreSQL 状态同步
- OSRM 或 Google Routes 道路级路线
- Cesium World Terrain、全球影像和 OSM Buildings
- 车辆驾驶、自动驾驶、Shift 加速、俯视及景点聚焦
- 自适应瓦片加载、路线分块和长期运行内存控制

## 项目结构

```text
backend/                    FastAPI、账户和路线接口
public/data/                已生成的景点数据
public/models/              车辆与景点 GLB 模型
src/components/cesium/      Cesium 3D 驾驶场景
src/components/home/        首页、景点和路线规划
src/components/ui/          HUD、时间轴和景点卡片
src/hooks/                  路线、天气和数据请求
src/state/                  Zustand 全局状态
tools/                      数据抓取、导入和后端启动脚本
vite.config.js              Cesium 静态资源构建配置
```

## 生产构建

```powershell
npm run build
npm run preview
```

构建产物位于 `dist/`。部署时必须保持 `/cesium/Workers`、`/cesium/Assets`、`/cesium/Widgets` 和 `/cesium/ThirdParty` 路径可访问。部署到非根路径时，需要同步调整 Vite `base` 和 Cesium 的静态资源基础路径。

## 常见问题

### 3D 地图提示 Token 未配置

确认 `.env.local` 存在，并包含：

```env
VITE_CESIUM_ION_TOKEN=your-token
```

修改环境变量后需要重启 Vite。

### Cesium 请求返回 401 或 403

- 检查 Token 是否复制完整，等号右侧不要包含引号或多余空格。
- 检查 Token 是否有读取 ion 资源的权限。
- 检查来源限制是否包含当前使用的协议、域名和端口。
- `127.0.0.1` 与 `localhost` 是不同来源，需要分别配置。
- 在 Cesium ion 控制台重新生成或修改 Token 后，更新 `.env.local` 并重启 Vite。

### 路线变成景点间直线

这通常表示本地后端和公共 OSRM 均未返回道路几何。检查网络、本地后端健康状态，以及浏览器控制台中的路线请求。

### 地图加载跟不上车辆

应用会根据 Cesium 瓦片队列自动降低时间压缩倍率，严重积压时暂时停止路线推进。网络较慢或显存较小时，建筑和地形会先以较低细节显示。

### `Array buffer allocation failed`

当前实现已经限制 OSM Buildings 缓存，并将已走路线按固定距离分块。若仍出现该错误，请记录浏览器、运行时长、路线点数和设备内存后再排查。

## 安全说明

- 不要提交 `.env.local`、`.env.backend`、数据库密码或 Cesium/Google Token。
- 本地账户系统用于项目演示，不应直接作为生产认证系统。
- 公共 OSRM 适合开发和低频测试；正式部署应使用自建或有服务保障的路线提供方。
