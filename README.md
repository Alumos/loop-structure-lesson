# 月球巡逻 · 飞控课堂

为五年级《循环结构》公开课设计的 Node.js 课堂应用。学生选择已有班级和姓名即可进入；教师使用 ClassOrbit 的同一账号密码查看练习完成情况、实时练习画面、流程图关键状态和验收答案。

Git 仓库根目录为当前 `loop-structure-lesson/`。原教案、PPT、静态网页与 `verify_levels.js` 保留在上一级教学资料目录中，位于本仓库范围之外。新版入口为 `/`（学生）与 `/teacher`（教师）。

完整课堂说明、三关标准流程、常见错图、验收题答案和 PPT/教案修改建议见 [程序完整说明.md](程序完整说明.md)。

## 已实现

- 三关探究：建立中继通信、峡谷巡路、绕坑一圈。学生从空白画布摆放节点，手工连接普通箭头、“是 / 否”分支和返回箭头；所有节点均可重复拖入、自由移动；从图形边缘拖线，支持鼠标与触摸操作、展开画布、缩放、删线、撤销与清空。旧“寻找水冰”记录仍可回放。
- 每关显示清楚的情景和醒目的任务目标；三关都从空图开始，判断条件直接拖入。探究关卡没有停止条件下拉、判断时机切换和预测卡片。判断位置由实际连线决定，第一、二关接受符合任务的不同判断位置；第三关通过学生自行重连发现 0 轮与 4 轮的差异。
- 无需先预测或拼成正确流程图即可运行。模拟沿学生实际连接的箭头前进，遇到断线、缺少分支、越界等情况会停下并指出停点；运行时高亮实际经过的节点和箭头。
- 三道综合验收，每题两小问、共 6 分；客观选择自动评分，补充文字由教师查看。另有充电对照选做题和过程自评。
- 一人或两人一机。合作探究按小组记录，三题验收按学生分别提交，切换作答人后清空答题界面；过程表现由教师核定 0–4 分。
- 教师创建课堂、开放关卡与验收、统一公布答案、结束课堂、查看离线状态、处理求助、导出记录。教师可直接修正学生当前流程图，修改实时同步到学生端；修正区同时显示地图并可模拟运行当前修改稿，教师模拟不计入学生尝试。也可单独显示标准答案。
- 全班进度表：每关完成情况与尝试数、每名学生的三题提交数和得分，支持姓名搜索和关注筛选。
- 单组实时练习区域与鼠标位置；方案记录保存节点、箭头、条件、时机和运行结果，同一方案未变化不重复记录。教师可检查外层判断、内部分支、返回箭头及第三关的判断时机对照。支持按关键状态跳转和匿名讲评。旧预测数据继续兼容读取。
- IndexedDB 暂存待同步操作，自动补传。事件和提交使用独立 ID 去重；全部清理后旧学生会话失效，旧设备不能重新上传已删除记录。
- 记录管理：按课堂、小组、最后活动时间筛选；仅清回放或清空全部做题记录；预览数量、输入确认、回收 SQLite 磁盘空间。

画面观察是根据学生练习状态重建页面，不是桌面录屏；记录范围仅限练习区域，不含其他网站或软件。鼠标坐标按区域比例重建，不同显示宽度下位置可能略有差异。鼠标位置与运行帧只实时转发，不存入数据库或离线队列。关键状态仅存方案、预测等必要字段；运行结果画面由方案重建。首次启动新版时自动清理旧的鼠标/逐步动画日志，保留原有方案、预测、尝试、验收答案和成绩。

旧版仅有 `body` 的方案继续用于教师只读回放；学生重新进入旧草稿时使用空流程图。原有成绩和学习记录保留。新提交需要包含画布节点和箭头，但允许流程不完整；服务端按实际连线重新计算结果。

## 自由画布操作

