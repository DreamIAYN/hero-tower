#!/usr/bin/env python3
"""Encode captured replay frames into an animated WebP."""
import argparse
from pathlib import Path
from PIL import Image

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='data/replays/frames_ai_ffa')
    ap.add_argument('--out', default='data/replays/ai_ffa.webp')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=None)
    ap.add_argument('--fps', type=int, default=10)
    ap.add_argument('--width', type=int, default=1280)
    ap.add_argument('--quality', type=int, default=78)
    ap.add_argument('--method', type=int, default=4)
    args = ap.parse_args()

    files = sorted(Path(args.dir).glob('frame_*.png'))
    files = files[args.start:args.end]
    if not files:
        raise SystemExit('no frames')
    im0 = Image.open(files[0]).convert('RGB')
    w, h = im0.size
    tw = args.width
    th = round(h * tw / w)
    frames = []
    for i, f in enumerate(files):
        im = Image.open(f).convert('RGB').resize((tw, th), Image.LANCZOS)
        frames.append(im)
        if i % 50 == 0:
            print(f'{i}/{len(files)}', flush=True)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 / args.fps),
        loop=0,
        quality=args.quality,
        method=args.method,
        lossless=False,
    )
    print(f'wrote {out} ({out.stat().st_size/1024/1024:.1f} MiB, {len(frames)} frames, {tw}x{th})')

if __name__ == '__main__':
    main()
