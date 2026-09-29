# Spin · GDG NTUST 抽獎輪盤

線上版：<https://gdg-ntust.github.io/spin/>

純靜態網站（Vite + TypeScript），不需要後端。名單、設定與得獎紀錄只存在瀏覽器的 localStorage。

## 使用方式

1. 在左側貼上名單（可混用換行、`,`、`，`、`、`、`|`、Tab、`;`、`；`），或拖曳／選擇 CSV 匯入。
2. 用以下任一方式開始抽獎：
   - 點輪盤中央的「開始」
   - 用滑鼠或手指拖曳甩動輪盤
   - 按住 <kbd>空白鍵</kbd> 蓄力後放開
3. 轉動中再點一次（或再按空白鍵）即可**停下**，約 0.6 秒內停到同一個結果。
4. 揭曉卡片可選「再抽一次」「從獎池移除／保留在獎池」「關閉」。

其他功能：

- **快速模式**：同一次瀏覽的第 2 次抽獎起，單次約 2 秒。
- **批次抽 N 人**：依序快速轉動、逐一揭曉，最後列出完整名單；同一批不會重複。
- **匯出**：名單與抽獎結果皆可匯出 CSV（UTF-8 BOM，Excel 直接開啟不亂碼）。
- **邊界演出機率**：停點貼近分界線的視覺演出，0% 為關閉。
- **音效**：Web Audio 即時合成，頁首可靜音。

### 鍵盤操作

| 按鍵 | 動作 |
|---|---|
| <kbd>Tab</kbd> | 在所有控制項間移動 |
| <kbd>Enter</kbd>／<kbd>Space</kbd>（焦點在「開始」） | 開始抽獎 |
| 按住 <kbd>Space</kbd>（焦點不在輸入框） | 蓄力，放開後開始 |
| <kbd>Space</kbd>（轉動中） | 停下 |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd>（名單輸入框） | 加入名單 |
| <kbd>Esc</kbd> | 關閉揭曉卡片 |

## 公平性

- **先決定結果，再反推動畫**：按下開始的瞬間，就用 `crypto.getRandomValues`（拒絕取樣，無 modulo bias）抽出得獎格，再解出停在該格的旋轉曲線。
- 甩動力道、蓄力、停下、快速模式、邊界演出都只影響**圈數、時長與停在格內的位置**，不影響結果。
- `tests/spinMath.test.ts` 以 3000 組隨機情境驗證：每一次的最終停點都落在預先抽出的格子內。

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

## 專案結構

```
src/
├─ lib/          純邏輯（皆有單元測試）
│  ├─ parseEntries.ts   名單解析、去重
│  ├─ csv.ts            CSV 匯入（標題列偵測、UTF-8/Big5）與匯出（BOM）
│  ├─ random.ts         crypto 隨機整數
│  └─ spinMath.ts       停點計算、等減速曲線、回拉／回彈、停下
├─ wheel/        Canvas 輪盤、旋轉控制、指針、拖曳／蓄力輸入
├─ audio/        Web Audio 音效合成
├─ ui/           名單面板、揭曉卡片、抽獎流程、紀錄、Toast
├─ fx/           背景、進場動畫、聚光燈、共用動畫工具
├─ state/        store 與 localStorage 持久化
└─ styles/
tests/           Vitest 單元測試
```

## 瀏覽器支援

最新版 Chrome、Edge、Firefox、Safari（含 iOS Safari 16.4 以上）。

偵測到 `prefers-reduced-motion` 時：不播進場動畫、背景靜止、關閉視差與殘影，輪盤改為約 0.7 秒的短轉，揭曉改為淡入。

## Logo

頁首使用 GDG on Campus NTUST 官方 logo，淺色主題顯示黑字版、深色主題顯示白字版：

| 檔案 | 來源／用途 |
|---|---|
| `public/logo.svg` | `GDG_NTUST_Logo_Full.svg`（黑字） |
| `public/logo-dark.svg` | `GDG_NTUST_Logo_Full_White_Word.svg`（白字） |
| `public/favicon.svg` | 由 `logo.svg` 移除 NTUST 字樣、裁成正方形的圖形標誌 |
| `public/favicon.ico` | 16／32／48 px |
| `public/apple-touch-icon.png` | 180 px，白底（iOS 主畫面） |
| `public/icon-192.png`、`icon-512.png`、`icon-maskable-512.png` | `site.webmanifest`（Android 加到主畫面） |

favicon 只保留圖形，因為 NTUST 字樣在 16–32 px 下無法辨識。

## 深淺色

預設跟隨系統設定。使用者可以點頁首右上角的按鈕，依序切換「跟隨系統 → 淺色 → 深色」，選擇會存在 localStorage。
