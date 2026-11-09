#!/usr/bin/env python3
"""Create a captioned video from the actual output of the fictional-data demo."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'submission' / 'Sumi_90秒デモ.mp4'
FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc'
FONT_BOLD = '/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc'


def main():
    result = subprocess.run(['node', 'scripts/automatic-demo.mjs'], cwd=ROOT,
                            capture_output=True, text=True, check=True)
    lines = result.stdout.splitlines()

    def section(start, end=None):
        first = next(i for i, line in enumerate(lines) if line.startswith(start))
        last = next((i for i in range(first + 1, len(lines))
                     if end and lines[i].startswith(end)), len(lines))
        return [line for line in lines[first:last] if line.strip()]

    scenes = [
        (8, '情報を渡す範囲を、仕組みで決める',
         ['Sumi — 学校での情報の扱いを考える',
          '架空データによる自動デモ',
          '以下は実行結果を読みやすく再配置した映像です。']),
        (17, '見えないアンケート', section('【見えないアンケート】', '【Write】')),
        (12, '文書を作る：Write', section('【Write】', '【Gate】')),
        (17, '共有前に確かめる：Gate', section('【Gate】', '【Prove】')),
        (15, '個別値を渡さず合計を検証：Prove', section('【Prove】', '【Agent】')),
        (13, 'エージェントへの操作を制御', section('【Agent】')[:-1]),
        (8, '検証の範囲', [lines[-1],
         'アンケートは１端末での模擬であり、実際の回答には使えません。',
         'コードとデモ：github.com/sururu-k/zenjoukon-2/tree/main/sumi']),
    ]
    assert sum(scene[0] for scene in scenes) == 90
    title_font = ImageFont.truetype(FONT_BOLD, 39)
    body_font = ImageFont.truetype(FONT, 25)
    small_font = ImageFont.truetype(FONT, 18)
    with TemporaryDirectory(prefix='sumi-video-') as directory:
        directory = Path(directory)
        inputs = []
        for i, (duration, title, body) in enumerate(scenes):
            image = Image.new('RGB', (1280, 720), '#f6f5ef')
            draw = ImageDraw.Draw(image)
            draw.rectangle((0, 0, 1280, 100), fill='#ffbd26')
            draw.text((50, 26), title, fill='#17241b', font=title_font)
            draw.rounded_rectangle((45, 125, 1235, 635), radius=16, fill='#14251f')
            y = 152
            for line in body:
                wrapped = textwrap.wrap(line, width=39, break_long_words=True,
                                        break_on_hyphens=False) or ['']
                for part in wrapped:
                    draw.text((72, y), part, fill='#f4f7f1', font=body_font)
                    y += 39
                y += 9
            if y > 625:
                raise ValueError(f'scene {i + 1} exceeds the visible area: {y}')
            draw.text((50, 660), '架空データ / 実行結果を再配置 / 実環境全体の安全性は未証明',
                      fill='#35483b', font=small_font)
            path = directory / f'{i:02}.png'
            image.save(path)
            inputs.extend(['-loop', '1', '-framerate', '12', '-t', str(duration), '-i', str(path)])
        filters = [f'[{i}:v]setsar=1,format=yuv420p[v{i}]' for i in range(len(scenes))]
        filters.append(''.join(f'[v{i}]' for i in range(len(scenes)))
                       + f'concat=n={len(scenes)}:v=1:a=0[out]')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *inputs,
                        '-filter_complex', ';'.join(filters), '-map', '[out]',
                        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
                        '-movflags', '+faststart', str(OUTPUT)], check=True)
    print(OUTPUT)


if __name__ == '__main__':
    main()