1. 把上方的指令方块拖进画布。每种方块都能重复使用，包括开始、结束和判断；结构不完整时会提示原因，保留现场供修改。
2. 拖住方块中间，自由调整位置。默认开启自动对齐，靠近其他节点的中心线时显示参考线并吸附；可取消勾选。“一键整理”沿已连接的流程统一位置、间距与连接边缘，不会增删或修正学生的箭头。鼠标移到图形边缘时会出现小方形定位标记；从那里拖到另一图形的上、下、左或右边缘，即可连接箭头。
3. 判断节点右侧默认是“是”，下侧默认是“否”（上侧默认“是”，左侧默认“否”）。选中箭头后也可以修改分支标签。
4. 返回箭头同样由学生拖线连接。只有箭头指回从“开始”出发的当前路径上已经经过的节点，才会自动标记为返回；其余箭头保持普通连线。
5. 点击节点后可删除；点击箭头，线旁显示修改与删除工具，也可直接按 Delete 或 Backspace 删除。Esc 取消当前拖动；撤销可恢复节点、连线及位置。展开画布、缩放和滚动仅改变观看方式。
6. 节点位置和连接边缘会随草稿、提交和教师回放保存。拖动时只作本地预览，松手才记录一次操作；刷新时恢复尚未上传的本机草稿。旧图没有位置数据时使用兼容布局。

每张图最多 30 个节点、50 条线；模拟设有步数上限，避免错误连线导致无休止运行。键盘可用 Enter 从指令区添加节点，聚焦节点后用方向键移动、Delete 删除。

## v1.4.0 镜像

固定版本：`ghcr.io/alumos/loop-structure-lesson:v1.4.0`，支持 Linux amd64 和 arm64。仓库默认分支构建同时更新 `latest`。

在 VPS 原部署目录将镜像改为上述版本，执行 `docker compose pull` 与 `docker compose up -d --no-build`。使用 `compose.ready.yaml` 时，在两条命令中加上 `-f compose.ready.yaml`。保留原数据卷。

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

以下命令均在 Git 仓库根目录 `loop-structure-lesson/` 执行。

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
2. 仓库根目录的 `.github/workflows/image.yml` 自动运行模拟/接口测试、生产构建、Chromium 端到端测试。
3. 验证通过后构建 Linux amd64/arm64 镜像，推送 `ghcr.io/<用户名>/<仓库名>:latest`，同时提供提交 SHA 和版本标签。
4. 镜像包含前端与 Node.js 服务，不包含真实密钥、学生名单、数据库、教案和 PPT。工作流使用仓库 `GITHUB_TOKEN` 推送镜像，无需把名单密钥交给 GitHub Actions。

PR 只验证与构建，不推送镜像。首次 GHCR 包通常是私有的；可以在包设置中调整可见性，或在 VPS 使用有 `read:packages` 权限的令牌登录 GHCR。

## VPS 部署

已提供本机私有的 `compose.ready.yaml` 成品配置时，无需 `.env`：把它复制到 VPS 原部署目录，执行 `docker compose -f compose.ready.yaml pull` 和 `docker compose -f compose.ready.yaml up -d --force-recreate`。该文件含名单共享密钥，已排除在 Git 和镜像构建之外，不会随仓库下载。

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

- **仅操作回放**：删除流程图与预测的历史关键状态，保留当前画面、草稿、闯关尝试、作答及评分。学生继续操作会产生新回放。
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

测试使用临时数据库、演示账号和虚拟学生，不读取真实名单。覆盖三关正确/错误路线、残图停点、零轮、旧水冰记录、教师修正、验收评分、教师权限、来源校验、幂等补传、个人作答边界、清理后旧会话失效，以及浏览器内的完整教学流程。截图写入 `artifacts/`（虚拟学生），生产数据库和凭据不进仓库。

## 反向代理与学生入班

浏览器同源请求通过 Fetch Metadata 校验，可兼容 HTTPS 域名反代到 HTTP 容器，也支持 HTTP IP＋端口直连。旧浏览器或代理不保留 Fetch Metadata 时，设置 `PUBLIC_ORIGIN: "https://loop.alumos.cn"`；此值支持逗号分隔的明确来源。HTTP 接口和 WebSocket 使用同一校验逻辑，不直接信任客户端可伪造的 `X-Forwarded-Host`。

首次进入时 `/api/student/me` 的 401 表示尚未登录；`/api/student/join` 返回 `ORIGIN_MISMATCH` 才是来源校验问题。`Permissions-Policy` 中浏览器不认识的广告功能提示不会影响入班，本应用没有设置这些响应头。学校共享出口 IP 可在一分钟内完成最多 240 次入班请求，教师密码认证仍单独限制 20 次。

升级时在 **VPS 原部署目录** 替换 Compose 并拉取新镜像，保留原有服务名和数据卷，不使用 `down -v`。本次本机源码整理不会改变 VPS 的数据卷名称。
