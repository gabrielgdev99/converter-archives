#!/usr/bin/env bash
# FFmpeg GPL estatico para Windows, so com os codecs que o Vireun Converter usa.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${FFBUILD_WORK:-/tmp/ffbuild}"
PREFIX="${FFBUILD_PREFIX:-/tmp/ffprefix}"
DEST="$ROOT/resources/bin/win32/ffmpeg.exe"
STAMP="$ROOT/resources/bin/win32/slim.txt"
LICENSE="$ROOT/resources/licenses/FFMPEG-LICENSE.txt"
HOST="x86_64-w64-mingw32"
JOBS="${FFBUILD_JOBS:-3}"

if [[ -f "$STAMP" && -f "$DEST" && $(stat -c%s "$DEST") -gt 1000000 ]]; then
  echo "ffmpeg enxuto ja existe em $DEST"
  exit 0
fi

mkdir -p "$WORK" "$PREFIX" "$(dirname "$DEST")" "$(dirname "$LICENSE")"
export PATH="$PREFIX/bin:$PATH"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export CFLAGS="-Os"
export CXXFLAGS="-Os"
export LDFLAGS="-s"

fetch() {
  local url="$1" out="$2"
  if [[ -f "$out" && $(stat -c%s "$out") -gt 1000 ]]; then
    return 0
  fi
  echo "baixando $url"
  rm -f "$out"
  curl -L --fail --retry 3 -o "$out" "$url"
}

build_zlib() {
  [[ -f "$PREFIX/lib/libz.a" ]] && return 0
  fetch "https://zlib.net/fossils/zlib-1.3.1.tar.gz" "$WORK/zlib.tar.gz"
  rm -rf "$WORK/zlib-1.3.1"
  tar -xf "$WORK/zlib.tar.gz" -C "$WORK"
  (
    cd "$WORK/zlib-1.3.1"
    CC=$HOST-gcc AR=$HOST-ar RANLIB=$HOST-ranlib CFLAGS=-Os ./configure --static --prefix="$PREFIX"
    make -j"$JOBS"
    make install
  )
}

build_x264() {
  [[ -f "$PREFIX/lib/libx264.a" ]] && return 0
  if [[ ! -d "$WORK/x264/.git" ]]; then
    rm -rf "$WORK/x264"
    git clone --depth 1 https://code.videolan.org/videolan/x264.git "$WORK/x264" \
      || git clone --depth 1 https://github.com/mirror/x264.git "$WORK/x264"
  fi
  (
    cd "$WORK/x264"
    ./configure --host="$HOST" --cross-prefix="$HOST-" --prefix="$PREFIX" \
      --enable-static --disable-cli --enable-pic --bit-depth=8 --chroma-format=420
    make -j"$JOBS"
    make install
  )
}

build_autoconf() {
  local name="$1" url="$2" extra="${3:-}"
  local marker="$PREFIX/lib/lib${name}.a"
  if [[ "$name" == "mp3lame" ]]; then marker="$PREFIX/lib/libmp3lame.a"; fi
  if [[ "$name" == "webp" ]]; then marker="$PREFIX/lib/libwebp.a"; fi
  [[ -f "$marker" ]] && return 0
  local tar="$WORK/$(basename "$url")"
  fetch "$url" "$tar"
  rm -rf "$WORK/src-$name"
  mkdir -p "$WORK/src-$name"
  tar -xf "$tar" -C "$WORK/src-$name" --strip-components=1
  (
    cd "$WORK/src-$name"
    # shellcheck disable=SC2086
    ./configure --host="$HOST" --prefix="$PREFIX" --disable-shared --enable-static $extra
    make -j"$JOBS"
    make install
  )
}

build_vpx() {
  [[ -f "$PREFIX/lib/libvpx.a" ]] && return 0
  fetch "https://github.com/webmproject/libvpx/archive/refs/tags/v1.15.0.tar.gz" "$WORK/libvpx.tar.gz"
  rm -rf "$WORK/libvpx"
  mkdir -p "$WORK/libvpx"
  tar -xf "$WORK/libvpx.tar.gz" -C "$WORK/libvpx" --strip-components=1
  (
    cd "$WORK/libvpx"
    CROSS="$HOST-" ./configure --target=x86_64-win64-gcc --prefix="$PREFIX" \
      --disable-shared --enable-static \
      --disable-examples --disable-tools --disable-docs --disable-unit-tests \
      --enable-vp8 --enable-vp9 --enable-runtime-cpu-detect \
      --extra-cflags="-Os" --extra-cxxflags="-Os"
    make -j"$JOBS"
    make install
  )
}

