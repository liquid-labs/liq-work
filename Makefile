ifneq (grouped-target, $(findstring grouped-target,$(.FEATURES)))
ERROR:=$(error This version of make does not support required 'grouped-target' (4.3+).)
endif
.PRECIOUS: last-lint.txt last-text.txt
.DELETE_ON_ERROR:
.PHONY: all build lint lint-fix qa test

default: build

CATALYST_SCRIPTS:=npx catalyst-scripts

LIQ_WORK_SRC:=src
TEST_STAGING:=test-staging

LIQ_WORK_FILES:=$(shell find $(LIQ_WORK_SRC) \( -name "*.js" -o -name "*.mjs" \) -not -path "*/test/*" -not -name "*.test.js")
LIQ_WORK_ALL_FILES:=$(shell find $(LIQ_WORK_SRC) \( -name "*.js" -o -name "*.mjs" \))
LIQ_WORK_TEST_SRC_FILES:=$(shell find $(LIQ_WORK_SRC) -name "*.js")
LIQ_WORK_TEST_BUILT_FILES:=$(patsubst $(LIQ_WORK_SRC)/%, test-staging/%, $(LIQ_WORK_TEST_SRC_FILES))

LIQ_WORK_TEST_SRC_DATA:=$(shell find $(LIQ_WORK_SRC) -path "*/test/data/*" -type f)
LIQ_WORK_TEST_BUILT_DATA:=$(patsubst $(LIQ_WORK_SRC)/%, test-staging/%, $(LIQ_WORK_TEST_SRC_DATA))
TEST_DATA_SRC=$(LIQ_WORK_SRC)/handlers/work/_lib/test/data
TEST_DATA_BUILT_SRC=$(patsubst $(LIQ_WORK_SRC)/%, $(TEST_STAGING)/%, $(TEST_DATA_SRC))

LIQ_WORK:=dist/liq-work.js

BUILD_TARGETS:=$(LIQ_WORK)

# build rules
build: $(BUILD_TARGETS)

all: build

$(LIQ_WORK): package.json $(LIQ_WORK_FILES)
	JS_SRC=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) build

# test
$(LIQ_WORK_TEST_BUILT_DATA) &: $(LIQ_WORK_TEST_SRC_DATA)
	rm -rf $(TEST_DATA_BUILT_SRC)/*
	mkdir -p $(TEST_DATA_BUILT_SRC)
	cp -rf $(TEST_DATA_SRC)/* $(TEST_DATA_BUILT_SRC)
	# we 'cp' so that when make compares the test-staging repos to the src repos, it doesn't see a lot of missing files
	for DOT_GIT in $$(find $(TEST_DATA_BUILT_SRC) -name 'dot-git'); do mv $$DOT_GIT $$(dirname $$DOT_GIT)/.git; done

$(LIQ_WORK_TEST_BUILT_FILES) &: $(LIQ_WORK_ALL_FILES)
	JS_SRC=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) pretest

last-test.txt: $(LIQ_WORK_TEST_BUILT_FILES) $(LIQ_WORK_TEST_BUILT_DATA)
	( set -e; set -o pipefail; \
		JS_SRC=$(TEST_STAGING) $(CATALYST_SCRIPTS) test 2>&1 | tee last-test.txt; )

test: last-test.txt

# lint rules
last-lint.txt: $(LIQ_WORK_ALL_FILES)
	( set -e; set -o pipefail; \
		JS_LINT_TARGET=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) lint | tee last-lint.txt; )

lint: last-lint.txt

lint-fix:
	JS_LINT_TARGET=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) lint-fix

qa: test lint

test-repos-live:
	for DG in $$(find $(LIQ_WORK_SRC) -name dot-git); do mv $$DG $$(dirname $$DG)/.git; done

test-repos-commitable:
	for DG in $$(find $(LIQ_WORK_SRC) -name .git); do mv $$DG $$(dirname $$DG)/dot-git; done
