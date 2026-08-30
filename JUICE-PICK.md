# JUICE-PICK 調査メモ

## 対象

- 対象リポジトリ: `Zel9278/misskey-juice`
- 参考実装: [kokonect-link/cherrypick](https://github.com/kokonect-link/cherrypick/tree/master)
- 参考実装は現在の既定ブランチ `develop` を shallow clone して調査した。リクエストに記載された `master` URL の内容と差異があり得るため、実装着手時には対象コミットを固定して再確認する。
- **承認式新規登録機能のみ CherryPick の実装を参考に移植する。その他の機能は CherryPick からの移植ではなく、JUICE の要件に合わせた独自実装とする。**
- 今後追加する JUICE 独自機能の有効・無効などのオプションは、既存の管理画面へ直接分散させず、コントロールパネルに新設する **「JUICE」項目** に集約して実装する。
- 今回の機能では、承認式新規登録、絵文字申請、リレー TL など、サーバー全体に関わる設定を「JUICE」項目から管理できるようにする。
- ユーザーランキング、AI 生成物フラグ、JUICE 専用 About ページに将来オプションが必要になった場合も、同じ「JUICE」項目に追加する。

## 進捗ステータス

最終更新: 2026-08-30

| #   | 機能                  | 状態   |
| --- | ------------------- | ---- |
| 0   | JUICE 設定基盤          | ✅ 完了 |
| 1   | 承認式新規登録             | ✅ 完了 |
| 2   | AI 生成物フラグ           | ✅ 完了 |
| 3   | 絵文字申請ページ            | ✅ 完了 |
| 4   | ユーザーランキング           | ✅ 完了 |
| 5   | リレー TL              | ✅ 完了 |
| 6   | JUICE 専用 About ページ  | ✅ 完了 |
| 7   | ウィジェットパネル・ドロワーの表示位置(左右)設定 | ✅ 完了 |
| 8   | お知らせの投票機能           | ✅ 完了 |
| 9   | LaTeX(数式)表示機能の復旧    | ✅ 完了 |

各機能の番号は、この表・以下の各セクション・[10. ロードマップ外の追加実装](#10-ロードマップ外の追加実装) 内の参照(例: 「絵文字申請(3.)」)ですべて共通。

## 0. JUICE 設定基盤 ✅ 完了

- コントロールパネルに **「JUICE」項目** を新設する。
- JUICE 独自機能の有効・無効、集計期間、登録理由の設定などを集約できるようにする。
- 設定値を Meta に保存し、設定変更 API とフロントエンド設定画面を用意する。
- 各機能の実装時に、この項目へ個別の設定を追加する。

## 1. 承認式の登録方式 ✅ 完了

### JUICE の現状

- `packages/backend/src/server/api/SignupApiService.ts` が新規登録の入口。
- 現在ある登録制御は `MiMeta.disableRegistration` と招待コード方式。
- `packages/backend/src/models/User.ts` には現時点で `approved` はなく、登録承認専用の状態はない。
- `packages/backend/src/models/UserPending.ts` はメール認証用の一時ユーザー情報を持つが、登録理由用の `reason` はない。
- フロントエンドの `MkSignupDialog.form.vue` は、メールアドレス・招待コードなどには対応しているが、承認理由入力と承認待ち表示は未対応。

### CherryPick 側で確認できたもの

CherryPick には、希望している「承認式登録」にかなり近い実装が既にある。

- `MiMeta.approvalRequiredForSignup: boolean`
  - 管理画面の設定で有効・無効を切り替える。
  - `admin/update-meta` で更新する。
  - `MetaEntityService` / NodeInfo などの公開情報にも反映する。
- `MiUser.approved: boolean`
  - 承認済みかどうかをユーザー単位で保持する。
- `MiUser.signupReason` と `MiUserPending.reason`
  - 登録時に理由を入力させ、管理者の確認対象にする。
- 登録時に `reason` を必須化し、登録完了後は `pendingApproval` を返してログインさせない流れになっている。
- 管理画面 `/admin/approvals` と `MkApprovalUser.vue` で承認待ちユーザーを一覧表示する。
- `admin/approve-user` と `admin/decline-user` があり、Moderator 権限で操作できる。
- 承認時に `ModerationLogService.log(me, 'approve', ...)`、拒否時に `decline` を記録する。
- 承認後・承認待ち時にはメール通知も行う。
- サインイン時に `approved` と `approvalRequiredForSignup` を検査し、未承認ユーザーを拒否する。
- DB 変更は `1768893580518-approvalSignup.js` にまとまっており、`meta`、`user`、`user_pending` に列を追加している。

### JUICE オプションの管理

- オプションを追加する場合は、コントロールパネルに新しく **「JUICE」項目** を作成し、JUICE 独自機能の設定をそこへ集約する。
- 有効・無効の切り替えが必要な機能は、原則としてこの「JUICE」項目から変更できるようにする。
- 設定値は Meta に保存し、公開情報への反映が必要なものは MetaEntityService / NodeInfo などにも追加する。
- 設定を無効にした場合は、フロントエンドでの導線を非表示にするだけでなく、バックエンドの API / stream 側でも利用を拒否する。
- 例外として、承認式新規登録の設定は CherryPick 由来の `approvalRequiredForSignup` を参考にするが、管理画面上の配置は JUICE の「JUICE」項目に統一する。
- User / UserPending の列追加と新規 migration（既存のマージ済 migration は編集しない）。
- Signup API、Signin API、Signup フォーム、登録完了画面の変更。
- 承認待ち一覧、承認・拒否 API、管理画面メニュー、モデレーションログ表示。
- 承認操作は **Moderator または admin** に許可する。CherryPick 側の `requireModerator` 相当を基本とし、admin は Moderator 系権限に含まれる既存の権限モデルに従う。
- API 変更後の `misskey-js` 型定義再生成。
- 「無効化・有効化」は CherryPick 同様に `approvalRequiredForSignup` の設定スイッチとして扱う。`disableRegistration`（登録自体の停止）とは別設定にする。
- 登録理由は必須とし、最大文字数は **4096文字** とする。
- 登録理由の必須／任意、最大文字数、承認式登録の有効／無効は、コントロールパネルの **「JUICE」項目** から設定可能にする。
- 登録理由は一般ユーザーや他の申請者には公開せず、**運営（Moderator または admin）のみ閲覧可能**にする。

## 2. AI 生成物フラグ（JUICE 独自実装） ✅ 完了

### 現状

- JUICE の Note Entity / Note JSON Schema / NoteEntityService / ノート作成 API / `MkNote.vue` / `MkNoteDetailed.vue` に、AI 生成物を示す専用フィールドは確認できなかった。
- 既存の `preventAiLearning` / `noai` は「AI 学習を拒否する」フラグであり、「このノートが AI 生成物である」ことを示すものではない。用途を混同しないこと。
- **CherryPick の AI 関連実装を移植せず、JUICE 独自の AI 生成物表示機能として実装する。**
- CherryPick 側では今回のノート表示仕様を満たす実装は確認できなかった。

### 必要になりそうな構成

- CherryPick の既存機能を移植せず、JUICE 独自の AI 生成物表示機能として実装する。
- **AI Generated（AI生成）バッジ** など、ノート上で生成物だと分かる表示を付ける。
- ノート投稿画面で設定した AI 生成物フラグは、添付した Drive ファイルにも連動させる。
- ノート単位と Drive ファイル単位の両方に AI 生成物フラグを保持する。
- ~~現時点では ActivityPub での AI フラグ連合は行わない。~~ → 方針転換: `_juice_isAIGenerated` というJUICE独自のASプロパティ(`misskey:`とは別の`juice:`名前空間)で連合するように実装した。未対応サーバーからは単に無視される(受信側は未指定なら`false`扱い)。`packages/backend/test-federation`の2インスタンス実機環境(a.test⇔b.test)で連合・双方向フォロー後の配信を検証済み(フォロー成立後は投稿から着信まで約65msで反映)。投稿後編集の連合は対象外のまま。
  - 追記(2026-08-28): 添付Driveファイル単位のフラグも連合するように拡張した(ノート単位の`_juice_isAIGenerated`とは別に、添付Document/Imageオブジェクトにも同名プロパティを付与)。実装時に見つかった副次バグとして、`DriveService.addFile()`のmd5重複排除ロジックが`isSensitive`の「false→true」追従は行うのに`isAIGenerated`には同じ追従処理が無く、同一内容ファイルの再federate時に古い値のまま固定される不具合があったため、`isSensitive`と同じ形で追従するよう修正した。
- ~~投稿後のAI生成物フラグ変更はストリーム配信しない(既存の`updated` NoteEventTypeは未使用のデッドコードなので新規配線は見送る)。~~ → 実装中に判明: デッドコードだったのは`updated: {cw,text}`の一部だけで、`publishNoteStream()`自体は`reacted`/`unreacted`/`pollVoted`/`deleted`で現役稼働中のインフラだった。方針を修正し、新規の`aiGeneratedChanged`イベントとしてこの生きているインフラに正しく乗せ、投稿後の変更が購読中の全タブへ即時反映されるようにした。
- リノート時は AI 生成物フラグの表示を強制する。
- 編集時は AI 生成物フラグを変更可能にする。
- 機能自体の有効・無効設定は設けない。

### 実装結果

以下の順序で段階的に実装した。

1. Note / Drive ファイルのデータモデルと migration
2. 投稿画面での `isAIGenerated` 設定と添付 Drive ファイルへの連動
3. ノートの `AI Generated（AI生成）` バッジ表示
4. 編集・リノート・引用ノート時の保持・変更処理
5. Drive の AI 生成物のみフィルター
6. AI 生成物付き投稿のミュート設定

## 3. 絵文字申請ページ ✅ 完了

### 現状

- JUICE には管理者向けのカスタム絵文字管理画面が既にある。
- `packages/frontend/src/pages/admin/custom-emojis-manager*.vue` には絵文字の登録・更新・削除の処理と、操作ログ表示の仕組みがある。
- これは管理者が直接操作する画面であり、一般ユーザーが申請し、管理者が承認する申請ワークフローは別途必要。
- 絵文字の実体は Drive ファイル・絵文字メタデータ・リモート絵文字と結び付いているため、申請時にアップロード済みファイルをどう扱うかが重要。
- **CherryPick の絵文字申請機能を移植せず、JUICE 独自の申請・審査ワークフローとして実装する。**

### 必要になりそうな構成

- CherryPick の既存機能を移植せず、JUICE 独自の申請・審査ワークフローとして実装する。
- 申請項目は、絵文字画像、名前、カテゴリ、ライセンスとする。
- 申請は却下または承認されるまで保持する。承認された場合は、その申請データをカスタム絵文字として利用する。
- 却下時は申請者へ却下理由を通知する。再申請は既存申請の再開ではなく、新しい申請としてもう一度申請してもらう。
- 承認・却下などのログは、既存の **audit logs** の仕組みに依存させる。
- 申請用 Entity / migration には、申請者、画像ファイル、名前、カテゴリ、ライセンス、状態、作成日時、審査者、審査日時、却下理由などを保持する。
- 一般ユーザー用の申請作成・自分の申請一覧 API / ページを追加する。
- **Moderator または admin** 用の申請一覧・承認・却下 API / ページを追加する。
- 承認時は既存のカスタム絵文字登録処理へ接続し、二重登録や名前衝突を防ぐ。
- 申請画像の保存期間は、却下または承認されるまでとする。承認後はカスタム絵文字の画像として利用する。
- Meta に機能の有効・無効設定を追加し、コントロールパネルの **「JUICE」項目** から設定可能にする。無効時は申請ページ・API の両方を利用不可にする。
- 申請画像の削除可否はユーザーが申請時にチェックボックスで選択できるようにした(承認・却下いずれの場合も、チェックが入っていれば審査完了時にDriveファイルを削除する。承認時は絵文字側がURLをコピー済みのため削除しても絵文字自体には影響しない)。
- 同時に出せるpending申請数の上限は、当初想定していなかった**ロールポリシー**(`emojiRequestLimit`)として実装した。理由: Misskeyには既に「サイト全体のデフォルトポリシー + ロールごとの個別上書き」という2層設定機構がロールポリシーとして存在しており(既存の`driveCapacityMb`等と同型)、JuiceSettingsに新設するよりこの既存機構にそのまま乗せる方が自然だったため。既定値は3件、rate limit(1日10回)と併用して連投も防止する。

## 4. ユーザーランキング（JUICE 独自実装） ✅ 完了

### 現状確認

- JUICE にはゲーム用の `bubble-game/ranking` と、ノートの注目度用 `FeaturedService` は存在する。
- ただし「投稿数」「リアクション数」をユーザー単位で集計し、1〜3位を表示する一般ユーザーランキング API / ページは確認できなかった。
- `FeaturedService` のランキングはノート ID が対象であり、今回のユーザーランキングの直接利用にはならない。

### 実装方針

- CherryPick の既存機能を移植せず、JUICE 独自のランキング機能として実装する。
- 表示基準は **投稿数** と **リアクション数** の2種類とし、それぞれ1位〜3位を表示する。
- 対象ユーザーは全体とする。
- 投稿数・リアクション数は、数値が多いユーザーほど上位になる降順ランキングとする。
- 集計期間は12時間単位を基本とする。
- 集計期間などのランキング関連オプションは、コントロールパネルの **「JUICE」項目** から設定可能にする。
- 集計は毎回の重い SQL 集計ではなく、Redis の期間別カウンターまたは定期集計を利用する方針で検討する。

### 実装結果

- 集計期間はコントロールパネルの「JUICE」項目から変更可能にし、既定値は12時間とした(`admin/juice/settings` / `admin/juice/update-settings` の `rankingAggregationPeriodHours`)。
- 投稿数にはリノートを含めない。純粋リノート(引用なし)は対象外、引用リノート(テキスト等が付いたもの)は対象に含める。
- リアクション数は「もらった数」(自分の投稿に付けられたリアクション数)を集計する。既存の`PerUserReactionsChart`と同じ方向で、押した側ではなく受け取った側に加点する。
- 集計方式は`FeaturedService`と同じ「エポック基準の期間別ZSET + 前ウィンドウとのブレンド + TTLによる自然消滅」方式(新規`JuiceUserRankingService`)を転用した。期間の境界を跨いだ瞬間にランキングが空になる不自然さを避けるため、現在ウィンドウと直前ウィンドウのスコアを平滑化して返す。
- ランキングの表示は探索ページ(`/explore`)に「ユーザーランキング」タブとして追加した(ログイン不要で誰でも閲覧可能な公開情報のため)。
- 新規エンドポイント`juice/ranking`(`requireCredential: false`)で投稿数・リアクション数それぞれ上位3件を返す。

## 5. リレー TL（JUICE 独自実装） ✅ 完了

### 現状

- JUICE には Relay Entity、`RelayService`、管理者向けリレー登録 API / 画面が既にある。
- 現在の標準タイムラインには Social（ローカル）と Global（グローバル）などがあり、Relay 専用タイムラインの API / stream channel / フロント画面は確認できなかった。
- `RelayService` は登録済みリレーへの配送や受信判定を担当するもので、リレー別にノートを参照する検索 API ではない。
- 既存のノートには配送先情報などがあり、単純に「リレー URL」を note の属性として保存している構造ではない。

### 実装検討ポイント

- CherryPick の既存機能を移植せず、JUICE 独自のリレー TL として実装する。
- 過去ノートは遡ってリレー情報を付け直さず、マイグレーション完了後に受信したノートからリレー TL の対象にする。
- ActivityPub の受信時に、可能であれば **どのリレーから来たか** を記録して判定する。複数リレーから届く場合の重複排除も必要。
- 公開範囲はリレー TL 専用の公開ノートのみとし、非公開・フォロワー限定・ダイレクトなどは対象外にする。
- REST API だけでなく、他のタイムラインと同様に WebSocket / stream でリアルタイム配信する。
- リレー TL の有効・無効や表示関連オプションは、コントロールパネルの **「JUICE」項目** から設定可能にする。

### 実装結果

- 「どのリレーから来たかを記録する」は、本家Misskeyの`ApInboxService.announceNote()`に既に存在する`fromRelay`判定(Announceの送信者actorが登録済みリレーのinboxと一致するか)にそのまま乗せる形で実現した。`RelayService.isRelayActor()`(bool判定)を`RelayService.getRelayForActor()`(一致した`MiRelay`を返す)に置き換え、一致したリレーのIDを`note.relayId`(`channelId`と同型のnullable FK、`ON DELETE SET NULL`)に書き込む。
- 複数リレーから同じノートが届く重複排除は、既存の`exist = await this.apNoteService.fetchNote(uri); if (exist) return;`という早期リターンでほぼ解決される(2件目以降のAnnounceは新規作成経路に到達しない)。まれに同時到着した場合でも`UPDATE note SET "relayId"=$1 WHERE id=$2 AND "relayId" IS NULL`というfirst-writer-winsの書き込みにしたため、後続の書き込みは静かに0件更新で終わる。多対多の中間テーブルは持たない(全リレーの配送履歴を監査する機能ではなく、「最初に届いた1件」で十分という判断)。
- 配信はREST(`notes/relay-timeline`)とWebSocket(`relayTimeline`チャンネル)の両方に対応。stream配信は汎用の`notesStream`とは別に専用の`relayTimelineStream`イベントを新設し、`ApInboxService`のリレー分岐から直接発火する(全チャンネルが毎回firehoseをフィルタするコストを増やさないため)。
- 実機検証で判明した重要な事実: 本家Misskeyの`RelayService.renderFollowRelay()`は`object: '...#Public'`でFollowを送る、いわゆる「Subscriber」方式の購読になる。今回実際にActivity Relayサーバー(Go実装、`yukimochi/Activity-Relay`のフォーク)をビルドして実機の2インスタンス環境(a.test⇔b.test)に接続したところ、このリレーソフトウェアは「Subscriber」に対しては受信したCreateアクティビティを**Announceでラップせず生のまま転送する**仕様だった(Announceラップは「Follower」=Mastodon/Pleroma式の直接Followにのみ使われる)。そのため通常の購読フローでは`fromRelay`判定(Announce受信時のみ発火)が一度も呼ばれず、`relayId`は付与されない。これはこの特定のリレー実装とMisskeyの購読方式の組み合わせ由来の制約であり、JUICE側のコードの不備ではない。コード自体の正しさは、リレーactorの実鍵で本物のHTTP署名付きAnnounceアクティビティを直接b.testのinboxへ送信するテストで別途確認済み(`relayId`が正しくセットされ、`notes/relay-timeline`のレスポンスにも反映されることを実機で確認)。Announce形式で配信する他のリレー実装(または将来的なMisskey側のFollower方式対応)であれば、追加の実装無しでそのまま動作する設計になっている。

## 6. JUICE 専用 About ページ（JUICE 独自実装） ✅ 完了

### 実装方針

- CherryPick の About ページや内容を移植せず、JUICE 独自の About ページとして実装する。
- 開発者情報として **c30 (Zel9278)** を記載する。
- JUICE の GitHub リポジトリへのリンクを掲載する。
- JUICE の目的、独自機能、ライセンスなども掲載対象とする。
- `/about-misskey` は既存の Misskey / 派生版説明ページとして残し、JUICE 専用ページは `/about-juice` などの別ルートにする。

### 実装結果(2026-08-29)

- `/about-juice` を新設(`packages/frontend/src/pages/about-juice.vue`)。開発者情報(GitHubリンク)・ソースコード/ライセンス(AGPL-3.0-only)・JUICE独自機能一覧(アイコン付きカードグリッド)を掲載。
- `/about-misskey` は本家Misskeyの説明ページとしてそのまま残置し、CherryPickの実装は移植していない。
- 導線: 「このサーバーについて」ページ(`about.overview.vue`)と、コントロールパネル以外のユーザー向けメインメニュー(`ui/_common_/common.ts`)の両方から `/about-juice` へのリンクを追加。
- 追加で、サイト全体の既定アイコン(favicon・起動スプラッシュ・PWAアイコン・`instance.iconUrl`未設定時のフォールバック・システムメールのロゴ)をMisskeyの「Mi」マスコットからJUICE独自の雫アイコン(オレンジ系グラデーション、tabler-icons droplet-filled形状)に差し替えた。Playwright経由の実機スクリーンショットで見た目を確認済み。透過背景版(`packages/frontend/assets/juice-icon-transparent.png`)も別途用意し、About JUICEページのバナーと未ログイン時トップページのロゴ(`MkVisitorDashboard.vue`)にはこちらを使っている。

## 7. ウィジェットパネル・ドロワーの表示位置(左右)設定（JUICE 独自実装） ✅ 完了

### 現状

- デスクトップの常設ウィジェットパネルは `packages/frontend/src/ui/universal.vue` で画面右側に固定表示されている(`.nonTitlebarArea` 内でサイドバー→本文→ウィジェットパネルの順にDOM配置され、CSSも右側前提)。
- モバイル表示では、フッターメニューの「アプリ」アイコンから開く全画面ドロワー(`widgetsDrawer`、`packages/frontend/src/ui/_common_/common.vue`)としてウィジェットが表示され、画面左端(`left: 0`)からスライドインする作りになっている。
- どちらも表示される側(画面の左右どちらか)を変更する手段が無い。

### 実装方針

- ユーザーごとの個人設定として、ウィジェット表示(デスクトップの常設パネル・モバイルのドロワー)全体を画面の左右どちらに出すかを選べるようにする。**個々のウィジェットを左右に振り分ける話ではなく、ウィジェット表示そのもの1つの位置を切り替える設定。**
- 設定はユーザー個人の設定画面 `/settings/juice` から変更可能にする。

### 実装結果(2026-08-30)

- 新規の個人設定 `prefer.s.widgetsSide`(`'left' | 'right'`、既定 `'right'`)を追加。`/settings/juice` に `MkRadios` で「左/右」を選ぶセクションを新設した。
- デスクトップ(`universal.vue`): `.nonTitlebarArea`(flexコンテナ)内の本文エリアとウィジェットパネルに `order` を明示指定し(本文=1、ウィジェット=2が既定の「右」表示、`widgetsSide: 'left'` のときはウィジェット側を `order: 0` にしてサイドバーの直後・本文の前に回り込ませる)、あわせて区切り線(`border-left`/`border-right`)も左右で入れ替えた。サイドバー自体の位置は変更しない(常に画面最左)。
- モバイル(`common.vue`の`widgetsDrawer`): `left: 0` 固定だった位置を `widgetsSide` に応じて `left: 0`(左からスライドイン)/`right: 0`(右からスライドイン)に切り替え、スライドインのtransform方向(`translateX(-240px)`/`translateX(240px)`)もあわせて2系統に分岐させた。
- ⚠️ **経緯(2026-08-30、要修正)**: 当初この項目を「モバイル表示で各ウィジェット個別に左寄せ/右寄せを設定し、その指定に応じてドロワー内の並び順を変える」機能として実装・リリース(`MkWidgets.vue`の`place`切り替えボタン、`sortByPlace`による表示順ソート、`/settings/juice`のウィジェット一覧スイッチ)していたが、これはユーザーの意図と異なっていた。ユーザーが求めていたのは「ウィジェット表示(パネル/ドロワー)自体が画面のどちら側に出るか」という、UI全体の位置設定であり、個々のウィジェットの話ではなかった。旧実装は全面的に撤去し(`MkWidgets.vue`の`placeEditable`/`sortByPlace`関連コード、`ui/_common_/widgets.vue`への引き渡し、`/settings/juice`のウィジェット一覧スイッチ、関連i18nキー`widgetPlace*`)、上記の正しい理解に基づいて実装し直した。なお各ウィジェットが持つ`place: 'left' | null | 'right'`属性自体(`packages/frontend/src/ui/_common_/widgets.vue`)はJUICEが追加したものではなく本家Misskey由来の未使用属性のため、そのまま手を付けずに残している。

## 8. お知らせの投票機能（JUICE 独自実装） ✅ 完了

### 現状

- `packages/backend/src/models/Announcement.ts`(`MiAnnouncement`)は `title`/`text`/`imageUrl`/`icon`/`display`/`needConfirmationToRead`/`isActive`/`forExistingUsers`/`silence`/`userId`(個別宛て)を持つ。
- 既読管理は `AnnouncementRead.ts`(`userId`+`announcementId` のユニーク複合インデックスを持つ中間テーブル)、リアクションは `AnnouncementReaction.ts`/`AnnouncementReactionService.ts`/`announcements/reactions/{create,delete}.ts` が既にある。「お知らせに対する追加機能」の前例として、この2つの中間テーブルパターンが参考になる。
- 管理 API(`admin/announcements/{create,update,delete,list}.ts`)は paramDef を受けて `AnnouncementService` を呼ぶ薄い実装。
- 投票(Poll)は `packages/backend/src/models/Poll.ts` / `PollVote.ts` として既にあるが、**Note 専用設計**。`Poll` は `noteId` が PrimaryColumn かつ `MiNote` と `@OneToOne`(`onDelete: 'CASCADE'`)、さらに `noteVisibility`/`userId`/`userHost`/`channelId` という Note 由来の非正規化列を持つ。集計は `votes`(integer[])を `UPDATE poll SET votes[n] = votes[n]+1 WHERE noteId = ...` という生 SQL で直接インクリメントする方式(`notes/polls/vote.ts` / `PollService.vote()`)。期限切れ時は `EndedPollNotificationProcessorService`(BullMQ)が通知のみ送る。
- Poll は AP 連合(`renderVote`、投票締切の配信等)にも密結合しており、Announcement へそのまま拡張(`noteId` を nullable にして `announcementId` も持たせる等)するのは侵襲的。

### 実装方針

- 「本家のノート機能から引っ張ってくる」方針に沿って、**既存 Poll/PollVote のコード自体は拡張せず**、集計パターン(`votes` 配列 + 生 SQL 加算、`multiple` 対応、`(userId, 対象ID, choice)` のユニーク複合インデックスによる多重投票防止)を踏襲した専用エンティティ `AnnouncementPoll` / `AnnouncementPollVote` を新設する。
  - 理由: 既存 `Poll` は `noteId` が PrimaryKey かつ AP 配信ロジックに深く結合しており、Announcement 用に条件分岐を増やすより、パターンだけ流用した別エンティティにする方が既存 Note 機能への影響もなく素直。
- `AnnouncementPollVote` は `AnnouncementRead` / `AnnouncementReaction` と同じ「ユーザー×お知らせ」中間テーブルパターン(`(userId, announcementId, choice)` ユニーク複合インデックス)を踏襲する。
- Announcement はそもそも連合機能を持たないため、AP 連合は対象外とする。
- 選択肢・複数選択可否・期限といった入力項目は、既存 Note 用 Poll の `IPoll` 形状(`choices`/`multiple`/`expiresAt`)に揃える。
- 管理画面のお知らせ作成・編集フォーム(`pages/admin/announcements.vue`)に投票設定 UI を追加し、お知らせ表示側(`MkAnnouncementDialog.vue` など)に投票 UI(既存 `MkPoll.vue` 相当の見た目・挙動)を組み込む。
- 期限切れ時の扱い(通知の要否、投票締切後の表示)は実装着手時に詰める。
- 機能自体の有効・無効設定は、既存のお知らせ機能の一部として扱うか、コントロールパネルの「JUICE」項目に置くかは実装着手時に判断する。

### 実装結果(2026-08-30)

- `MiAnnouncementPoll`(`announcementId`をPrimaryColumn兼`@OneToOne`FKにする、`MiPoll`の`noteId`パターンを踏襲)と`MiAnnouncementPollVote`(`(userId, announcementId, choice)`ユニーク複合インデックス、`MiAnnouncementReaction`と同型)を新設した。`migration:generate`で生成し、既存の`AddAnnouncementReaction`migrationと同型の構造(CREATE TABLE×2・FK制約・インデックス)になることを確認済み。`pnpm migrate`→`pnpm revert`→`pnpm migrate`のロールバック往復を実機DBで検証済み。
- 投票の検証ロジック(存在確認・期限切れ確認・選択肢範囲確認・重複投票確認・生SQLでの`votes`配列インクリメント)はすべて新規`AnnouncementPollService`に集約した。Note投票(`PollService.vote()`と`notes/polls/vote.ts`)は同じロジックが2箇所に重複しており技術的負債として認識済みのコメントが残っていたため、新規実装ではこの重複を持ち込まず、エンドポイント(`announcements/polls/vote`)は`IdentifiableError`を`ApiError`にマップするだけの薄いラッパーにした。
- **投票は作成後編集不可**とした。`AnnouncementService.update()`のフィールド許可リストに`poll`を追加せず、`admin/announcements/update`のparamDefにも`poll`を含めていない。理由: 投票後に`choices`を変更すると`votes`配列とのインデックス対応が壊れるため(Note投稿の投票が一切編集不可なのと同じ理由)。
- **機能ON/OFFのJUICE設定トグルは追加しなかった。** お知らせの作成自体が`requireModerator: true`で既にモデレーター限定であり、投票を付けるかどうかは作成時に個別選択するだけなので十分opt-inと判断した。最も近い前例である`AnnouncementReaction`(同じ「管理者コンテンツ+ユーザー操作」という形の既存機能)にも専用トグルが無いことに揃えた。
- 個人宛てのお知らせ(`userId`指定あり)には投票を付けられないようにした。`AnnouncementService.create()`側でINSERT前にガードし、`announcements/polls/vote`エンドポイントでも`announcements/reactions/{create,delete}.ts`と全く同じガード(本人以外には`noSuchAnnouncement`で存在を隠し、本人には専用エラー)を転用した。
- フロントエンドは`MkPoll.vue`をベースに`MkAnnouncementPoll.vue`を新設。**`MkPoll.vue`との意図的な差分**: お知らせはノートの`pollVoted`ストリームのようなフロント側購読を持たない(`announcementReacted`/`announcementUnreacted`も同様に未購読)ため、`MkPoll.vue`のように投票後の更新をストリーム頼みにすると件数がスタックして見える。代わりに`MkAnnouncementReactions.vue`の`applyLocally()`と同じ楽観的ローカル更新+失敗時ロールバックの方式を採用した。
- 埋め込み先は`pages/announcement.vue`・`pages/announcements.vue`(いずれも`MkAnnouncementReactions`と同じ`!announcement.forYou`ガードの直下)のみとし、`MkAnnouncementDialog.vue`(強制既読ダイアログ)には追加していない。このダイアログは元々リアクションUIも持たない意図的に最小限の作りであるため、投票も同様に対象外とした。
- 管理画面(`pages/admin/announcements.vue`)は既存の汎用コンポーネント`MkPollEditor.vue`(Note非依存)をそのまま流用し、新規エディタは作らなかった。「投票を追加」スイッチは新規作成時(`id == null`)のみ表示し、既存のお知らせには投票エディタの代わりに総投票数の読み取り専用表示のみを出す。
- `pnpm build-misskey-js-with-types`で misskey-js の型に`poll`フィールドと`announcements/polls/vote`エンドポイントが正しく反映されることを確認済み。この変更で`Announcement`型に必須フィールド`poll`が増えたため、`MkAnnouncementDialog.stories.impl.ts`のモックデータと`MkUserAnnouncementEditDialog.vue`(個人宛てお知らせ編集、投票非対応)の型に副次的な修正が必要だった。

## 9. LaTeX(数式)表示機能の復旧（JUICE 独自実装） ✅ 完了

### 現状

- 本家Misskeyはコミット `e51432a461`(「remove katex」、syuilo、2023-01-11)でLaTeXレンダリングを削除した。理由はコミットメッセージに明記されていないが、削除直前に「バンドルサイズ削減のため katex を非同期ロード」→「revert」という迷走があり、当時の実装(`MkFormulaCore.vue`)が `katex.renderToString()` の出力を `trust` 設定なしで `v-html` に直接埋め込んでいたため、リモートから届く未検証の TeX 入力による XSS リスク(`\href{javascript:...}` 等)が背景にあったと推測される(推測であり、削除コミット自体に明言はない)。
- このリポジトリ(misskey-juice)はこの削除コミットを祖先として含むフォークであり、削除は JUICE 固有の判断ではなく本家の決定をそのまま引き継いでいるだけ。JUICE フォーク自体は本家 `develop` の 2026.7.0 リリース相当(コミット `8ea4a0ecac`)から分岐している。
- MFM パーサー本体(`mfm-js` 0.26.0、frontend/backend/frontend-embed 全て同一バージョン)は現行バージョンでも `mathInline`/`mathBlock` ノードを完全にサポートしている。パーサー側の改修は不要。
- `packages/frontend/src/components/global/MkMfm.ts` の `mathInline`/`mathBlock` case は現状 `<code>` タグで生の TeX ソースをそのまま出力するだけで、実際のレンダリングは行われていない。
- KaTeX の依存(`package.json`/`pnpm-lock.yaml`/`vite.config.ts`)、および削除された `MkFormula.vue`/`MkFormulaCore.vue` は現存しない。削除前のコードは `git show e51432a461^:packages/frontend/src/components/MkFormulaCore.vue` などで参照可能。

### 実装方針

- CherryPick からの移植ではなく、本家 Misskey が過去に持っていた標準機能を JUICE 側で復旧する位置づけとする。
- `katex` パッケージを frontend に再追加し、`MkFormula.vue`/`MkFormulaCore.vue` 相当のコンポーネントを再実装する。`MkMfm.ts` の `mathInline`/`mathBlock` case をこの新コンポーネント呼び出しに差し替える。
- セキュリティ対策として、削除前の実装が抱えていた「未検証 TeX 入力の `v-html` 直接埋め込み」による XSS リスクを踏まえ、KaTeX の `trust` オプションを `false` に設定し、`strict` 設定も有効にした上で復旧する。`throwOnError: false` として不正な数式入力時にクラッシュしないようにする。
- 機能の ON/OFF は、コントロールパネルの **「JUICE」項目** に設定を追加する。無効時はサーバー全体で数式レンダリングを無効化し、`<code>` 表示(現状の挙動)にフォールバックする。
- 対象範囲(ノート本文のみか、プロフィール文など MFM を使う他の箇所も含めるか)は実装着手時に精査する。

### 実装結果

- `katex@0.18.4` を frontend に追加。`MkFormulaCore.vue`(実際に `katex.renderToString(formula, { throwOnError: false, strict: true, trust: false })` を呼び `v-html` で埋め込む)と、`MkFormula.vue`(`defineAsyncComponent` で `MkFormulaCore.vue` を遅延importしつつ、設定取得までは無効時と同じ `<code>` 表示にしておくラッパー)の2段構成で復旧した。
- `MkMfm.ts` の `mathInline`/`mathBlock` case を `h(MkFormula, { formula, block })` に差し替え。パーサー(`mfm-js`)側の改修は不要だった。
- ON/OFF は当初の想定通り `JuiceSettingsValue.latexEnabled`(既定値 `true`)として実装し、`admin/juice/settings` / `admin/juice/update-settings` / `juice/public-settings` の3エンドポイントに反映した。復旧機能という位置づけのため既定値は無効ではなく **有効** にした(絵文字申請など「JUICE独自の新機能」は既定無効にしているが、これは本家が過去に持っていた標準機能の復旧であるため方針が異なる)。
- `MkMfm.ts` は `h()` ベースの関数コンポーネントであり、`juice/public-settings` を都度非同期取得する既存のフロント側パターン(ページ/ダイアログのsetup時に1回叩く方式)をそのまま使うと、ノート1件ごと・数式ノードごとに重複リクエストが発生してしまう。この既存パターン自体がコンポーネント間でキャッシュを共有していない問題を抱えていたため、新規に `packages/frontend/src/utility/juice-latex.ts` としてモジュール単位でPromiseをキャッシュする `fetchJuiceLatexEnabled()` を追加し、それだけを解決策として採用した(既存の他の呼び出し元(`accounts.ts`/`MkSignupDialog.vue`/`MkVisitorDashboard.vue`/`emoji-request.vue`/`timeline.vue`)をこの共有キャッシュに統一するリファクタは、今回のスコープ外として見送った)。
- 数式が有効になるまでの初回描画は、無効時のフォールバックと同じ `<code>` 表示(値取得後に非同期でKaTeX描画へ切り替え)。
- Storybookは `MkFormulaCore.vue`(純粋な描画コンポーネント)のみ対象に追加。`MkFormula.vue` は `juice/public-settings` への非同期APIコールが絡み簡単にモック化できないため、意図的にStorybook対象から外した。
- backend e2e テスト(`admin/juice/settings` 等の `deepStrictEqual` アサーション)に `latexEnabled: true` を追加。この環境では test-db/test-redis(docker-compose の `juice-test-db`/`juice-test-redis`)へ到達できず e2e スイート自体は実行できなかったため、`pnpm --filter backend typecheck` / `pnpm --filter frontend typecheck` / 対象ファイルへの `eslint` 実行のみで確認した。実機での `pnpm --filter backend test:e2e` 実行は別途推奨。

## 10. ロードマップ外の追加実装

このロードマップの策定後、承認式新規登録(1.)の実装過程で見つかった課題への対応として、当初計画には無かった以下の機能を追加実装した。あわせて、ロードマップ策定より前の1.0リリース時にmisskey-artから移植済みの機能・修正のうち、本ロードマップの複数項目から前例として直接参照しているものも記録として残す(詳細な移植経緯は`PORTING_STATUS.md`を参照)。

### お知らせリアクション機能の移植(misskey-art PR #68、2026-08-24)

- misskey-art (`art/main`) から移植した機能。JUICE独自実装ではなく、本ロードマップの策定・項目0(JUICE設定基盤)より前の1.0リリース時に移植済み。
- ノートと同じ感覚でお知らせにリアクションを付けられる。1ユーザーが複数のリアクションを付けられる、カスタム絵文字とUnicode絵文字の両方に対応、ローカル専用(リモートのカスタム絵文字は受け付けない)、リアクションしたユーザー一覧を表示可能。ユニーク制約は`(userId, announcementId, reaction)`。
- 新規ファイル: `AnnouncementReaction.ts`/`AnnouncementReactionEntityService.ts`/`AnnouncementReactionService.ts`/`announcements/reactions.ts`/`announcements/reactions/{create,delete}.ts`/`MkAnnouncementReactions.vue`/`MkAnnouncementReactedUsersDialog.vue`など。
- 本ロードマップの項目3(絵文字申請)・8(お知らせの投票機能)は、いずれもこの機能が持つ「ユーザー×お知らせ」中間テーブルパターン(`(userId, announcementId, 識別子)`ユニーク複合インデックス)を直接のテンプレートとして参照・踏襲している。

### センシティブ画像のぼかし表示バグ修正の移植(misskey-art PR #67、2026-08-24)

- 本家Misskey 2026.7.0系に存在した不具合で、CW(Content Warning)を開いた後やタブ切替時にセンシティブ画像のblurhashぼかしが正しく描画されないバグを、misskey-artの修正ごと移植した。JUICE独自の不具合ではない。
- 原因: 対象要素が`display: none`の状態でマウントされると`clientWidth`/`clientHeight`が0になり、blurhashの描画サイズ計算が崩れていた。
- 修正内容: `MkBlurhash.vue`(`ResizeObserver`による動的サイズ再計算)、`MkImgWithBlurhash.vue`(CW内でのblurhash描画修正)、`MkMediaImage.vue`(センシティブ画像の表示ロジック改善)。あわせて`reset-db.ts`の開発用DB誤削除防止ガードも同じコミット群で移植済み(この既存ガードに残っていた別経路の穴を、本ロードマップの「開発用DB誤消去バグの修正(2026-08-29)」で追加で塞いだ)。

### 承認式新規登録まわりの修正

- 承認待ちアカウントでAPIエラーが発生すると強制的にサインアウトされる不具合を修正(`packages/frontend/src/accounts.ts` の `fetchAccount()` が未知のエラーIDを全てアカウント削除扱いしていたのが原因)。

### システムメールの多言語対応(2026-08-25 〜 2026-08-26)

- サインアップ確認メールなど、`EmailService.sendEmail()` を呼ぶ11箇所すべてが英語または日英併記でハードコードされていたのをi18n化。
- `UserProfile.emailLang` / `UserPending.emailLang` を新設し、ユーザーごとにメールの受信言語を保持。
- 決め方:
  - サインアップフォームに言語選択欄を追加(`MkSignupDialog.form.vue`)。`packages/i18n` の対応28言語(`langs`)から選択。
  - 登録後も設定画面の「JUICE」項目(`/settings/juice`)から変更可能(`i/juice/update-email-lang`)。
  - 未選択時はコントロールパネルの「JUICE」項目で設定するインスタンス既定言語(`defaultEmailLang`)にフォールバック。
- `EmailI18nService` を新設し、`packages/i18n` の `locales` と `misc/i18n.ts` の `I18n` クラスを接続。
- `ja-JP.yml` に `_email.*` ブロック(11テンプレート)を追加。他言語ロケールファイルはCrowdin管理のため手動編集していない。
- 翻訳が存在しない言語(ja-JP以外はすべて該当)向けに、日本語ではなく英語にフォールバックするようJUICE側で英訳テーブルを保持(`EmailI18nService.ts` 内 `emailFallbackLocaleEnUS`)。将来Crowdinで実際に翻訳されれば、そちらへ委ねてこのフォールバックは撤去できる設計。

### 絵文字申請(3.)まわりの修正(2026-08-29)

- 絵文字申請の承認・却下結果メールを受け取るかどうかをユーザーごとに設定できるように、`UserProfile.receiveEmojiRequestResultEmail`(既定`true`)を追加。設定の「JUICE」項目からトグルできる。
- `admin/emoji-requests/approve` / `reject` のメール送信条件が `profile.email != null` しか見ておらず、`emailVerified: false` のユーザーにもメールを送信してしまっていた不具合を修正(他の送信箇所は元々`emailVerified`を確認していた)。

### 承認式新規登録(1.)まわりの追加: 審査状況確認コード(2026-08-29)

- メールアドレスを収集しない(メール必須ではない)サーバーでは、承認式新規登録の申請後に審査状況を確認する手段が一切無かったため、申請時に確認コードを発行する仕組みを追加。
- 新規エンティティ `signup_approval_check` に申請ごとの状態(pending/approved/declined)を記録。ユーザー行が却下により物理削除された後も、コード自体は別テーブルに残るため状態を確認できる(FKは`ON DELETE SET NULL`)。
- 公開エンドポイント `juice/signup-check-status` を新設し、`signup` / `signup-pending` のレスポンスに `checkCode` を追加。
- フロントエンドでは確認コードをこの端末のlocalStorageに配列で保存(1端末から複数アカウント分申請するケースに対応)し、新設の `/signup-check` ページで一覧確認・手動追加・個別削除ができる。登録完了時の案内はコピーボタン付きの専用ダイアログ(`MkSignupApprovalPendingDialog.vue`)で表示。未ログイン時のトップページからは画面右からスライドインするパネル(狭い画面では全画面表示、`MkSignupCheckPanel.vue`)で開く。

### 開発用DB誤消去バグの修正(2026-08-29)

- `NODE_ENV=test`かつ`built/.config.json`が実際には`default.yml`由来(開発用DB向け)のまま、という設定ズレの状態でアプリを起動すると、`createPostgresDataSource`が無条件に`synchronize`/`dropSchema`を有効化し、開発用DBのスキーマを丸ごと削除・再作成してしまう不具合があった(実際にこの事故で開発環境のDBを一度消失した)。
- 以前`packages/backend/src/misc/reset-db.ts`にのみ追加されていた「接続先DB名に`test`を含むかを確認する」ガードを、`createPostgresDataSource`本体・`test/utils.ts`の`initTestDb`・`test/unit/chart.ts`にも追加し、同種の穴を塞いだ。

### リレータイムライン(5.)のタブ表示名短縮(2026-08-29)

- Home/Local/Social/Global等の他タブラベルが2〜5文字程度なのに対し「リレータイムライン」だけ長かったため、タブ表示専用のi18nキー(`_juice.relayTimelineTab`、表示は「リレー」)を分離した。設定画面の見出しは引き続き「リレータイムライン」のまま。

### リレータイムライン(5.)に特定リレーへの絞り込みフィルタを追加(2026-08-30)

- 従来はリレータイムラインが受理済み全リレー経由のノートをまとめて表示するのみで、特定のリレーだけに絞り込む手段が無かった。
- `notes/relay-timeline`(REST)・`relayTimeline`(stream channel)双方に任意の`relayIds`パラメータ(配列)を追加し、指定した場合は`note.relayId`がそのいずれかと一致するノートのみを返すように。フィルタ選択肢を組み立てるための新規エンドポイント`juice/relays`(受理済み=`status: 'accepted'`のリレーのみを`{id, host}`で返す)も追加した。
- 初期実装は単一リレーのみを選べる`relayId`(単数)+タイムラインヘッダーの「…」オプションメニューの`type: 'radio'`項目+ページローカルな非永続の`ref`という構成だったが、レビューで「複数選択の方が良い」「JUICEの設定(`/settings/juice`)からも設定できるようにしたい」との指摘を受け、以下の構成に作り直した。
  - パラメータを`relayIds`(配列、複数指定可、空/未指定=絞り込みなし)に変更。
  - 選択状態は`prefer`の新規キー`relayTimelineFilter`(`accountDependent: true`、既定`[]`)としてアカウント単位で永続化するように変更(ページを離れても、別デバイスでログインしても保持される)。
  - タイムラインヘッダーの「…」オプションメニューは`type: 'radio'`から`type: 'parent'`(リレーごとの`type: 'switch'`を子に持つサブメニュー)に変更し、複数のリレーを個別にON/OFFできるようにした。
  - `/settings/juice`にも「表示するリレー」セクションを追加し、リレー一覧を`MkSwitch`で列挙。ヘッダーメニューと設定ページはどちらも同じ`prefer.s.relayTimelineFilter`を読み書きするため、片方で変更すればもう片方にも即座に反映される。
  - `MkStreamingNotesTimeline.vue`の`relay`(単数)プロパティは`relays`(配列)に変更し、REST・stream channel双方のパラメータ組み立てと再接続用`watch`を配列対応に更新した。
- Playwrightでの実機確認: リレーを2件チェックすると、その2件経由のノートのみがタイムラインに残ること、`/settings/juice`側でも同じ2件がチェック済みで表示されることを確認済み。

### MFM引用のネスト段数に表示上の上限を追加(2026-08-30)

- 本家Misskeyが使う`mfm-js`の引用構文は`>`の後のスペースが不要(`>_<`のような顔文字も行頭に来ると引用扱いされる)かつネスト段数の上限も無い仕様(パーサー自体はJUICE固有の実装ではなく本家由来)。そのため`>>>>>>>>>>>>>>>>>>>>>>>>>`のように`>`を並べただけのノートが、その数だけネストした引用`div`(1段あたり`margin:8px`+`padding:6px`+左ボーダー)を積み重ね、画面が異常に縦長になる問題があった。
- 顔文字の誤爆(パーサー側の`>`後スペース必須化)は、ASTの意味自体を変えてしまい連合先の解釈とズレるため見送り、表示側(`packages/frontend/src/components/global/MkMfm.ts`)でのネスト段数の上限のみを追加する方針とした。
- `genEl`内に`quoteDepth`カウンタを追加し、`MAX_QUOTE_DEPTH`(5段)を超えた引用ノードは追加の枠(`div`/`border-left`)を付けずに子要素をそのまま展開するようにした。構文解釈自体は変えていないため連合には影響しない。
- 実機確認: 25個の`>`を並べたノートで、mfm-js側のAST上は20段ネストされることを確認した上で、表示は5段の引用インジケーターで打ち止めになり、以降のテキストがフラットに表示されることをPlaywrightで確認済み。単純な`>_<`のような1段の引用(誤爆)はこれまで通り1段の引用として表示され、意図しない挙動変化は無い。

### JUICE専用Aboutページ(6.)の機能一覧・開発者情報を更新(2026-08-30)

- 機能一覧に、これまで掲載していなかった「お知らせへの複数リアクション」(misskey-artからの移植機能、`10.`参照)を追加。リレータイムラインの説明文も単一リレー選択の名残りだった「特定のリレーだけに絞り込むフィルタ付き」から、実際の仕様(複数選択可)に合わせて「複数選択可能な絞り込みフィルタ付き」に修正した。
- 開発者情報のセクションを、`FormLink`によるテキストリンク1行から、`/about-misskey`の「Project Members」セクションと同じ見た目(アバター画像+名前をカード状に配置)のカードに変更。GitHubアバターは`https://github.com/<username>.png`形式のショートカットURLを利用し、数値のGitHubユーザーIDを調べる必要をなくした。

### 既存フォーム3箇所へのcaptcha追加(JUICE独自の追加保護、2026-08-30)

- Misskeyには既にcaptcha機構(hCaptcha/mCaptcha/reCAPTCHA/Turnstile/TestCaptcha、`CaptchaService`)があり、サインイン(`SigninApiService.ts`)とサインアップ(`SignupApiService.ts`、承認式申請もこの同じフォーム経由なので既にカバー済み)には既に適用されていた。ユーザーからの指摘を受け、それ以外にcaptcha保護すべき箇所を調査し、以下3箇所に追加した。
  - パスワード再設定申請(`request-reset-password`) — 未認証で誰でも叩けるメール送信トリガーだったため。
  - 絵文字申請(`emoji-requests/create`) — `requireCredential: true`だが、JUICE独自の追加保護としてユーザーの希望で追加(本家の他の認証済みアクションに前例が無い構成だが、意図的な選択)。
  - 承認式登録の審査状況確認(`juice/signup-check-status`)。
- `CaptchaService`に、Signup/Signinの生Fastifyルートが持つ「各プロバイダの有効判定→対応する`verifyXxx`呼び出し」という重複ロジック(既存2箇所)をこれ以上増やさないよう、通常の`Endpoint`から使える共有ヘルパー`verifyRequestCaptcha(meta, response)`を新設した。既存の`verifyHcaptcha`等・Signup/Signinの生ルート自体は無改修。
- 3エンドポイントとも、Signup/Signinと同じフィールド名(`'hcaptcha-response'`等)のcaptcha応答パラメータを追加し、ハンドラの最初(他のガードより前)で検証するようにした。エラーはエンドポイントごとに新規UUIDの`captchaFailed`とした。
- `juice/signup-check-status`は`MkSignupCheckForm.vue`が画面表示のたびに保存済み全コードを自動で無言リフレッシュする作りのため、captcha必須にすると自動リフレッシュのたびにcaptchaを解かされてしまう。ユーザーと相談の上、新規パラメータ`isNewSubmission`(既定`false`)を追加し、**新規コード追加時のみcaptcha必須**とし、自動リフレッシュ経路(`isNewSubmission`省略)はcaptcha無しのまま維持する方針にした。この設計上、この経路はbotが`isNewSubmission`を省略すれば回避できてしまう点は、既知のトレードオフとして許容している。
- フロントエンド3ファイル(`MkForgotPassword.vue`/`emoji-request.vue`/`MkSignupCheckForm.vue`)は、いずれも既存の`MkSignupDialog.form.vue`のcaptcha実装パターン(5プロバイダ分の条件付き`<MkCaptcha>`、`shouldDisableSubmitting`相当の送信ボタン無効化、失敗時の`.reset?.()`)をそのまま踏襲した。
  - レビューで指摘: `MkCaptcha.vue`の`reset()`はウィジェットの表示状態(vendor SDK側のwidget、テスト用captchaの入力欄等)をリセットするだけで、`v-model`で親に渡している応答トークン自体はクリアしていなかった。そのため`.reset?.()`を呼んでも親側の`xxxResponse`refには直前の(既に使用済みの)トークンが残り続け、見た目は「未解決」なのに送信ボタンが誤って有効なままになり、再送信すると古いトークンのままcaptcha検証に失敗する不具合があった(特に`MkSignupCheckForm.vue`の「コードを間違えて再度追加し直す」という典型的な再試行フローで顕在化する)。個別の呼び出し元3箇所を直すのではなく、`MkCaptcha.vue`の`reset()`自体に`emit('update:modelValue', null)`を追加して根本修正した(既存の`MkSignupDialog.form.vue`も同じ潜在バグを持っていたが、サインアップは基本1回限りのフローのため表面化していなかった)。
  - レビューで指摘: `CaptchaService`に新設した`verifyRequestCaptcha`に対する単体テストが無かったため、`test/unit/CaptchaService.ts`に既存の`describe('verifyXxx', ...)`群と同じスタイル(`testCaptchaError`ヘルパー再利用)でテストを追加した。この関数は`NODE_ENV==='test'`で早期returnする仕様(Signup/Signinの生ルートと同じ、e2eテストが実際のcaptcha設定を要求されないようにするための既存の仕組み)のため、テスト内で一時的に`process.env.NODE_ENV`を上書きして実際の検証ロジックを通している。
  - `juice/signup-check-status`の`isNewSubmission`によるcaptcha分岐自体は、e2eテストでは検証できない。Signup/Signinの既存captchaロジック同様、e2e実行時は`NODE_ENV==='test'`により`verifyRequestCaptcha`が常に早期returnするため、captchaを実際に要求させて失敗させるテストが原理的に書けない(この制約はJUICE固有ではなく、既存のSignup/Signinのcaptcha検証も同じ理由でe2eテストが無い)。
