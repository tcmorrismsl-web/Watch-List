#!/bin/sh
# Rebuilds fb.js from src/firebase-entry.js. Needs: npm install firebase@10.12.2 esbuild@0.21.5
npx esbuild src/firebase-entry.js --bundle --minify --format=iife --target=es2019,safari14 --legal-comments=none --outfile=fb.js
