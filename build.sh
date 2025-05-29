#!/bin/sh

set -e

(cd djs_ast && pnpm gen)
(cd djs_ast && pnpm build)
(cd djs_parser && pnpm build)
