#!/usr/bin/env bash
# Generates synthetic test media: a reference edit (known cuts/transitions + soundtrack) and raw clips.
set -euo pipefail
OUT="${1:-$(dirname "$0")/samples}"; mkdir -p "$OUT"
q=(-hide_banner -loglevel error -y)
# reference, 1280x720 @30: A 0-2 | cut | B 2-4 | dissolve 4-4.6 | C | fadeblack 6-7 | D until 9, with a beat track
ffmpeg "${q[@]}" \
  -f lavfi -i "testsrc2=s=1280x720:r=30:d=2.6" \
  -f lavfi -i "smptehdbars=s=1280x720:r=30:d=2.6" \
  -f lavfi -i "mandelbrot=s=1280x720:r=30,trim=duration=3" \
  -f lavfi -i "testsrc2=s=1280x720:r=30:d=3,hue=h=120" \
  -f lavfi -i "sine=f=220:beep_factor=4:d=9" \
  -filter_complex "[0:v]format=yuv420p,settb=AVTB[a];[1:v]format=yuv420p,settb=AVTB[b];[2:v]format=yuv420p,setpts=PTS-STARTPTS,settb=AVTB[c];[3:v]format=yuv420p,setpts=PTS-STARTPTS,settb=AVTB[d];\
[a]trim=0:2,setpts=PTS-STARTPTS[a2];[a2][b]concat=n=2:v=1:a=0[ab];[ab]trim=0:4.6,setpts=PTS-STARTPTS[ab2];\
[ab2][c]xfade=transition=dissolve:duration=0.6:offset=4[abc];[abc][d]xfade=transition=fadeblack:duration=1:offset=6[v0];[v0]trim=0:9[v]" \
  -map "[v]" -map 4:a -c:v libx264 -preset ultrafast -c:a aac -t 9 "$OUT/reference.mp4"
# clips: different sizes / content, each with its own audio
ffmpeg "${q[@]}" -f lavfi -i "testsrc=s=1920x1080:r=25:d=6" -f lavfi -i "sine=f=440:d=6" -c:v libx264 -preset ultrafast -c:a aac -shortest "$OUT/clip1.mp4"
ffmpeg "${q[@]}" -f lavfi -i "cellauto=s=720x1280:r=30:rule=110,trim=duration=5" -f lavfi -i "sine=f=660:d=5" -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -shortest "$OUT/clip2.mp4"
ffmpeg "${q[@]}" -f lavfi -i "rgbtestsrc=s=1280x720:r=30:d=1.5" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT/clip3.mp4"
echo "samples in $OUT"
