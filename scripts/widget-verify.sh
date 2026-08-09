#!/usr/bin/env bash
# scripts/widget-verify.sh — Verify widget builder + widget.js respect type/color params

set +e
BASE=http://localhost:3000
PASS=0
FAIL=0
declare -a FAILURES

record() {
  local name="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    echo "    expected: $expected"
    echo "    actual:   ${actual:0:120}"
    FAIL=$((FAIL+1))
    FAILURES+=("$name")
  fi
}

echo "=== Embed code includes type param ==="
# The embed code is generated client-side, but we can verify the source string
EMBED_SRC=$(grep "embedCode" /home/z/my-project/src/app/widgets/page.tsx | grep "type=")
record "embed code source includes type=\${selectedType}" "type=\${selectedType}" "$EMBED_SRC"

echo ""
echo "=== widget.js respects type param (4 types × 2 colors = 8 tests) ==="
echo ""

for TYPE in carousel grid badge slider; do
  for THEME in brass dark; do
    RESP=$(curl -s "$BASE/widget.js?business=Bamboo&type=$TYPE&theme=$THEME&limit=2")
    
    # Check the type is embedded in the JS as a string literal
    HAS_TYPE=$(echo "$RESP" | grep -c "var type = \"$TYPE\"" || true)
    record "type=$TYPE theme=$THEME: JS contains var type = \"$TYPE\"" "1" "$HAS_TYPE"
    
    # Check the theme colors are embedded
    case $THEME in
      brass) EXPECTED_BG="#FFFFFF" ;;
      dark)  EXPECTED_BG="#0A0A0B" ;;
    esac
    HAS_THEME=$(echo "$RESP" | grep -c "var bg = \"$EXPECTED_BG\"" || true)
    record "type=$TYPE theme=$THEME: JS contains bg = $EXPECTED_BG" "1" "$HAS_THEME"
    
    # Check type-specific HTML structure is present
    case $TYPE in
      badge)
        # Badge has "Rated by" text and no review text
        HAS_BADGE=$(echo "$RESP" | grep -c "Rated by" || true)
        [[ $HAS_BADGE -ge 1 ]] && PASS=$((PASS+1)) && echo "  PASS: type=badge: contains Rated by" || { FAIL=$((FAIL+1)); FAILURES+=("badge"); echo "  FAIL: badge"; }
        ;;
      grid)
        # Grid has grid-template-columns:1fr 1fr
        HAS_GRID=$(echo "$RESP" | grep -c "grid-template-columns:1fr 1fr" || true)
        [[ $HAS_GRID -ge 1 ]] && PASS=$((PASS+1)) && echo "  PASS: type=grid: contains 2-column grid CSS" || { FAIL=$((FAIL+1)); FAILURES+=("grid"); echo "  FAIL: grid"; }
        ;;
      slider)
        # Slider has prev/next buttons and data-slide
        HAS_SLIDER=$(echo "$RESP" | grep -c "data-slide" || true)
        [[ $HAS_SLIDER -ge 1 ]] && PASS=$((PASS+1)) && echo "  PASS: type=slider: contains data-slide attribute" || { FAIL=$((FAIL+1)); FAILURES+=("slider"); echo "  FAIL: slider"; }
        ;;
      carousel)
        # Carousel (default) has vertical review cards with border-top
        HAS_CAROUSEL=$(echo "$RESP" | grep -c "border-top:1px solid" || true)
        [[ $HAS_CAROUSEL -ge 1 ]] && record "type=carousel: contains vertical card borders" "PASS" "$HAS_CAROUSEL occurrences" || record "type=carousel: contains vertical card borders" "PASS" "0 — FAIL"
        ;;
    esac
    
    echo ""
  done
done

echo "=== Verify different types produce DIFFERENT output ==="
CAROUSEL=$(curl -s "$BASE/widget.js?business=Bamboo&type=carousel&theme=brass&limit=2")
GRID=$(curl -s "$BASE/widget.js?business=Bamboo&type=grid&theme=brass&limit=2")
BADGE=$(curl -s "$BASE/widget.js?business=Bamboo&type=badge&theme=brass&limit=2")
SLIDER=$(curl -s "$BASE/widget.js?business=Bamboo&type=slider&theme=brass&limit=2")

# Compute hashes to confirm they're different
HASH_C=$(echo "$CAROUSEL" | md5sum | cut -d' ' -f1)
HASH_G=$(echo "$GRID" | md5sum | cut -d' ' -f1)
HASH_B=$(echo "$BADGE" | md5sum | cut -d' ' -f1)
HASH_S=$(echo "$SLIDER" | md5sum | cut -d' ' -f1)

echo "  carousel hash: $HASH_C"
echo "  grid hash:     $HASH_G"
echo "  badge hash:    $HASH_B"
echo "  slider hash:   $HASH_S"

UNIQUE=$(echo -e "$HASH_C\n$HASH_G\n$HASH_B\n$HASH_S" | sort -u | wc -l)
record "all 4 types produce unique output" "4" "$UNIQUE"

echo ""
echo "=== Verify different themes produce different colors ==="
BRASS=$(curl -s "$BASE/widget.js?business=Bamboo&type=carousel&theme=brass&limit=1")
DARK=$(curl -s "$BASE/widget.js?business=Bamboo&type=carousel&theme=dark&limit=1")
BLUE=$(curl -s "$BASE/widget.js?business=Bamboo&type=carousel&theme=blue&limit=1")

BRASS_ACCENT=$(echo "$BRASS" | grep -o "var accent = \"#[A-F0-9]*\"" | head -1)
DARK_ACCENT=$(echo "$DARK" | grep -o "var accent = \"#[A-F0-9]*\"" | head -1)
BLUE_ACCENT=$(echo "$BLUE" | grep -o "var accent = \"#[A-F0-9]*\"" | head -1)

echo "  brass accent: $BRASS_ACCENT"
echo "  dark accent:  $DARK_ACCENT"
echo "  blue accent:  $BLUE_ACCENT"

record "brass theme uses #97781B" "#97781B" "$BRASS_ACCENT"
record "dark theme uses #D6B44F" "#D6B44F" "$DARK_ACCENT"
record "blue theme uses #4464C3" "#4464C3" "$BLUE_ACCENT"

echo ""
echo "=== Invalid type falls back to carousel ==="
INVALID=$(curl -s "$BASE/widget.js?business=Bamboo&type=invalid&theme=brass&limit=1")
HAS_CAROUSEL_FALLBACK=$(echo "$INVALID" | grep -c "var type = \"carousel\"" || true)
record "invalid type falls back to carousel" "1" "$HAS_CAROUSEL_FALLBACK"

echo ""
echo "=== Invalid theme falls back to brass ==="
INVALID_THEME=$(curl -s "$BASE/widget.js?business=Bamboo&type=carousel&theme=nonexistent&limit=1")
HAS_BRASS_FALLBACK=$(echo "$INVALID_THEME" | grep -c "var accent = \"#97781B\"" || true)
record "invalid theme falls back to brass" "1" "$HAS_BRASS_FALLBACK"

echo ""
echo "=================================="
echo "FINAL: $PASS passed, $FAIL failed"
echo "=================================="
if [[ $FAIL -gt 0 ]]; then
  echo "FAILURES:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
fi
