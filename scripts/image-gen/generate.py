#!/usr/bin/env python3
"""OpenRouter Images API を使って画像を生成する CLI スクリプト。

標準ライブラリのみで実装（追加インストール不要）。

エンドポイント: POST https://openrouter.ai/api/v1/images
ドキュメント:   https://openrouter.ai/docs/guides/overview/multimodal/image-generation

使用例:
  # text-to-image（デフォルトモデル openai/gpt-image-2）
  python generate.py "a cute red panda astronaut" -a 16:9

  # モデルを上書き
  python generate.py "sunset over mountains" -m google/gemini-3-pro-image -a 3:2

  # 参照画像（image-to-image / 編集）
  python generate.py "turn this into a glowing magic orb" -i ../../red-circle.png -a 1:1

  # リクエスト内容だけ確認（API を叩かない）
  python generate.py "test prompt" --dry-run
"""

import argparse
import base64
import json
import mimetypes
import sys
import urllib.error
import urllib.request
from pathlib import Path

API_URL = "https://openrouter.ai/api/v1/images"
DEFAULT_MODEL = "openai/gpt-image-2"

# 拡張子 → デフォルト保存拡張子のマッピング（media_type が無い場合に使用）
FORMAT_EXT = {"png": "png", "jpeg": "jpg", "jpg": "jpg", "webp": "webp"}


def find_project_root(start: Path) -> Path:
    """start から親方向に辿り、.env を含むディレクトリを探す。

    見つからなければ start（＝スクリプトのあるディレクトリ）を返す。
    """
    for parent in [start, *start.parents]:
        if (parent / ".env").is_file():
            return parent
    return start


def load_env_file(env_path: Path) -> dict:
    """素朴な .env パーサ。KEY=VALUE の辞書を返す。"""
    env = {}
    if not env_path.is_file():
        return env
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            env[key] = value
    return env


def resolve_api_key(project_root: Path) -> str:
    """.env → 環境変数 の順で OPENROUTER_API_KEY を取得。"""
    import os

    env = load_env_file(project_root / ".env")
    key = env.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit(
            "エラー: OPENROUTER_API_KEY が見つかりません。\n"
            f"  {project_root / '.env'} に OPENROUTER_API_KEY=sk-or-v1-... を設定するか、\n"
            "  環境変数 OPENROUTER_API_KEY を設定してください。"
        )
    return key


def build_reference(ref: str) -> dict:
    """参照画像 1 件を input_references 用のオブジェクトに変換する。

    http(s) URL はそのまま、ローカルパスは base64 data URL に変換する。
    """
    if ref.startswith("http://") or ref.startswith("https://"):
        url = ref
    else:
        path = Path(ref)
        if not path.is_file():
            sys.exit(f"エラー: 参照画像が見つかりません: {ref}")
        mime, _ = mimetypes.guess_type(path.name)
        mime = mime or "image/png"
        b64 = base64.b64encode(path.read_bytes()).decode("ascii")
        url = f"data:{mime};base64,{b64}"
    return {"type": "image_url", "image_url": {"url": url}}


def build_payload(args) -> dict:
    """CLI 引数から API リクエスト body を組み立てる（None は含めない）。"""
    payload = {"model": args.model, "prompt": args.prompt}

    optional = {
        "aspect_ratio": args.aspect_ratio,
        "resolution": args.resolution,
        "size": args.size,
        "quality": args.quality,
        "output_format": args.output_format,
        "background": args.background,
        "seed": args.seed,
        "output_compression": args.output_compression,
    }
    for field, value in optional.items():
        if value is not None:
            payload[field] = value

    if args.num and args.num != 1:
        payload["n"] = args.num

    if args.ref:
        payload["input_references"] = [build_reference(r) for r in args.ref]

    return payload


def post_request(api_key: str, payload: dict) -> dict:
    """OpenRouter Images API に POST してレスポンス JSON を返す。"""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # ランキング用の任意ヘッダ（無くても動作する）
            "HTTP-Referer": "https://github.com/local/game-effect",
            "X-Title": "game-effect image-gen",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        sys.exit(f"エラー: API が HTTP {e.code} を返しました。\n{body}")
    except urllib.error.URLError as e:
        sys.exit(f"エラー: API へ接続できません: {e.reason}")


def ext_from_media_type(media_type: str, fallback: str) -> str:
    """media_type から保存拡張子を決める。"""
    if media_type:
        subtype = media_type.split("/")[-1]  # image/png -> png, image/svg+xml -> svg+xml
        subtype = subtype.split("+")[0]      # svg+xml -> svg
        return FORMAT_EXT.get(subtype, subtype)
    return FORMAT_EXT.get(fallback, fallback)


