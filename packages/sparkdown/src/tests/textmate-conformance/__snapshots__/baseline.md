# vscode-textmate conformance baseline

Total cases: 95

## Summary by axis

- pass: 1
- mismatch: 1
- incomplete: 11
- capture-model: 4
- while-rule: 18
- regex-invalid: 11
- throw-other: 3
- external-includes: 46
- load-error: 0

## Per-case

### pass (1)
- first-mate#10 [fixtures/coffee-script.json] TEST #13

### mismatch (1)
- suite1#19 [fixtures/147.grammar.json] Issue #147 — line 1 "Function": token[0] ("Function") scopes got ["source.test","storage.type.$0 keyword.declaration.$0"] want ["source.test","storage.type.Function","keyword.declaration.Function"]

### incomplete (11)
- first-mate#3 [fixtures/text.json] TEST #6 — line 1 "abc def": token[0] ("abc def") scopes got ["text.plain"] want ["text.plain","meta.paragraph.text"]
- first-mate#11 [fixtures/text.json] TEST #14 — line 1 "hoo": token[0] ("hoo") scopes got ["text.plain"] want ["text.plain","meta.paragraph.text"]
- first-mate#12 [fixtures/text.json] TEST #15 — line 1 "ok, cool": token[0] ("ok, cool") scopes got ["text.plain"] want ["text.plain","meta.paragraph.text"]
- first-mate#14 [fixtures/content-name.json] TEST #17 — line 2 "test": token[0] ("test") scopes got ["source.test"] want ["source.test","pre","nested"]
- first-mate#15 [fixtures/content-name.json] TEST #18 — line 1 "test": token[0] ("test") scopes got ["source.test"] want ["source.test","all","middle"]
- first-mate#16 [fixtures/content-name.json] TEST #19 — line 1 " test": token[1] ("test") scopes got ["source.test"] want ["source.test","all","middle"]
- first-mate#21 [fixtures/apply-end-pattern-last.json] TEST #24 — line 2 "{ some }excentricSyntax }": token[0] value got "{ some }excentricSyntax }" want "{"
- first-mate#30 [fixtures/imaginary.json] TEST #33 — line 1 "// a singleLineComment": token[1] (" a singleLineComment") scopes got ["source.imaginaryLanguage"] want ["source.imaginaryLanguage","comment-body"]
- first-mate#31 [fixtures/multiline.json] TEST #34 — line 1 "Xy\\": token[1] value got "y\\" want "y"
- first-mate#35 [fixtures/infinite-loop.json] TEST #38 — line 1 "abc": token[0] value got "abc" want "a"
- first-mate#63 [fixtures/loops.json] TEST #74 — tokens matched but tree has error nodes

### capture-model (4)
- first-mate#0 [fixtures/hello.json] TEST #3 — Invalid capturing group lengths: world(!?)
- first-mate#2 [fixtures/coffee-script.json] TEST #5 — Invalid capturing group lengths: (new)\s+(\w+(?:\.\w*)*)
- first-mate#38 [fixtures/nested-captures.json] TEST #44 — Invalid capturing group lengths: (a(b))
- suite1#9 [fixtures/testlang12.plist] Issue #12 — Invalid capturing group lengths: ^([ \t]*)(?=(.*?)\|$)

### while-rule (18)
- first-mate#1 [fixtures/coffee-script.json] TEST #4 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#4 [fixtures/coffee-script.json] TEST #7 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#5 [fixtures/coffee-script.json] TEST #8 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#6 [fixtures/coffee-script.json] TEST #9 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#7 [fixtures/coffee-script.json] TEST #10 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#8 [fixtures/coffee-script.json] TEST #11 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#9 [fixtures/coffee-script.json] TEST #12 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#18 [fixtures/coffee-script.json] TEST #21 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- first-mate#19 [fixtures/coffee-script.json] TEST #22 — Invalid RegExp: (?x)
				\b(?<![\.\$])(
					break|by|catch|continue|else|finally|for|in|of|if|return|switch|
					then|throw|try|unless|when|while|until|loop|do|(?<=for)\s+own
				)(?!\s*:)\b
			
