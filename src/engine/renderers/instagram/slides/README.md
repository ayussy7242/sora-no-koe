# IG Slides

構成を増やしやすくするために、スライドは種類と共通部品で分離しています。

**フォルダ構成**
1. `morning/`  
朝投稿（daily系）スライド
2. `resonance/`  
共鳴投稿スライド
3. `moon/`  
夜（月）投稿スライド
4. `moon_event/`  
満月 / 新月の投稿スライド
5. `monthly_overview/`  
月間カレンダースライド
6. `common/`  
共通ヘルパー（`shared.js`, `glyph_layout.js`, `header.js`, `footer.js`, `background.js` など）
7. `index.js`  
投稿タイプごとのまとめexport

**運用メモ**
1. 新しい投稿タイプは、`morning/` と同じ粒度でフォルダ追加
2. 既存の共通処理は `common/` に集約
3. トークンは `tokens/` で共通/投稿別に分離
4. `moon_event/` は `morning/` と同じレイアウトを基準に、内容差分を直接編集する
