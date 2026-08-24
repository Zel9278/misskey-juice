# Misskey-art から misskey-juice への移植状況

## 概要

Misskey-art リポジトリで開発された以下の機能を misskey-juice に移植中:

1. お知らせリアクション機能
2. センシティブ画像のぼかし表示バグ修正
3. reset-db の安全性ガード

## 完了した作業

### ブランチ構成

- `juice/main`: upstream/master (2026.7.0) をベースとした安定版ブランチ
- `juice/dev`: 開発用ブランチ（juice/main に対して PR 作成済み）

### 移植したコミット

#### 1. 画像バグ修正（4コミット）

- `497c2cd48a`: fix(frontend): preserve NSFW blurhash placeholders
- `b10275ed6f`: fix(frontend): センシティブ画像のぼかし表示を修正
  - `MkBlurhash.vue`: ResizeObserver によるサイズ再計算
  - `MkImgWithBlurhash.vue`: CW内での blurhash 描画修正
  - `MkMediaImage.vue`: センシティブ画像の表示ロジック改善
  - `reset-db.ts`: 開発用DB誤削除防止ガード追加
  - `reset-db.ts` (test): ユニットテスト追加

#### 2. お知らせリアクション機能（1コミット）

- `3e778d1767`: feat(announcements): お知らせにリアクション機能を追加

**Backend (新規ファイル):**
- `AnnouncementReaction.ts`: エンティティモデル
- `AnnouncementReactionEntityService.ts`: エンティティサービス
- `AnnouncementReactionService.ts`: ビジネスロジック
- `1787365448671-AddAnnouncementReaction.js`: マイグレーション
- `announcement-reaction.ts`: JSON Schema
- `announcements/reactions.ts`: リアクション一覧取得 API
- `announcements/reactions/create.ts`: リアクション作成 API
- `announcements/reactions/delete.ts`: リアクション削除 API

**Backend (既存ファイル修正):**
- `RepositoryModule.ts`: リポジトリ登録
- `_.ts`: エクスポート追加
- `GlobalEventService.ts`: イベント定義追加
- `AnnouncementEntityService.ts`: reactions/myReactions フィールド追加
- `CoreModule.ts`: サービス登録
- `di-symbols.ts`: DI シンボル追加
- `postgres.ts`: エンティティ登録
- `endpoint-list.ts`: API エンドポイント登録
- `json-schema.ts`: スキーマエクスポート
- `announcement.ts`: reactions/myReactions スキーマ追加
- `AnnouncementService.ts` (test): モック対応

**Frontend (新規ファイル):**
- `MkAnnouncementReactions.vue`: リアクション表示・操作コンポーネント
- `MkAnnouncementReactedUsersDialog.vue`: リアクションユーザー一覧ダイアログ

**Frontend (既存ファイル修正):**
- `announcements.vue`: リアクション表示統合
- `announcement.vue`: リアクション表示統合
- `MkAnnouncementDialog.stories.impl.ts`: モックデータ追加

#### 3. 型定義更新（1コミット）

- `97dbac1186`: chore: お知らせリアクション用の型定義を更新
  - backend の api.json 再生成
  - misskey-js の autogen 更新
  - 型エラー修正

#### 4. Workflow 修正（2コミット）

- `ba271babdc`: revert: .github/workflows の変更を取り消し
  - workflow scope 制限により develop の workflow を使用
  - 11ファイルの workflow を元に戻す

#### 5. CI 修正（2コミット）

- `9e0fa0033e`: fix: CI失敗を修正
  - `scripts/check-spdx.mjs` を追加
  - `api-extractor.json` を develop から復元

- `8b1f375fb9`: fix: scripts/lib/git.mjs を追加
  - check-spdx.mjs の依存ファイル

## 機能詳細

### お知らせリアクション機能

- **概要**: ノートと同じようにお知らせに対してリアクションを付けられる
- **特徴**:
  - 1ユーザーが複数のリアクションを付けることが可能
  - カスタム絵文字とUnicode絵文字の両方に対応
  - ローカル専用（リモート絵文字は受け付けない）
  - リアクションしたユーザー一覧を表示可能
  - ユニーク制約: `(userId, announcementId, reaction)`

### センシティブ画像バグ修正

- **問題**: CW（Content Warning）内やタブ切替時に blurhash が正しく描画されない
- **原因**: `display: none` 状態でマウントされると `clientWidth/Height` が 0
- **解決策**:
  - `|| 300` による最小サイズ確保
  - `ResizeObserver` による動的サイズ再計算
  - `v-if` 条件の改善

### reset-db 安全性ガード

- **問題**: `NODE_ENV=test` で実行後に `built/.config.json` がテスト設定のまま残り、開発用DBを誤って削除する危険性
- **解決策**: 実際の接続先DB名を検証し、"test" が含まれない場合は拒否

