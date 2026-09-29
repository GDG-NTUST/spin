# Spin · GDG NTUST 抽獎輪盤

線上版：<https://gdg-ntust.github.io/spin/>

純靜態網站（Vite + TypeScript），不需要後端。

## 本機開發

需求：Node.js 20.19+（建議 22 或 24）。

```bash
npm install
npm run dev       # 開發伺服器 http://localhost:5173/spin/
npm test          # 執行單元測試（Vitest）
npm run build     # 型別檢查 + 建置到 dist/
npm run preview   # 預覽建置結果
```

## 部署

push 到 `main` 分支後，GitHub Actions（`.github/workflows/deploy.yml`）會自動執行：

1. `npm ci`
2. `npm test`
3. `npm run build`
4. 使用 `actions/deploy-pages` 部署到 GitHub Pages

也可以在 Actions 頁面手動觸發（`workflow_dispatch`）。

### 首次設定

到 repo 的 **Settings → Pages**，將 **Source** 設為 **GitHub Actions**。

### base 路徑

本站是 project site，網址為 `https://gdg-ntust.github.io/spin/`，所以 `vite.config.ts` 中設定 `base: '/spin/'`。

- 如果 repo 改名，要同步修改 `base`。
- 如果改部署到 `gdg-ntust.github.io` 這類 user/org site，`base` 要改為 `'/'`。

## Logo

頁首的 logo 讀取 `public/logo.svg`。目前是佔位圖，請替換為官方素材，檔名保持不變即可。

## 深淺色

預設跟隨系統設定。使用者可以點頁首右上角的按鈕，依序切換「跟隨系統 → 淺色 → 深色」，選擇會存在 localStorage。
