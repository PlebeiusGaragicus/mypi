#!/usr/bin/env bash
set -euo pipefail

mkdir -p debug

pi --preset chat --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/chat.md
pi --preset classifier --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/classifier.md
pi --preset code --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/code.md
pi --preset direct --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/direct.md
pi --preset human --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/human.md
pi --preset judge --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/judge.md
pi --preset plato --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/plato.md
pi --preset scout --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/scout.md
pi --preset web --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/web.md
pi --preset workflow --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/workflow.md
pi --preset write --debug-system-prompt -p "hi" 2>&1 | tee | jq -r '.systemPrompt | gsub("\\\\n"; "\n")' > debug/write.md
