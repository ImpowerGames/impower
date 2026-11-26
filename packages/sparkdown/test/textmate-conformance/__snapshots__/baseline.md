# vscode-textmate conformance baseline

Total cases: 95

## Summary by axis

- pass: 19
- mismatch: 3
- incomplete: 0
- capture-model: 0
- while-rule: 16
- regex-invalid: 55
- throw-other: 2
- load-error: 0

## Per-case

### pass (19)
- first-mate#0 [fixtures/hello.json] TEST #3
- first-mate#2 [fixtures/coffee-script.json] TEST #5
- first-mate#3 [fixtures/text.json] TEST #6
- first-mate#10 [fixtures/coffee-script.json] TEST #13
- first-mate#11 [fixtures/text.json] TEST #14
- first-mate#12 [fixtures/text.json] TEST #15
- first-mate#13 [fixtures/text.json] TEST #16
- first-mate#15 [fixtures/content-name.json] TEST #18
- first-mate#16 [fixtures/content-name.json] TEST #19
- first-mate#18 [fixtures/coffee-script.json] TEST #21
- first-mate#19 [fixtures/coffee-script.json] TEST #22
- first-mate#31 [fixtures/multiline.json] TEST #34
- first-mate#35 [fixtures/infinite-loop.json] TEST #38
- first-mate#38 [fixtures/nested-captures.json] TEST #44
- first-mate#42 [fixtures/forever.json] TEST #48
- first-mate#63 [fixtures/loops.json] TEST #74
- suite1#9 [fixtures/testlang12.plist] Issue #12
- suite1#16 [fixtures/105.grammarA.json] Issue #105
- suite1#19 [fixtures/147.grammar.json] Issue #147

### mismatch (3)
- first-mate#14 [fixtures/content-name.json] TEST #17 — line 3 "#endif": token[1] missing (expected "" ["source.test","all"])
- first-mate#21 [fixtures/apply-end-pattern-last.json] TEST #24 — line 2 "{ some }excentricSyntax }": token[0] value got "{ some " want "{"
- first-mate#30 [fixtures/imaginary.json] TEST #33 — line 1 "// a singleLineComment": token[2] missing (expected "" ["source.imaginaryLanguage","comment-body"])

### while-rule (16)
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
			
- suite1#0 [fixtures/whileLang.plist] While should match begin and stop on next line if while condition fails — while rules are not currently supported: alist
- suite1#1 [fixtures/whileLang.plist] While should match multiple lines while condition holds — while rules are not currently supported: alist
- suite1#2 [fixtures/whileLang.plist] While condition can match anywhere in line — while rules are not currently supported: alist
- suite1#3 [fixtures/whileLang.plist] Begin of while should consume entire rest of line. — while rules are not currently supported: alist
- suite1#4 [fixtures/whileLang.plist] Nested whiles should match using only inner most while on a mached line — while rules are not currently supported: alist
- suite1#5 [fixtures/whileLang.plist] Nested whiles should check line for outer most while to inner most while — while rules are not currently supported: alist
- suite1#6 [fixtures/whileLang.plist] Nested whiles should move line ahead before checking other conditions — while rules are not currently supported: alist
- suite1#7 [fixtures/whileLang.plist] Nested whiles should check line for outer most while to inner most while — while rules are not currently supported: alist
- suite1#8 [fixtures/whileLang.plist] Should Correctly handle anchor in while rule — while rules are not currently supported: blist

### regex-invalid (55)
- first-mate#17 [fixtures/ruby.json] TEST #20 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#20 [fixtures/coffee-script.json] TEST #23 — Invalid RegExp: \#\{
- first-mate#22 [fixtures/ruby.json] TEST #25 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#23 [fixtures/ruby.json] TEST #26 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#24 [fixtures/html-rails.json] TEST #27 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#25 [fixtures/html-rails.json] TEST #28 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#26 [fixtures/html-rails.json] TEST #29 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#27 [fixtures/include-external-repository-rule.json] TEST #30 — Invalid RegExp: (?x)\b(
				__import__|all|abs|any|apply|ascii|bin|callable|chr|classmethod|cmp|coerce|
				compile|delattr|dir|divmod|enumerate|eval|execfile|filter|format|getattr|
				globals|hasattr|hash|help|hex|id|input|intern|isinstance|issubclass|iter|
				len|locals|map|max|min|next|oct|open|ord|pow|print|property|range|
				raw_input|reduce|reload|repr|reversed|round|setattr|sorted|staticmethod|
				sum|super|type|unichr|vars|zip
			)\b