def save_images(result: dict, out_arg: str, default_dir: Path, fallback_fmt: str) -> list:
    """レスポンスの base64 画像をデコードしてファイルに保存し、保存パス一覧を返す。"""
    items = result.get("data") or []
    if not items:
        sys.exit(f"エラー: レスポンスに画像がありません。\n{json.dumps(result, indent=2)[:2000]}")

    # 出力先の決定
    out_path = Path(out_arg) if out_arg else default_dir
    # 拡張子付き＝ファイル指定、それ以外＝ディレクトリ指定とみなす
    is_file_target = out_path.suffix != "" and len(items) == 1

    saved = []
    if is_file_target:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        targets = [out_path]
    else:
        out_path.mkdir(parents=True, exist_ok=True)
        targets = None  # 後段で連番生成

    for idx, item in enumerate(items):
        b64 = item.get("b64_json")
        if not b64:
            print(f"  警告: data[{idx}] に b64_json がありません。スキップします。", file=sys.stderr)
            continue
        raw = base64.b64decode(b64)
        ext = ext_from_media_type(item.get("media_type", ""), fallback_fmt)

        if targets is not None:
            dest = targets[idx]
        else:
            suffix = "" if len(items) == 1 else f"_{idx + 1}"
            dest = _next_free_path(out_path, f"openrouter{suffix}", ext)

        dest.write_bytes(raw)
        saved.append(dest)

    return saved


def _next_free_path(directory: Path, stem: str, ext: str) -> Path:
    """directory 内で衝突しないファイル名を返す（stem.ext, stem_2.ext, ...）。"""
    candidate = directory / f"{stem}.{ext}"
    counter = 2
    while candidate.exists():
        candidate = directory / f"{stem}_{counter}.{ext}"
        counter += 1
    return candidate


def parse_args(argv):
    p = argparse.ArgumentParser(
        prog="generate.py",
        description="OpenRouter Images API で画像を生成する。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("prompt", help="生成プロンプト（画像の説明）")
    p.add_argument("-m", "--model", default=DEFAULT_MODEL,
                   help=f"モデル ID（デフォルト: {DEFAULT_MODEL}）")
    p.add_argument("-a", "--aspect-ratio", default=None,
                   help="アスペクト比。例: 1:1, 16:9, 9:16, 4:3, 3:4")
    p.add_argument("-r", "--resolution", default=None,
                   choices=["512", "1K", "2K", "4K"],
                   help="解像度ティア: 512 / 1K / 2K / 4K")
    p.add_argument("--size", default=None,
                   help="ピクセル指定のサイズ。例: 2048x2048")
    p.add_argument("-q", "--quality", default=None,
                   choices=["auto", "low", "medium", "high"],
                   help="品質: auto / low / medium / high")
    p.add_argument("-f", "--output-format", default="png",
                   choices=["png", "jpeg", "webp"],
                   help="出力フォーマット（デフォルト: png）")
    p.add_argument("--background", default=None,
                   choices=["auto", "transparent", "opaque"],
                   help="背景: auto / transparent / opaque")
    p.add_argument("--seed", type=int, default=None, help="乱数シード（再現用）")
    p.add_argument("-n", "--num", type=int, default=1,
                   help="生成枚数（1〜10, デフォルト: 1）")
    p.add_argument("--output-compression", type=int, default=None,
                   help="webp/jpeg の圧縮率 0〜100")
    p.add_argument("-i", "--ref", action="append", metavar="PATH_OR_URL",
                   help="参照画像（ローカルパスまたは http(s) URL）。複数指定可")
    p.add_argument("-o", "--output", default=None,
                   help="出力先ファイル or ディレクトリ（デフォルト: このスクリプト隣の output/）")
    p.add_argument("--dry-run", action="store_true",
                   help="API を叩かず、送信するリクエスト body を表示するだけ")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv if argv is not None else sys.argv[1:])

    script_dir = Path(__file__).resolve().parent
    project_root = find_project_root(script_dir)
    default_out_dir = script_dir / "output"

    payload = build_payload(args)

    if args.dry_run:
        # 参照画像の base64 は長いので表示用に短縮
        preview = json.loads(json.dumps(payload))
        for ref in preview.get("input_references", []):
            url = ref["image_url"]["url"]
            if url.startswith("data:"):
                ref["image_url"]["url"] = url[:60] + f"...<{len(url)} chars>"
        print("=== DRY RUN: リクエスト body ===")
        print(f"POST {API_URL}")
        print(json.dumps(preview, indent=2, ensure_ascii=False))
        return 0

    api_key = resolve_api_key(project_root)

    print(f"生成中... model={args.model} prompt={args.prompt!r}")
    result = post_request(api_key, payload)

    saved = save_images(result, args.output, default_out_dir, args.output_format)

    print("\n=== 完了 ===")
    for path in saved:
        print(f"  保存: {path}")

    usage = result.get("usage") or {}
    if "cost" in usage:
        print(f"  コスト: ${usage['cost']}")
    if usage:
        tokens = usage.get("total_tokens")
        if tokens is not None:
            print(f"  トークン: {tokens}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
