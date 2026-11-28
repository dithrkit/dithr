#!/usr/bin/env bash
set -euo pipefail

tarball_dir=${1:?usage: npm-e2e.sh <tarball-directory>}
if [ -n "${E2E_WORK_DIR:-}" ]; then
    work_dir=$E2E_WORK_DIR
    mkdir -p "$work_dir"
else
    work_dir=$(mktemp -d)
    trap 'rm -rf "$work_dir"' EXIT
fi

sdk_tarball=$(find "$tarball_dir" -name 'dithrkit-sdk-*.tgz' -print -quit)
create_tarball=$(find "$tarball_dir" -name 'dithrkit-create-*.tgz' -print -quit)
wasm_tarball=$(find "$tarball_dir" -name 'dithrkit-wasm-*.tgz' -print -quit)
runtime_tarball=
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)
        runtime_tarball=$(find "$tarball_dir" -name 'dithrkit-linux-x64-*.tgz' -print -quit)
        ;;
    Darwin-arm64)
        runtime_tarball=$(find "$tarball_dir" -name 'dithrkit-darwin-arm64-*.tgz' -print -quit)
        ;;
    *)
        echo "Unsupported E2E platform: $(uname -s)-$(uname -m)" >&2
        exit 1
        ;;
esac

test -n "$sdk_tarball"
test -n "$create_tarball"
test -n "$wasm_tarball"
test -n "$runtime_tarball"

sdk_tarball=$(realpath "$sdk_tarball")
create_tarball=$(realpath "$create_tarball")
wasm_tarball=$(realpath "$wasm_tarball")
runtime_tarball=$(realpath "$runtime_tarball")

cd "$work_dir"
npm init -y >/dev/null
npm install --no-save "$sdk_tarball" "$create_tarball" "$wasm_tarball" "$runtime_tarball"

for project_type in javascript typescript; do
    project="test-${project_type}"
    if [ "$project_type" = "typescript" ]; then
        node node_modules/@dithrkit/create/index.js "$project" --typescript
    else
        node node_modules/@dithrkit/create/index.js "$project"
    fi

    cd "$project"
    npm pkg set "devDependencies.@dithrkit/sdk=file:$sdk_tarball"
    npm install
    npm install --no-save "$sdk_tarball" "$wasm_tarball" "$runtime_tarball"
    npm audit --audit-level=high
    npm run lint
    npm run format:check
    npm run build

    if [ "$project_type" = "typescript" ]; then
        npm run typecheck
    fi

    npx dithrkit --version
    npx dithrkit export --web --out build/web
    npx dithrkit export --desktop --out build/desktop

    test -s build/web/index.html
    test -s build/web/dithr.js
    test -s build/web/dithr.wasm
    test -s build/web/dithr.data
    test -s build/web/dithr.data.js
    test -x build/desktop/dithr
    test -s build/desktop/cart/cart.json

    ./build/desktop/dithr \
        --headless \
        --frames 2 \
        build/desktop/cart/cart.json

    cd ..
done

echo "Packaged JavaScript and TypeScript E2E checks passed in $work_dir."
