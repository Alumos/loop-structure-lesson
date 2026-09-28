# 月球巡逻 · 飞控课堂

为五年级《循环结构》公开课设计的 Node.js 课堂应用。学生选择已有班级和姓名即可进入；教师使用 ClassOrbit 的同一账号密码查看练习完成情况、实时练习画面、鼠标轨迹和操作回放。

原教案、PPT、静态网页与 `verify_levels.js` 保留在目录中。新版入口为 `/`（学生）与 `/teacher`（教师）。

## 已实现

- 四关探究：中继通信、峡谷巡路、寻找水冰、绕坑一圈。运行前预测、积木添加/拖放/排序、修改理由、运行对照、逐步高亮。
- 第四关预填循环体；区分“尚无扫描数据”与“条件已成立”两种零轮结果。
- 三道综合验收，每题两小问、共 6 分；客观选择自动评分，补充文字由教师查看。另有充电对照选做题和过程自评。
- 一人或两人一机。合作探究按小组记录，三题验收按学生分别提交，切换作答人后清空答题界面；过程表现由教师核定 0–4 分。
- 教师创建课堂、开放关卡与验收、统一公布答案、结束课堂、查看离线状态、处理求助、导出记录。
- 全班进度表：每关完成情况与尝试数、每名学生的三题提交数和得分，支持姓名搜索和关注筛选。
- 单组实时练习区域与鼠标位置；事件回放支持暂停、倍速、关键操作跳转、加载更早记录、匿名讲评。
- IndexedDB 暂存待同步操作，自动补传。事件和提交使用独立 ID 去重；全部清理后旧学生会话失效，旧设备不能重新上传已删除记录。
- 记录管理：按课堂、小组、最后活动时间筛选；仅清回放或清空全部做题记录；预览数量、输入确认、回收 SQLite 磁盘空间。

画面观察是根据学生练习状态重建页面，不是桌面录屏；记录范围仅限练习区域，不含其他网站或软件。鼠标坐标按区域比例重建，不同显示宽度下位置可能略有差异。回放保留采样后的轨迹，不是逐帧视频。

## 技术结构

- React 19、TypeScript、Vite、Tailwind CSS 4、shadcn/ui 风格的本地组件（Radix Dialog/Slot、CVA、Lucide）；配置在 `components.json`。
- Node.js 22.16+、Express、WebSocket、内置 `node:sqlite`，无需独立数据库服务。
- `shared/engine.ts`：纯模拟引擎及题目定义。服务端重新计算闯关结果与验收分数。
- `server/roster.ts`：ClassOrbit 名单与教师认证。`server/index.ts`：课堂、事件、鉴权、存储与 WebSocket。
- `src/Student.tsx`、`src/Teacher.tsx`：学生端和教师工作台；`src/components/Exercise.tsx`：可复用练习与观察画面。

## ClassOrbit 接入

服务端读取：

```http
GET https://class.alumos.cn/api/integration/classes?teacher_username=Alumos
Authorization: Bearer <CLASS_SYSTEM_TOKEN>
```

集成接口使用共享密钥，**不使用登录 Cookie 或教师密码**。支持 ETag / 304；名单缓存保存在服务器 SQLite 中，五分钟内复用，远端异常时使用上次成功缓存并显示提示。班级 ID 与学生学号均按字符串处理，保留前导零；学生身份范围是课堂/班级＋学号。

教师登录调用原系统 `POST /api/auth` 校验输入的账号和密码，并核对用户名。认证成功后，新应用签发自己的 HttpOnly 会话。教师密码不会保存在数据库或配置中，原站 Cookie 不发送给学生；已登录会话有效期为 12 小时。首次教师登录仍需原系统可用。

学生入口只展示教师已经开启课堂的班级。选择姓名是一种课堂身份认领方式，不是个人密码验证；在课堂中由教师确认实际操作人。相同小组在新设备重新进入时，旧设备的会话会被替换。

## 本地开发

```bash
npm ci
cp .env.example .env
```

在 `.env` 中填写共享密钥。`npm run dev` 会读取本机 `.env`，同时启动服务和前端。也可以分别运行：

```bash
node --env-file=.env --import tsx server/index.ts
```

另开一个终端：

```bash
npx vite --host 0.0.0.0
```

学生访问 `http://localhost:5173/`，教师访问 `/teacher`。本地开发请把 `PUBLIC_ORIGIN` 留空、`COOKIE_SECURE=false`。也可以直接运行 `npm run dev`。

无需真实名单的独立演示：

```bash
AUTH_MODE=demo DEMO_PASSWORD=choose-a-demo-password npm run dev
```

演示班有三位虚拟学生。账号为 `Alumos`，密码使用自设的 `DEMO_PASSWORD`。演示模式须显式启用；Compose 生产配置不启用此模式。

## GitHub Actions 构建完整镜像