- suite1#0 [fixtures/whileLang.plist] While should match begin and stop on next line if while condition fails — while rules are not currently supported
- suite1#1 [fixtures/whileLang.plist] While should match multiple lines while condition holds — while rules are not currently supported
- suite1#2 [fixtures/whileLang.plist] While condition can match anywhere in line — while rules are not currently supported
- suite1#3 [fixtures/whileLang.plist] Begin of while should consume entire rest of line. — while rules are not currently supported
- suite1#4 [fixtures/whileLang.plist] Nested whiles should match using only inner most while on a mached line — while rules are not currently supported
- suite1#5 [fixtures/whileLang.plist] Nested whiles should check line for outer most while to inner most while — while rules are not currently supported
- suite1#6 [fixtures/whileLang.plist] Nested whiles should move line ahead before checking other conditions — while rules are not currently supported
- suite1#7 [fixtures/whileLang.plist] Nested whiles should check line for outer most while to inner most while — while rules are not currently supported
- suite1#8 [fixtures/whileLang.plist] Should Correctly handle anchor in while rule — while rules are not currently supported

### regex-invalid (11)
- first-mate#13 [fixtures/text.json] TEST #16 — Invalid RegExp: ^(?!\1(?=\S))
- first-mate#20 [fixtures/coffee-script.json] TEST #23 — Invalid RegExp: \#\{
- first-mate#33 [fixtures/c.json] TEST #36 — Invalid RegExp: (?x)
        		^\s*\#\s*(define)\s+             # define
        		((?<id>[a-zA-Z_][a-zA-Z0-9_]*))  # macro name
        		(?:                              # and optionally:
        		    (\()                         # an open parenthesis
        		        (
        		            \s* \g<id> \s*       # first argument
        		            ((,) \s* \g<id> \s*)*  # additional arguments
        		            (?:\.\.\.)?          # varargs ellipsis?
        		        )
        		    (\))                         # a close parenthesis
        		)?
        	
- first-mate#34 [fixtures/c.json] TEST #37 — Invalid RegExp: (?x)
        		^\s*\#\s*(define)\s+             # define
        		((?<id>[a-zA-Z_][a-zA-Z0-9_]*))  # macro name
        		(?:                              # and optionally:
        		    (\()                         # an open parenthesis
        		        (
        		            \s* \g<id> \s*       # first argument
        		            ((,) \s* \g<id> \s*)*  # additional arguments
        		            (?:\.\.\.)?          # varargs ellipsis?
        		        )
        		    (\))                         # a close parenthesis
        		)?
        	
