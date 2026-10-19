# 开发与本机启动

next.mjs 统一设置本项目的 Next.js 启动环境并透传命令；所有开发、构建和生产启动都关闭遥测，不修改用户全局配置。Windows 根目录脚本调用这些 npm 命令。

Start-GeoBase.ps1 启动已构建的服务并打开浏览器，服务进程隐藏运行，日志与 PID 在 .local。Stop-GeoBase.ps1 只关闭命令行匹配本项目的进程及其直接子进程。GEOBASE_PORT 可覆盖默认 3000；GEOBASE_NO_BROWSER=1 用于无界面启停验证，不改变应用行为。

generate-migration.mjs 在执行 Drizzle 生成器期间暂存 meta/README.md，结束后原样恢复。Drizzle 将 meta/ 内所有普通文件当作 JSON 读取，因此使用 npm run db:generate，不直接调用底层 CLI。