- first-mate#28 [fixtures/html-rails.json] TEST #31 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#29 [fixtures/html-rails.json] TEST #32 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#32 [fixtures/javascript.json] TEST #35 — Invalid RegExp: !|\$|%|&|\*|\-\-|\-|\+\+|\+|~|===|==|=|!=|!==|<=|>=|<<=|>>=|>>>=|<>|<|>|!|&&|\|\||\?\:|\*=|(?<!\()/=|%=|\+=|\-=|&=|\^=
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
- first-mate#37 [fixtures/php.json] TEST #42 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#39 [fixtures/php.json] TEST #45 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#40 [fixtures/hyperlink.json] TEST #46 — Invalid RegExp: (?x)
				( (https?|s?ftp|ftps|file|smb|afp|nfs|(x-)?man(-page)?|gopher|txmt|issue)://|mailto:)
				[-:@a-zA-Z0-9_.,~%+/?=&#;]+(?<![-.,?:#;])
			
- first-mate#41 [fixtures/javascript.json] TEST #47 — Invalid RegExp: !|\$|%|&|\*|\-\-|\-|\+\+|\+|~|===|==|=|!=|!==|<=|>=|<<=|>>=|>>>=|<>|<|>|!|&&|\|\||\?\:|\*=|(?<!\()/=|%=|\+=|\-=|&=|\^=
- first-mate#43 [fixtures/ruby.json] TEST #49 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#44 [fixtures/makefile.json] TEST #50 — Invalid RegExp: ^(?!\t)([^:]*)(:)(?!\=)
- first-mate#45 [fixtures/makefile.json] TEST #51 — Invalid RegExp: ^(?!\t)([^:]*)(:)(?!\=)
- first-mate#46 [fixtures/makefile.json] TEST #53 — Invalid RegExp: ^(?!\t)([^:]*)(:)(?!\=)
- first-mate#47 [fixtures/git-commit.json] TEST #54 — Invalid RegExp: \A(?!#)
- first-mate#48 [fixtures/git-commit.json] TEST #55 — Invalid RegExp: \A(?!#)
- first-mate#49 [fixtures/c-plus-plus.json] TEST #56 — Invalid RegExp: \b(namespace)\b\s*([_A-Za-z][_A-Za-z0-9]*\b)?+
- first-mate#50 [fixtures/c-plus-plus.json] TEST #57 — Invalid RegExp: \b(namespace)\b\s*([_A-Za-z][_A-Za-z0-9]*\b)?+
- first-mate#51 [fixtures/ruby.json] TEST #58 — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- first-mate#52 [fixtures/objective-c-plus-plus.json] TEST #61 — Invalid RegExp: \b(namespace)\b\s*([_A-Za-z][_A-Za-z0-9]*\b)?+
- first-mate#53 [fixtures/java.json] TEST #62 — Invalid RegExp: {
- first-mate#54 [fixtures/java.json] TEST #63 — Invalid RegExp: {
- first-mate#55 [fixtures/html-erb.json] TEST #64 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#56 [fixtures/html-erb.json] TEST #65 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#57 [fixtures/javascript.json] TEST #66 — Invalid RegExp: \\(x\h{2}|[0-2][0-7]{,2}|3[0-6][0-7]?|37[0-7]?|[4-7][0-7]?|.)
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
- first-mate#59 [fixtures/python.json] TEST #68 — Invalid RegExp: \b(?i:(0x\h*)L)
- first-mate#60 [fixtures/html.json] TEST #71 — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- first-mate#61 [fixtures/latex.json] TEST #72 — Invalid RegExp: (?x)
				(													# Capture 1
					(\\)											# Marker
					(
						(?:sub){0,2}section							# Functions
					  | (?:sub)?paragraph
					  | chapter|part|addpart
					  | addchap|addsec|minisec
					)
					(?:\*)?											# Optional Unnumbered
				)
				(?:
					(\[)([^\[]*?)(\])								# Optional Title
				)??
				(\{)												# Opening Bracket
				
- first-mate#62 [fixtures/thrift.json] TEST #73 — Invalid RegExp: (?<!\S)(include)(?!\S)(?:\s+((['"])(?>.*?(\3))))?
- suite1#0 [fixtures/groovy.json] Groovy — Invalid RegExp: }
- suite1#1 [fixtures/markdown.plist] Nested repositories in Markdown — Invalid RegExp: (?:^|\G)(#{1,6})\s*(?=[\S[^#]])
- suite1#2 [fixtures/aspvbnet.plist] asp — Invalid RegExp: (?i:((?<=(\+|=|-|\&|\\|/|<|>|\(|,))\s*\b([a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?)\b(?!(\(|\.))|\b([a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?)\b(?=\s*(\+|=|-|\&|\\|/|<|>|\(|\)))))
- suite1#3 [fixtures/aspvbnet.plist] asp2 — Invalid RegExp: (?i:((?<=(\+|=|-|\&|\\|/|<|>|\(|,))\s*\b([a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?)\b(?!(\(|\.))|\b([a-zA-Z_x7f-xff][a-zA-Z0-9_x7f-xff]*?)\b(?=\s*(\+|=|-|\&|\\|/|<|>|\(|\)))))
- suite1#4 [fixtures/php.plist] Injections in PHP — Invalid RegExp: (<)([a-zA-Z0-9:]++)(?=[^>]*></\2>)
- suite1#5 [fixtures/Jade.tmLanguage] Jade — Invalid RegExp: ^(\s*)(?=[\w.#].*?\.$)(?=(?:(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*)(?:(?:(?::\s+)|(?<=\)))(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*))*)\.$)(?:(?:(#[\w-]+)|(\.[\w-]+))|((?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))
- suite1#6 [fixtures/Perl.plist] Perl — Invalid RegExp: ([\$\@\%](#)?)([a-zA-Zx7f-xff\$]|::)([a-zA-Z0-9_x7f-xff\$]|::)*\b
- suite1#7 [fixtures/Ruby.plist] Ruby — Invalid RegExp: (?>[a-zA-Z_]\w*(?>[?!])?)(:)(?!:)
- suite1#8 [fixtures/Makefile.plist] Issue #8 — Invalid RegExp: ^(?!\t)([^:]*)(:)(?!\=)
- suite1#10 [fixtures/Jade.json] Issue #17 — Invalid RegExp: ^(\s*)(?=[\w.#].*?\.$)(?=(?:(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*)(?:(?:(?::\s+)|(?<=\)))(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*))*)\.$)(?:(?:(#[\w-]+)|(\.[\w-]+))|((?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))
- suite1#11 [fixtures/Markdown.tmLanguage] Issue #10 — Invalid RegExp: (?:^|\G)(#{1,6})\s*(?=[\S[^#]])
- suite1#12 [fixtures/html2.json] Issue #46 — Invalid RegExp: ^(///)\s*(?=<(reference|amd-dependency|amd-module)(\s+(path|types|no-default-lib|name)\s*=\s*((\'[^']*\')|(\"[^"]*\")))+\s*/>\s*$)
- suite1#13 [fixtures/Jade22.json] Issue #22 — Invalid RegExp: ^(\s*)(?=[\w.#].*?\.$)(?=(?:(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*)(?:(?:(?::\s+)|(?<=\)))(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*))*)\.$)(?:(?:(#[\w-]+)|(\.[\w-]+))|((?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))
- suite1#14 [fixtures/Pug.tmLanguage] Issue #82 — Invalid RegExp: ^(\s*)(?=[\w.#].*?\.$)(?=(?:(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*)(?:(?:(?::\s+)|(?<=\)))(?:(?:(?:(?:#[\w-]+)|(?:\.[\w-]+))|(?:(?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))(?:(?:#[\w-]+)|(?:\.[\w-]+)|(?:\((?:[^()\'\"]*(?:(?:\'(?:[^\']|(?:(?<!\\)\\\'))*\')|(?:\"(?:[^\"]|(?:(?<!\\)\\\"))*\")))*[^()]*\))*)*))*)\.$)(?:(?:(#[\w-]+)|(\.[\w-]+))|((?:[#!]\{[^}]*\})|(?:\w(?:(?:[\w:-]+[\w-])|(?:[\w-]*)))))
- suite1#17 [fixtures/YAML.tmLanguage] Issue #119 — Invalid RegExp: (?:(^[ \t]*)|[ \t]+)(?=#\p{Print}*$)
- suite1#18 [fixtures/infinite-loop.json] Issue #145 — Invalid RegExp: \A
- suite1#21 [fixtures/239.tmLanguage.json] Issue #239 Wrong backreference escaping — Invalid RegExp: (?x)\1
[\2]+

### throw-other (2)
- suite1#15 [fixtures/66.plist] Issue #66 — Cannot set properties of undefined (setting 'backReferences')
- suite1#20 [fixtures/251.tmLanguage.json] Issue #251 empty `end` match immediately — Cannot set properties of undefined (setting 'backReferences')