- first-mate#36 [fixtures/scss.json] TEST #39 — Invalid RegExp: \s*(\$[A-Za-z0-9_-]+\b)\s*(\:)\s*
- first-mate#40 [fixtures/hyperlink.json] TEST #46 — Invalid RegExp: (?x)
				( (https?|s?ftp|ftps|file|smb|afp|nfs|(x-)?man(-page)?|gopher|txmt|issue)://|mailto:)
				[-:@a-zA-Z0-9_.,~%+/?=&#;]+(?<![-.,?:#;])
			
- first-mate#58 [fixtures/json.json] TEST #67 — Invalid RegExp: (?x:         # turn on extended mode
			             -?         # an optional minus
			             (?:
			               0        # a zero
			               |        # ...or...
			               [1-9]    # a 1-9 character
			               \d*      # followed by zero or more digits
			             )
			             (?:
			               (?:
			                 \.     # a period
			                 \d+    # followed by one or more digits
			               )?
			               (?:
			                 [eE]   # an e character
			                 [+-]?  # followed by an option +/-
			                 \d+    # followed by one or more digits
			               )?       # make exponent optional
			             )?         # make decimal portion optional
			           )
- first-mate#62 [fixtures/thrift.json] TEST #73 — Invalid RegExp: (?<!\S)(include)(?!\S)(?:\s+((['"])(?>.*?(\3))))?
- suite1#17 [fixtures/YAML.tmLanguage] Issue #119 — Invalid RegExp: (?:(^[ \t]*)|[ \t]+)(?=#\p{Print}*$)
- suite1#18 [fixtures/infinite-loop.json] Issue #145 — Invalid RegExp: \A
- suite1#21 [fixtures/239.tmLanguage.json] Issue #239 Wrong backreference escaping — Invalid RegExp: (?x)\1
[\2]+

### throw-other (3)
- first-mate#42 [fixtures/forever.json] TEST #48 — no includes defined
- suite1#15 [fixtures/66.plist] Issue #66 — Cannot set properties of undefined (setting 'backReferences')
- suite1#20 [fixtures/251.tmLanguage.json] Issue #251 empty `end` match immediately — Cannot set properties of undefined (setting 'backReferences')

### external-includes (46)
- first-mate#17 [fixtures/ruby.json] TEST #20
- first-mate#22 [fixtures/ruby.json] TEST #25
- first-mate#23 [fixtures/ruby.json] TEST #26
- first-mate#24 [fixtures/html-rails.json] TEST #27
- first-mate#25 [fixtures/html-rails.json] TEST #28
- first-mate#26 [fixtures/html-rails.json] TEST #29
- first-mate#27 [fixtures/include-external-repository-rule.json] TEST #30
- first-mate#28 [fixtures/html-rails.json] TEST #31
- first-mate#29 [fixtures/html-rails.json] TEST #32
- first-mate#32 [fixtures/javascript.json] TEST #35
- first-mate#37 [fixtures/php.json] TEST #42
- first-mate#39 [fixtures/php.json] TEST #45
- first-mate#41 [fixtures/javascript.json] TEST #47
- first-mate#43 [fixtures/ruby.json] TEST #49
- first-mate#44 [fixtures/makefile.json] TEST #50
- first-mate#45 [fixtures/makefile.json] TEST #51
- first-mate#46 [fixtures/makefile.json] TEST #53
- first-mate#47 [fixtures/git-commit.json] TEST #54
- first-mate#48 [fixtures/git-commit.json] TEST #55
- first-mate#49 [fixtures/c-plus-plus.json] TEST #56
- first-mate#50 [fixtures/c-plus-plus.json] TEST #57
- first-mate#51 [fixtures/ruby.json] TEST #58
- first-mate#52 [fixtures/objective-c-plus-plus.json] TEST #61
- first-mate#53 [fixtures/java.json] TEST #62
- first-mate#54 [fixtures/java.json] TEST #63
- first-mate#55 [fixtures/html-erb.json] TEST #64
- first-mate#56 [fixtures/html-erb.json] TEST #65
- first-mate#57 [fixtures/javascript.json] TEST #66
- first-mate#59 [fixtures/python.json] TEST #68
- first-mate#60 [fixtures/html.json] TEST #71
- first-mate#61 [fixtures/latex.json] TEST #72
- suite1#0 [fixtures/groovy.json] Groovy
- suite1#1 [fixtures/markdown.plist] Nested repositories in Markdown
- suite1#2 [fixtures/aspvbnet.plist] asp
- suite1#3 [fixtures/aspvbnet.plist] asp2
- suite1#4 [fixtures/php.plist] Injections in PHP
- suite1#5 [fixtures/Jade.tmLanguage] Jade
- suite1#6 [fixtures/Perl.plist] Perl
- suite1#7 [fixtures/Ruby.plist] Ruby
- suite1#8 [fixtures/Makefile.plist] Issue #8
- suite1#10 [fixtures/Jade.json] Issue #17
- suite1#11 [fixtures/Markdown.tmLanguage] Issue #10
- suite1#12 [fixtures/html2.json] Issue #46
- suite1#13 [fixtures/Jade22.json] Issue #22
- suite1#14 [fixtures/Pug.tmLanguage] Issue #82
- suite1#16 [fixtures/105.grammarA.json] Issue #105