## 現在の状態

### PR 状態

- **PR #1**: https://github.com/Zel9278/misskey-juice/pull/1 (マージ済 2026-08-24)
  - お知らせリアクション / 画像バグ修正 / reset-db ガードの移植本体
- **PR #2**: https://github.com/Zel9278/misskey-juice/pull/2 (マージ済 2026-08-24)
  - `Release: 2026.7.0-juice+1.0` — バージョン bump と CHANGELOG 追記
- **ブランチ**: juice/dev → juice/main

### CI チェック状態

PR #2 時点で全チェック green。過程で以下を修正した:

1. ✅ `scripts/check-spdx.mjs` を追加
2. ✅ `scripts/lib/git.mjs` を追加
3. ✅ `packages/misskey-js/etc/misskey-js.api.md` を再生成 (`report` ジョブの失敗を解消)

Federation test が一度失敗したが、`test-federation/` は未変更であり
250ms 固定待ちに起因するフレークだったため再実行で解消した。

### 移植内容の検証

art/main と juice/main で、リアクション機能・blurhash 修正・reset-db ガードの
関連ファイルがバイト一致していることを確認済み。art の後続修正
(PR #71 / #74 / #75 / #76) も最終状態から取り込まれている。

## 移植しなかった変更

以下の変更は juice には移植していません:

1. `.github/workflows/` の art 固有の変更
   - workflow scope 制限により develop の workflow を使用
   - test-frontend.yml の reset-db 待機ロジックも含む

2. `.devcontainer/` の art 固有の設定

3. `package.json` のバージョン情報（art のバージョン番号）

4. `CHANGELOG.md` の art 固有の履歴

5. `.config/default.yml` の設定（juice は example.yml から生成）

## 次のステップ

1. ✅ CI チェックの完了
2. ✅ PR #1 / PR #2 のマージ
3. ⏳ juice/main に `v2026.7.0-juice+1.0` タグを作成
4. ⏳ GitHub Release を作成
5. ⏳ リリースノートを記載

タグ / Release は、下記「1.0 前に固める項目」を消化してから作成する。

## 1.0 前に固める項目

- ✅ diagnostics シナリオの安定化 (art の 4 コミットを cherry-pick)
- ✅ `MkCustomEmoji.vue` の `injection "Symbol()" not found` 警告を解消
- ⏳ Storybook workflow の無効化 (art は `disabled_manually`、juice は `active` のまま)
  - `.github/workflows/storybook.yml` の job は `if: github.repository == 'misskey-dev/misskey'`
    で upstream 限定のため、フォークでは常に skipped になる
- 🔺 `.devcontainer/compose.yml` のポート設定 — art は host 3001 → container 3000 だが
  juice の運用に合うか要判断のため保留
- 🔺 Federation test の 250ms 固定待ちによるフレーク — upstream 側の問題

## 参考情報

### 元リポジトリのコミット

- Misskey-art/misskey の `art/main` ブランチ
- リリースバージョン: `v2026.7.0-art+2.2`

### 移植元のPR

- PR #67: センシティブ画像バグ修正
- PR #68: お知らせリアクション機能
- PR #70: reset-db ガード
- PR #71, #76: お知らせリアクション重複バグ修正

### 技術的な注意点

1. **api.json の生成**: backend ビルド後に `generate-api-json` を実行し、生成された `api.json` を `packages/misskey-js/generator/` にコピーしてから `update-autogen-code` を実行
2. **workflow scope**: GitHub OAuth App の制限により、workflow ファイルの変更は push できない。develop の workflow を使用する
3. **型定義の同期**: backend の変更後は必ず misskey-js の型定義を更新する

## 作業履歴

- 2026-08-24 08:17: misskey-juice リポジトリをクローン
- 2026-08-24 08:28: juice/main と juice/dev ブランチを作成
- 2026-08-24 08:29: art remote を追加、ファイル移植開始
- 2026-08-24 08:35: backend ビルド完了、api.json 生成
- 2026-08-24 08:37: misskey-js の autogen を更新
- 2026-08-24 08:41: workflow を元に戻して push
- 2026-08-24 08:44: PR #1 作成
- 2026-08-24 09:11: CI 修正（check-spdx.mjs 追加）
- 2026-08-24 09:13: scripts/lib/git.mjs 追加
- 2026-08-24 09:23: PORTING_STATUS.md を作成
- 2026-08-24 10:26: misskey-js の API report を再生成し PR #1 の CI を green 化 → マージ
- 2026-08-24 10:55: バージョンを 2026.7.0-juice+1.0 に bump (PR #2) → マージ
- 2026-08-24 11:10: art の diagnostics 安定化コミット 4 件を cherry-pick
- 2026-08-24 11:15: MkCustomEmoji の inject 警告を修正
