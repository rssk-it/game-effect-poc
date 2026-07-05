# image-gen — OpenRouter 画像生成スクリプト

OpenRouter の [Images API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation)
(`POST /api/v1/images`) を使って、CLI からモデル・プロンプト・アスペクト比を指定して画像を生成します。
参照画像（image-to-image / 編集）も渡せます。

- 実装: Python 標準ライブラリのみ（追加インストール不要）
- デフォルトモデル: `openai/gpt-image-2`（`-m/--model` で上書き可能）

## 前提

プロジェクトルートの `.env` に API キーを設定しておきます（`.env.example` 参照）。

```
OPENROUTER_API_KEY=sk-or-v1-...
```

`.env` が無い場合は環境変数 `OPENROUTER_API_KEY` にフォールバックします。

## 使い方

```bash
# text-to-image（デフォルトモデル openai/gpt-image-2）
python scripts/image-gen/generate.py "a cute red panda astronaut floating in space" -a 16:9

# モデルを上書き
python scripts/image-gen/generate.py "sunset over mountains" -m google/gemini-3-pro-image -a 3:2

# 参照画像を渡す（image-to-image / 編集）
python scripts/image-gen/generate.py "turn this red circle into a glowing magic orb" -i red-circle.png -a 1:1

# 参照画像は複数・URL も可
python scripts/image-gen/generate.py "combine these" -i a.png -i https://example.com/b.jpg

# リクエスト内容だけ確認（API を叩かない・無料）
python scripts/image-gen/generate.py "test prompt" -a 16:9 --dry-run
```

生成された画像はデフォルトで `scripts/image-gen/output/` に `openrouter.png`（複数枚なら
`openrouter_1.png`, `openrouter_2.png` ...）として保存されます。`-o` で保存先を変更できます。

## オプション一覧

| オプション | 説明 | 例 / 既定値 |
| --- | --- | --- |
| `prompt`（位置引数） | 生成プロンプト（必須） | `"a red panda"` |
| `-m, --model` | モデル ID | 既定 `openai/gpt-image-2` |
| `-a, --aspect-ratio` | アスペクト比 | `1:1` `16:9` `9:16` `4:3` `3:4` |
| `-r, --resolution` | 解像度ティア | `512` / `1K` / `2K` / `4K` |
| `--size` | ピクセル指定サイズ | `2048x2048` |
| `-q, --quality` | 品質 | `auto` / `low` / `medium` / `high` |
| `-f, --output-format` | 出力フォーマット | 既定 `png`（`png`/`jpeg`/`webp`） |
| `--background` | 背景 | `auto` / `transparent` / `opaque` |
| `--seed` | 乱数シード（再現用） | `42` |
| `-n, --num` | 生成枚数（1〜10） | 既定 `1` |
| `--output-compression` | webp/jpeg 圧縮率 | `0`〜`100` |
| `-i, --ref` | 参照画像（パス or URL・複数可） | `-i red-circle.png` |
| `-o, --output` | 出力先ファイル or ディレクトリ | 既定 `output/` |
| `--dry-run` | API を叩かずリクエストを表示 | — |

> 注: `aspect_ratio` / `resolution` / `size` / `quality` などの対応可否はモデルにより異なります。
> OpenRouter がプロバイダ間で正規化しますが、モデルが未対応のパラメータを渡すと API がエラーを返す
> 場合があります。その際は表示されるエラー JSON に従って `--size` と `-a` を使い分けてください。

## 利用可能な画像モデルの調べ方

```bash
curl "https://openrouter.ai/api/v1/models?output_modalities=image"
```

例: `openai/gpt-image-2`, `openai/gpt-image-1`, `google/gemini-3-pro-image`,
`bytedance-seed/seedream-4.5` など。
