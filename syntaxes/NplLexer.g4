lexer grammar NplLexer;

AFTER: 'after';
AND: 'and';
BECOME: 'become';
BEFORE: 'before';
BETWEEN: 'between';
CONST: 'const';
ENUM: 'enum';
ELSE: 'else';
FINAL: 'final';
FOR: 'for';
FUNCTION: 'function';
GUARD: 'guard';
IN: 'in';
INIT: 'init';
INITIAL: 'initial';
IF: 'if';
IS: 'is';
MATCH: 'match';
NATIVE: 'native';
NOTIFICATION: 'notification';
NOTIFY: 'notify';
NPL_IDENTIFIER: 'identifier';
OBLIGATION: 'obligation';
OPTIONAL: 'optional';
OTHERWISE: 'otherwise';
PACKAGE: 'package';
PERMISSION: 'permission';
PRIVATE: 'private';
PROTOCOL: 'protocol';
REQUIRE: 'require';
RESUME: 'resume';
RETURN: 'return';
RETURNS: 'returns';
STATE: 'state';
STRUCT: 'struct';
SYMBOL: 'symbol';
THIS: 'this';
UNION: 'union';
USE: 'use';
VAR: 'var';
VARARG: 'vararg';
WITH: 'with';
COPY: 'copy';

// Literals
TEXT_LITERAL :  '"' TEXT_CHAR* '"' ;
fragment TEXT_CHAR : ESC | ~["\\] ;
fragment ESC :   '\\' ["\bfnrt] ;

BOOLEAN_LITERAL: 'true' | 'false';
PARTY_LITERAL: '\'' PARTY_CHAR+ '\'';
fragment PARTY_CHAR : ESC | ~['\\] ;
fragment DATE : Digit Digit Digit Digit '-' Digit Digit '-' Digit Digit;
fragment TIME : Digit Digit ':' Digit Digit (':' Digit Digit (DOT Digit+)?)?;
fragment TIME_OFFSET : ('Z' | (PLUS | MINUS) Digit Digit ':' Digit Digit );
TIME_LITERAL: DATE 'T' TIME TIME_OFFSET;
fragment FLOAT_LITERAL: Digit+ '.' Digit+;
fragment INT_LITERAL: Digit+;
NUMBER_LITERAL: INT_LITERAL | FLOAT_LITERAL;

// Identifier
IDENTIFIER: Letter (Letter | Digit)*;

// Operators etc.
AT: '@';
OP_AND: '&&';
OR: '||';
NOT_EQ: '!=';
EQ: '==';
LE: '<=';
GE: '>=';
LEFT_ARROW: '<-';
RIGHT_ARROW: '->';
DOT: '.';
LPAREN: '(';
RPAREN: ')';
LBRACE: '{';
RBRACE: '}';
LSQUARE: '[';
RSQUARE: ']';
COMMA: ',';
SEMICOLON: ';';
COLON: ':';
LT: '<';
GT: '>';
ASSIGN: '=';
PLUS: '+';
MINUS: '-';
SLASH: '/';
ASTERISK: '*';
BSLASH: '\\';
NOT: '!';
PIPE: '|';
AMPERSAND: '&';
PERCENT: '%';

// Whitespace and comments (see Tokenizer)
WHITESPACE: [ \t\r\n\u000C]+ -> channel(HIDDEN);
LINE_COMMENT: '//' ~[\r\n]* -> channel(HIDDEN);
DOC_COMMENT: '/**' ( ( SLASH+ | ASTERISK+ )? ~[*/] )*? '*/';
DOC_COMMENT_UNCLOSED: '/**' ( WHITESPACE | ASTERISK )* -> channel(HIDDEN);
BLOCK_COMMENT: ( '/*' ~[*]? ( ( SLASH+ | ASTERISK+ )? ~[*/] )*? '*/' ) -> channel(HIDDEN);
BLOCK_COMMENT_UNCLOSED: ( '/*' ( WHITESPACE ( WHITESPACE | ASTERISK )* )? ) -> channel(HIDDEN);
CARET: '<caret>' -> channel(HIDDEN);

// Fragments
fragment Digit
    : [0-9]
    ;

fragment Letter
    : [a-zA-Z_\p{Alpha}\p{General_Category=Other_Letter}]
    ;

/** "catch all" rule for any char not matched in a token rule of your
 *  grammar. Lexers in IntelliJ must return all tokens good and bad.
 *  There must be a token to cover all characters, which makes sense, for
 *  an IDE. The parser however should not see these bad tokens because
 *  it just confuses the issue. Hence, the hidden channel.
 */
ERRCHAR
    :	.	-> channel(HIDDEN)
    ;
