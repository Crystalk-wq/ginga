#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$ROOT/fixtures/manifest.sha256"
GOLDEN_MANIFEST="$ROOT/fixtures/golden.sha256"
GOLDEN_WORKDIR=""

cleanup() {
    if [ -n "$GOLDEN_WORKDIR" ]; then
        rm -rf "$GOLDEN_WORKDIR"
    fi
}

trap cleanup EXIT

hash_file() {
    local file="$1"
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$file" | awk '{print $1}'
        return
    fi
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$file" | awk '{print $1}'
        return
    fi
    if command -v openssl >/dev/null 2>&1; then
        openssl dgst -sha256 "$file" | awk '{print $2}'
        return
    fi

    echo "no sha256 tool found (need shasum, sha256sum, or openssl)" >&2
    exit 1
}

check_manifest() {
    local expected actual path
    while read -r expected path; do
        [ -z "${expected:-}" ] && continue
        case "$expected" in
            \#*) continue ;;
        esac

        actual="$(hash_file "$ROOT/$path")"
        if [ "$actual" != "$expected" ]; then
            echo "fixture hash mismatch: $path" >&2
            echo "expected: $expected" >&2
            echo "actual:   $actual" >&2
            return 1
        fi
    done < "$MANIFEST"
}

check_golden_output() {
    local name="$1"
    local path="$2"
    local expected actual

    expected="$(awk -v name="$name" '$2 == name { print $1 }' "$GOLDEN_MANIFEST")"
    if [ -z "$expected" ]; then
        echo "missing golden hash: $name" >&2
        return 1
    fi

    actual="$(hash_file "$path")"
    if [ "$actual" != "$expected" ]; then
        echo "golden output mismatch: $name" >&2
        echo "expected: $expected" >&2
        echo "actual:   $actual" >&2
        return 1
    fi
}

check_cli_golden_outputs() {
    local workdir
    workdir="$(mktemp -d)"
    GOLDEN_WORKDIR="$workdir"

    # Reuse the deterministic PNG/JPEG samples used by the CI quality gate.
    source "$ROOT/scripts/ci/common.sh"
    prepare_sample_images "$workdir"

    "$GINGA_BIN" convert "$workdir/sample.png" "$workdir/png-roundtrip.png" >/dev/null
    "$GINGA_BIN" convert "$workdir/sample.jpg" "$workdir/jpeg-roundtrip.png" >/dev/null
    printf '{"command":"preview","imagePath":"%s","spectralMode":"none"}\n' \
        "$workdir/sample.png" | "$GINGA_BIN" preview > "$workdir/preview-none.json"

    check_golden_output png-roundtrip "$workdir/png-roundtrip.png"
    check_golden_output jpeg-roundtrip-png "$workdir/jpeg-roundtrip.png"
    check_golden_output preview-none-json "$workdir/preview-none.json"
}

if [ ! -f "$MANIFEST" ]; then
    echo "missing manifest: $MANIFEST" >&2
    exit 1
fi

check_manifest
echo "fixture manifest verified"

if [ -n "${GINGA_BIN:-}" ] && [ -x "${GINGA_BIN:-}" ]; then
    if [ ! -f "$GOLDEN_MANIFEST" ]; then
        echo "missing golden manifest: $GOLDEN_MANIFEST" >&2
        exit 1
    fi
    check_cli_golden_outputs
    echo "golden CLI outputs verified"
else
    echo "cli hook not enabled; set GINGA_BIN to verify golden outputs"
fi
