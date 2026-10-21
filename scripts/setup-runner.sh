#!/usr/bin/env bash
# Pasang GitHub Actions runner di PC ini (sekali saja).
# Pakai: scripts/setup-runner.sh <TOKEN>
# Token: GitHub > repo > Settings > Actions > Runners > New self-hosted runner
set -euo pipefail
TOKEN="${1:?Isi token pendaftaran runner}"
VER=2.328.0
DIR="$HOME/actions-runner"
mkdir -p "$DIR" && cd "$DIR"
curl -fsSL -o runner.tgz "https://github.com/actions/runner/releases/download/v${VER}/actions-runner-linux-x64-${VER}.tar.gz"
tar xzf runner.tgz && rm runner.tgz
./config.sh --unattended --url https://github.com/heathclif-cyber/asetopt-monitor \
  --token "$TOKEN" --name asetopt-pc --labels asetopt --work _work --replace
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
