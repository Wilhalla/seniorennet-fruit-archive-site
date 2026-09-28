set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

export PATH := env_var("HOME") + "/.nub/bin:" + env_var("HOME") + "/.local/bin:" + env_var("PATH")

default:
    @just --list

worktree-add name branch='' start='HEAD':
    args=(worktree add {{quote(name)}} --start {{quote(start)}}); if [[ -n {{quote(branch)}} ]]; then args+=(--branch {{quote(branch)}}); fi; jp "${args[@]}"

worktree-list:
    jp worktree list

worktree-rm name force='false':
    args=(worktree remove {{quote(name)}}); if [[ {{quote(force)}} == "true" ]]; then args+=(--force); fi; jp "${args[@]}"

setup:
    nub install --prefer-frozen-lockfile
    git config --local core.hooksPath .githooks

dev: setup
    jp dev --port 4321 -- nub run dev -- --host 127.0.0.1 --port 4321

test:
    nub run test

check:
    nub run build
    nub run test

clean:
    rm -rf dist .astro
