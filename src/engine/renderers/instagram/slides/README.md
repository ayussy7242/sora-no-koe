# IG Slides

構成を増やしやすくするために、スライドは種類と共通部品で分離しています。

**フォルダ構成**
1. `daily/`  
毎日の投稿スライド
2. `moon_event/`  
満月 / 新月の投稿スライド
3. `common/`  
共通ヘルパー（`shared.js`, `glyph_layout.js`, `header.js`, `footer.js`, `background.js` など）
4. `index.js`  
投稿タイプごとのまとめexport

**運用メモ**
1. 新しい投稿タイプは、`daily/` と同じ粒度でフォルダ追加
2. 既存の共通処理は `common/` に集約
3. トークンは `tokens/` で共通/投稿別に分離
4. `moon_event/` は `daily/` と同じレイアウトを基準に、内容差分を直接編集する
