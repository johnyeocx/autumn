#!/bin/bash

# TEST PARALLEL
if [ "$1" == "basic-parallel" ]; then
    npx mocha 'tests/00_setup.ts' && npx mocha --parallel --timeout 10000000  \
    'tests/basic/**/*.ts' \
    --ignore 'tests/00_setup.ts' \
    --ignore 'tests/alex/**/*.ts'
    # 'tests/attach/**/*.ts' \

elif [ "$1" == "advanced-parallel" ]; then
    npx mocha 'tests/00_setup.ts' && npx mocha --parallel --timeout 10000000  \
    'tests/advanced/**/*.ts' --ignore 'tests/advanced/11_arrear_prorated.ts' \
    --ignore 'tests/00_setup.ts' \
    --ignore 'tests/alex/**/*.ts'
    # --ignore 'tests/advanced/11_arrear_prorated2.ts' \

elif [ "$1" == "alex-parallel" ]; then
    npx mocha 'tests/alex/00_setup.ts' && npx mocha --parallel --timeout 10000000  \
    'tests/alex/01_free.ts' 'tests/alex/02_pro.ts' 'tests/alex/03_premium.ts' \
    'tests/alex/04_topups.ts' 'tests/alex/05_cancel.ts' 'tests/alex/06_switch.ts' \
    --ignore 'tests/alex/00_setup.ts'

elif [ "$1" == "alex" ]; then
    npx mocha 'tests/alex/00_setup.ts' && \
    npx mocha --timeout 10000000 \
    'tests/alex/01_free.ts' \
    --ignore 'tests/alex/00_setup.ts'

elif [ "$1" == "alex-custom" ]; then
    FILE_TO_TEST="$2"
    npx mocha --timeout 10000000 "tests/alex/$FILE_TO_TEST.ts"
elif [ "$1" == "custom" ]; then
    FILE_TO_TEST="$2"
    ARG3="$3"
    if [ "$ARG3" == "setup" ]; then
        npx mocha --timeout 10000000 'tests/00_setup.ts'
    fi
    npx mocha --timeout 10000000 "tests/$FILE_TO_TEST.ts"
else
    npx mocha --timeout 10000000 'tests/00_setup.ts' && npx mocha --timeout 10000000  \
    'tests/**/*.ts' \
    --ignore 'tests/00_setup.ts' \
    --ignore 'tests/alex/**/*.ts'
fi



# All advanced parallel
# 'tests/advanced/09_advanced_usage1.ts' 'tests/advanced/09_advanced_usage2.ts' 'tests/advanced/10_multi_interval1.ts' 'tests/advanced/10_multi_interval2.ts' \
#     'tests/advanced/11_arrear_prorated.ts' 'tests/advanced/11_arrear_prorated2.ts' 'tests/advanced/12_group_by.ts' \