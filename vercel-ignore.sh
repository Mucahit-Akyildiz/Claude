#!/bin/bash
# Vercel "Ignored Build Step": 0 ile çıkarsa derleme atlanır, 1 ile çıkarsa derlenir.
# Yalnızca canlı dal derlenir (Dependabot vb. önizleme deployment'ları depolamayı doldurmasın)
# ve yalnızca siteyi etkileyen dosyalar değiştiyse.
[ "$VERCEL_GIT_COMMIT_REF" != "claude/restoran-app-definition-h5e5am" ] && exit 0
git diff --quiet "${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}" HEAD -- . ':(exclude)supabase' ':(exclude)mobile' ':(exclude)desktop' ':(exclude)docs' ':(exclude)tests' ':(exclude)scripts' ':(exclude).github' ':(exclude).claude' ':(exclude)README.md'