build_aom() {
  [[ -f "$PREFIX/lib/libaom.a" ]] && return 0
  fetch "https://storage.googleapis.com/aom-releases/libaom-3.11.0.tar.gz" "$WORK/libaom.tar.gz"
  rm -rf "$WORK/aom" "$WORK/aom-build"
  mkdir -p "$WORK/aom" "$WORK/aom-build"
  tar -xf "$WORK/libaom.tar.gz" -C "$WORK/aom" --strip-components=1
  cat > "$WORK/mingw.cmake" << EOF
set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR AMD64)
set(CMAKE_C_COMPILER $HOST-gcc)
set(CMAKE_CXX_COMPILER $HOST-g++)
set(CMAKE_RC_COMPILER $HOST-windres)
set(CMAKE_FIND_ROOT_PATH $PREFIX)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_C_FLAGS "-Os")
set(CMAKE_CXX_FLAGS "-Os")
EOF
  cmake -S "$WORK/aom" -B "$WORK/aom-build" \
    -DCMAKE_TOOLCHAIN_FILE="$WORK/mingw.cmake" \
    -DCMAKE_INSTALL_PREFIX="$PREFIX" \
    -DCMAKE_BUILD_TYPE=MinSizeRel \
    -DBUILD_SHARED_LIBS=OFF \
    -DENABLE_DOCS=OFF \
    -DENABLE_TESTS=OFF \
    -DENABLE_EXAMPLES=OFF \
    -DENABLE_TOOLS=OFF \
    -DENABLE_TESTDATA=OFF \
    -DCONFIG_AV1_HIGHBITDEPTH=0 \
    -DENABLE_NASM=ON \
    -DAOM_TARGET_CPU=x86_64
  cmake --build "$WORK/aom-build" -j"$JOBS"
  cmake --install "$WORK/aom-build"
}