1. 将项目上传自己的 GitHub 仓库，默认分支为 `main` 或 `master`。
2. `.github/workflows/image.yml` 自动运行模拟/接口测试、生产构建、Chromium 端到端测试。
3. 验证通过后构建 Linux amd64/arm64 镜像，推送 `ghcr.io/<用户名>/<仓库名>:latest`，同时提供提交 SHA 和版本标签。
4. 镜像包含前端与 Node.js 服务，不包含真实密钥、学生名单、数据库、教案和 PPT。工作流使用仓库 `GITHUB_TOKEN` 推送镜像，无需把名单密钥交给 GitHub Actions。

PR 只验证与构建，不推送镜像。首次 GHCR 包通常是私有的；可以在包设置中调整可见性，或在 VPS 使用有 `read:packages` 权限的令牌登录 GHCR。

## VPS 部署

VPS 安装 Docker Engine 和 Compose 插件后，只需复制 `compose.yaml` 和 `.env.example`：

```bash
cp .env.example .env
chmod 600 .env
```

填写：

```dotenv
IMAGE_NAME=ghcr.io/alumos/loop-structure-lesson:latest
APP_PORT=18763
CLASS_SYSTEM_TOKEN=你的共享密钥
TEACHER_USERNAME=Alumos
```

确认 `18763` 未被占用，然后：

```bash
docker compose pull
docker compose up -d --no-build
docker compose logs --tail=50 classroom
```

学生入口 `http://VPS地址:18763/`，教师入口 `http://VPS地址:18763/teacher`。只映射一个端口。局域网可以使用 HTTP；公网登录建议通过 HTTPS 域名反向代理此端口，代理需支持 WebSocket Upgrade。例如：

```dotenv
BIND_IP=127.0.0.1
PUBLIC_ORIGIN=https://moon.example.com
COOKIE_SECURE=true
TRUST_PROXY=1
```

Caddy 反向代理示例（Caddy 位于宿主机）：

```caddy
moon.example.com {
    reverse_proxy 127.0.0.1:18763
}
```

`PUBLIC_ORIGIN` 必须与浏览器访问的来源完全一致，不带末尾斜杠；Nginx 需转发 Host、X-Forwarded-Proto，并设置 Upgrade/Connection 头。`TRUST_PROXY=1` 用于服务只暴露给可信的单层反向代理时。

也可在项目目录本机构建：把 `.env` 的 `IMAGE_NAME` 设为 `moon-classroom:local`，运行 `docker compose up -d --build`。

更新：

```bash
docker compose pull
docker compose up -d --no-build
```

数据保存在 `classroom_data` 命名卷中，更新镜像不会丢记录。不要执行 `docker compose down -v`，除非明确要删除数据库及名单缓存。

## 教师上课流程

1. 用原教师账号密码登录 `/teacher`，同步名单，选择班级开启新课堂。
2. 学生打开学生入口，选择班级、姓名（两人合作可选两名）。
3. 教师在总览控制关卡，查看完成情况；点击学生行进入实时练习画面。每条关键操作即时加入待发送队列，通常约 1–2 秒在看板更新，具体取决于网络。
4. 发布综合验收。合作组依次切换作答人，三题分别提交；公布答案后停止接收新答案。
5. 查看过程证据并核定 4 分，导出课堂 JSON，包含每次方案、作答、分数和当前学习状态。
6. 结束课堂。在“记录与存储”预览范围并清理。正在持续写入的记录如果改变了预览数量，需重新预览后确认。

## 控制存储

| 配置                     | 默认  | 含义                                                         |
| ------------------------ | ----- | ------------------------------------------------------------ |
| `REPLAY_RETENTION_DAYS`  | 7     | 自动删除早于此期限的操作回放                                 |
| `RECORD_RETENTION_DAYS`  | 30    | 清空超过此期限未活动的小组全部做题记录，最小值不低于回放天数 |
| `MAX_EVENTS_PER_STUDENT` | 20000 | 每个练习席位/小组最多保留的回放事件，超限滚动删除最早事件    |

自动维护每小时运行，回放到期后成绩和最新方案仍保留到未活动记录期限；不删除 ClassOrbit 原始名单。手动清理和定时维护会整理 SQLite、截断 WAL 并回收空闲文件空间，Docker 日志也限制大小和数量。

- **仅操作回放**：删除历史鼠标/操作事件，保留当前画面、草稿、闯关尝试、作答及评分。学生继续操作会产生新回放。
- **全部做题记录**：删除选中小组的尝试、作答、回放、草稿和教师评分，撤销学生会话并通知设备重新进入。合作记录一起删除。
- **最后活动时间**：按小组最后活动时间选取，例如“超过 30 天未活动”，不是截取仍活跃学生最近一个月之前的部分答案。

清理不会删除教师创建的课堂条目和名单缓存，因此数据库仍会保留少量基础数据。后台显示的是数据库和 WAL/SHM 的磁盘大小，不包括镜像本身。

## 验证

```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

测试使用临时数据库、演示账号和虚拟学生，不读取真实名单。覆盖四关正确/错误路线、未知与零轮、验收评分、教师权限、来源校验、幂等补传、个人作答边界、清理后旧会话失效，以及浏览器内的完整教学流程。截图写入 `artifacts/`（虚拟学生），生产数据库和凭据不进仓库。
