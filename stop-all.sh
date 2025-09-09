#!/bin/bash
kill -9 $(lsof -ti:3000) 2>/dev/null || true
kill -9 $(lsof -ti:8000) 2>/dev/null || true
echo "Stopped ports 3000 and 8000"
