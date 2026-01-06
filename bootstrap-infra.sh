#!/bin/bash
# Berlin AI - Individual Project Bootstrap (Non-Interactive)

INFRA_REPO="https://github.com/yogami/berlin-ai-infra.git"
PARENT_DIR=".."
RULES_FILE="$PARENT_DIR/RULES.md"

if [ -f "$RULES_FILE" ]; then
    echo "✅ Master Brain detected. Syncing..."
    "$PARENT_DIR/install-brain.sh"
else
    echo "⚠️  Master Brain NOT found. Downloading infrastructure..."
    cd "$PARENT_DIR"
    git clone "$INFRA_REPO" tmp_infra && \
    mv tmp_infra/* . && \
    mv tmp_infra/.* . 2>/dev/null && \
    rm -rf tmp_infra && \
    chmod +x install-brain.sh && \
    ./install-brain.sh
    echo "✅ Infrastructure installed and linked."
fi