build_ffmpeg() {
  fetch "https://ffmpeg.org/releases/ffmpeg-7.1.1.tar.xz" "$WORK/ffmpeg.tar.xz"
  rm -rf "$WORK/ffmpeg"
  mkdir -p "$WORK/ffmpeg"
  tar -xf "$WORK/ffmpeg.tar.xz" -C "$WORK/ffmpeg" --strip-components=1
  local args=()
  local item
  for item in \
    h264 hevc mpeg4 mpeg2video mpeg1video vp8 vp9 libaom_av1 \
    mjpeg png gif webp bmp tiff apng \
    pcm_s16le mp3 aac vorbis opus flac ac3 eac3 alac
  do args+=("--enable-decoder=$item"); done
  for item in \
    libx264 libvpx_vp9 libaom_av1 libwebp libwebp_anim \
    libmp3lame libopus libvorbis aac flac png mjpeg gif pcm_s16le bmp tiff
  do args+=("--enable-encoder=$item"); done
  for item in \
    mp4 mov matroska webm gif image2 wav mp3 ogg flac adts avi ipod avif asf
  do args+=("--enable-muxer=$item"); done
  for item in \
    mov matroska avi flv mpegts mp3 wav ogg flac aac image2 gif concat asf ac3 mpegps
  do args+=("--enable-demuxer=$item"); done
  for item in h264 hevc aac vp8 vp9 av1 mjpeg png gif opus vorbis mpeg4video; do
    args+=("--enable-parser=$item")
  done
  for item in aac_adtstoasc extract_extradata vp9_superframe h264_mp4toannexb; do
    args+=("--enable-bsf=$item")
  done
  for item in file pipe; do args+=("--enable-protocol=$item"); done
  for item in scale crop pad fps split palettegen paletteuse format aformat atrim trim setpts asetpts aresample null anull; do
    args+=("--enable-filter=$item")
  done
  (
    cd "$WORK/ffmpeg"
    ./configure \
      --prefix="$PREFIX" \
      --target-os=mingw32 \
      --arch=x86_64 \
      --cross-prefix="$HOST-" \
      --pkg-config=pkg-config \
      --pkg-config-flags=--static \
      --enable-gpl \
      --enable-version3 \
      --disable-debug \
      --disable-doc \
      --disable-ffplay \
      --disable-ffprobe \
      --enable-small \
      --disable-shared \
      --enable-static \
      --enable-runtime-cpudetect \
      --disable-autodetect \
      --disable-w32threads \
      --enable-pthreads \
      --disable-network \
      --disable-everything \
      --enable-zlib \
      --enable-swscale \
      --enable-swresample \
      --enable-libx264 \
      --enable-libvpx \
      --enable-libwebp \
      --enable-libmp3lame \
      --enable-libopus \
      --enable-libvorbis \
      --enable-libaom \
      --extra-cflags="-Os -I$PREFIX/include" \
      --extra-ldflags="-s -L$PREFIX/lib" \
      "${args[@]}"
    make -j"$JOBS"
  )
  local sym
  for sym in CONFIG_LIBX264_ENCODER CONFIG_LIBVPX_VP9_ENCODER CONFIG_LIBAOM_AV1_ENCODER CONFIG_LIBAOM_AV1_DECODER CONFIG_LIBWEBP_ENCODER CONFIG_LIBWEBP_ANIM_ENCODER CONFIG_LIBMP3LAME_ENCODER CONFIG_LIBVORBIS_ENCODER CONFIG_LIBOPUS_ENCODER CONFIG_AVIF_MUXER CONFIG_VP9_DECODER; do
    if ! grep -q "#define ${sym} 1" "$WORK/ffmpeg/config_components.h"; then
      echo "componente ausente: $sym"
      exit 1
    fi
  done
  "$HOST-strip" -s "$WORK/ffmpeg/ffmpeg.exe"
  cp -f "$WORK/ffmpeg/ffmpeg.exe" "$DEST"
  cp -f "$WORK/ffmpeg/COPYING.GPLv3" "$LICENSE"
  if [[ -f "$WORK/x264/COPYING" ]]; then
    cp -f "$WORK/x264/COPYING" "$ROOT/resources/licenses/X264-LICENSE.txt"
  fi
  cat > "$STAMP" << EOF
build=vireun-slim
ffmpeg=7.1.1
codecs=libx264,libvpx-vp9,libaom-av1,libwebp,libmp3lame,libvorbis,libopus,aac,flac
date=$(date -u +%Y-%m-%dT%H:%M:%SZ)
bytes=$(stat -c%s "$DEST")
EOF
  echo "ffmpeg.exe $(stat -c%s "$DEST") bytes"
}

echo "1 zlib"; build_zlib
echo "2 x264"; build_x264
echo "3 lame"; build_autoconf mp3lame "https://downloads.sourceforge.net/project/lame/lame/3.100/lame-3.100.tar.gz" "--disable-frontend --disable-gtktest"
echo "4 ogg"; build_autoconf ogg "https://downloads.xiph.org/releases/ogg/libogg-1.3.5.tar.gz" "--disable-oggtest"
echo "5 vorbis"; build_autoconf vorbis "https://downloads.xiph.org/releases/vorbis/libvorbis-1.3.7.tar.gz" "--disable-oggtest"
echo "6 opus"; build_autoconf opus "https://github.com/xiph/opus/releases/download/v1.5.2/opus-1.5.2.tar.gz" "--disable-doc --disable-extra-programs"
echo "7 webp"; build_autoconf webp "https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-1.4.0.tar.gz" "--disable-png --disable-jpeg --disable-tiff --disable-gif --disable-sdl"
echo "8 vpx"; build_vpx
echo "9 aom"; build_aom
echo "10 ffmpeg"; build_ffmpeg

python3 - << PY
import pathlib
data = pathlib.Path("$DEST").read_bytes()
need = [b"libx264", b"libvpx", b"libaom", b"libwebp", b"libmp3lame", b"libvorbis", b"libopus"]
missing = [n.decode() for n in need if n not in data]
if data[:2] != b"MZ":
    raise SystemExit("ffmpeg.exe nao e um executavel Windows")
if missing:
    raise SystemExit("faltam codecs no binario: " + ", ".join(missing))
print("codecs ok, tamanho", len(data))
PY
