#!/bin/bash
cd "$(dirname "$0")"
echo 'NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000' > .env.local
exec npm run dev
