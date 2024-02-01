#!/bin/sh -e
npm run prepare
npm run doc
rm -rf dist; cp -R -L demo dist/
cp -R docs dist/
node_modules/.bin/gh-pages --dist dist
rm -rf dist
