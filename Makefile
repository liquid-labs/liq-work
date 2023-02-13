.DELETE_ON_ERROR:
.PHONY: all build lint lint-fix qa test

default: build

CATALYST_SCRIPTS:=npx catalyst-scripts

LIQ_WORK_SRC:=src
LIQ_WORK_FILES:=$(shell find $(LIQ_WORK_SRC) \( -name "*.js" -o -name "*.mjs" \) -not -path "*/test/*" -not -name "*.test.js")
LIQ_WORK_ALL_FILES:=$(shell find $(LIQ_WORK_SRC) \( -name "*.js" -o -name "*.mjs" \))
LIQ_WORK_TEST_SRC_FILES:=$(shell find $(LIQ_WORK_SRC) -name "*.js")
LIQ_WORK_TEST_BUILT_FILES:=$(patsubst $(LIQ_WORK_SRC)/%, test-staging/%, $(LIQ_WORK_TEST_SRC_FILES))
#LIQ_WORK_TEST_SRC_DATA:=$(shell find $(LIQ_WORK_SRC) -path "*/test/data/*" -type f)
#LIQ_WORK_TEST_BUILT_DATA:=$(patsubst $(LIQ_WORK_SRC)/%, test-staging/%, $(LIQ_WORK_TEST_SRC_DATA))
LIQ_WORK:=dist/liq-projects.js

BUILD_TARGETS:=$(LIQ_WORK)

# build rules
build: $(BUILD_TARGETS)

all: build

$(LIQ_WORK): package.json $(LIQ_WORK_FILES)
	JS_SRC=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) build

# test
$(LIQ_WORK_TEST_BUILT_DATA): test-staging/%: $(LIQ_WORK_SRC)/%
	@echo "Copying test data..."
	@mkdir -p $(dir $@)
	@cp $< $@

#$(LIQ_WORK_TEST_BUILT_FILES) &: $(LIQ_WORK_ALL_FILES)
#	JS_SRC=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) pretest

.test-marker: $(LIQ_WORK_TEST_BUILT_FILES) # $(LIQ_WORK_TEST_BUILT_DATA)
	JS_SRC=test-staging $(CATALYST_SCRIPTS) test
	touch $@

test: .test-marker

# lint rules
.lint-marker: $(LIQ_WORK_ALL_FILES)
	JS_LINT_TARGET=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) lint
	touch $@

lint: .lint-marker

lint-fix:
	JS_LINT_TARGET=$(LIQ_WORK_SRC) $(CATALYST_SCRIPTS) lint-fix

qa: test lint
