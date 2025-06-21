#!/bin/bash

MOCHA_SETUP="npx mocha tests/00_setup.ts"
MOCHA_CMD="npx mocha --parallel --timeout 10000000 --ignore tests/00_setup.ts"  