#!/bin/sh -e
npm run prepare
rm -rf dist; cp -R -L demo dist/
node_modules/.bin/gh-pages --dist dist
rm -rf dist
