# 音楽 — オフラインプレイヤー

シンプルな音楽プレイヤーのVercel用プロジェクトやで。ページ本体はService Workerでキャッシュし、音楽ファイルはIndexedDBに保存する。YouTube検索は公式のYouTube Data APIを使い、結果のタイトルとリンクだけを表示する。

## できること

- 端末の音楽ファイルを追加して、同じブラウザ内に保存
- 保存した曲をオフライン再生
- 前へ／次へ／1曲くり返し
- YouTubeの動画タイトル・チャンネル名・URLを検索して表示
- スマホやChromebookでホーム画面／アプリ一覧に追加（ブラウザが対応している場合）

## YouTubeの音源について

このアプリはYouTube動画をMP3へ変換・ダウンロードせえへん。YouTube検索ではタイトルとリンクだけを表示し、動画はYouTubeで開く。手元にある音楽ファイル、または権利者がダウンロードを許可している公式配布音源を追加して使ってな。

## GitHub → Vercel

1. ZIPを解凍し、中のファイルと `api` フォルダをGitHubリポジトリの**ルート**に置く。
2. VercelでそのリポジトリをImportする。Framework Presetは **Other**、Build Commandは空欄、Output Directoryは `.`（または空欄）でええ。
3. 検索も使いたい場合は、Google CloudでYouTube Data API v3を有効にしてAPIキーを作る。
4. Vercelの **Project → Settings → Environment Variables** に `YOUTUBE_API_KEY` を追加して、Production（必要ならPreviewも）を選び、再デプロイする。
5. APIキーはソースコードやGitHubへ書かんこと。Google Cloud側でYouTube Data API v3に制限し、利用状況・割当も確認する。

YouTube検索にはVercelのServerless Function（`api/search.js`）が動く。自分でサーバーを契約・起動・管理する必要はないで。Vercelが検索リクエストだけを処理する仕組みや。

## オフラインで使う

- まずVercelのURLをオンラインで一度開いてな。Service Workerがアプリ本体をキャッシュする。
- 「音楽ファイルを追加」から端末内の音源を登録する。曲データそのものはCache APIやYouTubeから取らず、ブラウザのIndexedDBに保存する。
- そのあと同じChromebook・同じブラウザプロフィールで開けば、ネットがなくても保存済みの曲を再生できる。検索はネットにつながるまで使えへん。
- ブラウザの保存領域は学校の管理設定や容量整理で消える場合がある。元の音源は別にも保管しといてな。

## ファイル

- `index.html`, `styles.css`, `app.js` — 画面と再生機能
- `sw.js` — オフライン用のアプリ本体キャッシュ
- `manifest.webmanifest`, `icon.*` — Webアプリ情報・アイコン
- `api/search.js` — YouTube公式API検索用のVercel Function
- `vercel.json` — Service Workerとmanifestのヘッダー設定
