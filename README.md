# 循环结构公开课

教学资料（教案、PPT、原静态练习网页）保留在本目录。

新版应用源码、测试、Docker 配置、部署说明以及本地运行数据集中在 **[loop-structure-lesson/](loop-structure-lesson/README.md)**。

```bash
cd loop-structure-lesson
npm ci
npm run dev
```

GitHub Actions 工作流保留在仓库要求的 `.github/workflows/`，从应用子目录测试并构建镜像。

生产镜像：`ghcr.io/alumos/loop-structure-lesson:latest`
