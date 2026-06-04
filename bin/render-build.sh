#!/usr/bin/env bash

# Render build script — https://render.com/docs/deploy-rails
set -o errexit

bundle install
bin/rails assets:precompile
bin/rails assets:clean

# Multi-db (primary + Solid Cache/Queue/Cable). On paid plans, move this to preDeployCommand.
bin/rails db:prepare
