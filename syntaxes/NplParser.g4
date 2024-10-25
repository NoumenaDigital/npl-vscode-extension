parser grammar NplParser;

// If IDEA shows NplLexer as red, right click, select "Configure ANTLR..." and enter
// "target/generated-sources/antlr4" in the "Output directory" field.
options { tokenVocab=NplLexer; }

/* Quirks mode is used in the plugin for better handling of partial code.
 * These are isolated from the real compiler to guard against adverse effects of these changes. */
@members {
    public boolean quirksMode=false;
    public int q_var=1;
    public int q_private=2;
    public int q_vararg=4;
    public int q_optional=8;
}

root
    : (packageStmt SEMICOLON?)? (useStmt SEMICOLON?)* statement* EOF
    ;

packageStmt
    : PACKAGE qualifiedName
    ;

useStmt
    : USE qualifiedName
    ;

qualifiedName
    : qualifiedIdentifier (DOT qualifiedIdentifier)*
    ;

qualifiedIdentifier
    : IDENTIFIER
    ;

docComment
    : DOC_COMMENT
    | {quirksMode}? DOC_COMMENT_UNCLOSED {notifyErrorListeners("Missing '*/'");};

annotationMessage
    : LPAREN textLiteral RPAREN
    ;

annotation
    : AT IDENTIFIER annotationMessage?
    ;

identifier
    : IDENTIFIER
    ;

textLiteral
    : TEXT_LITERAL
    ;

numberLiteral
    : MINUS? NUMBER_LITERAL
    ;

booleanLiteral
    : BOOLEAN_LITERAL
    ;

partyLiteral
    : PARTY_LITERAL
    ;

timeLiteral
    : TIME_LITERAL
    ;

constantLiteral
    : textLiteral
    | numberLiteral
    | booleanLiteral
    | partyLiteral
    | timeLiteral
    ;

literal
    : constantLiteral
    | lambdaLiteral
    ;

lambdaLiteral
    : FUNCTION paramList[0] (RETURNS typeExpr)? RIGHT_ARROW expr
    ;

term
    : literal
    | createExpr
    | thisExpr
    | callExpr
    | identifier
    | block
    | ifExpr
    | matchExpr
    | parenExpr
    ;

primaryTail
    : withExpr
    | selectExpr
    | memberExpr
    ;

withExpr
    : WITH LPAREN withNamedExprList RPAREN
    | COPY LPAREN structCopyNamedExprList RPAREN
    ;

variableIdentifier
    : IDENTIFIER
    ;

memberExpr
    : fieldIdentifier
    ;

selectExpr
    : actionIdentifier namedOrUnnamedPartyList[true] LPAREN namedOrUnnamedExprList? RPAREN
    ;

callExpr
    : functionIdentifier typeParameters LPAREN namedOrUnnamedExprList? RPAREN
    ;

// Important: the ordering here affects the precedence.
expr
    : term                                      # PrimaryExpr
    | expr bop=DOT primaryTail?                 # TailExpr
    | expr invokeExpr                           # EvaluateExpr
    | prefix=(NOT | MINUS) expr                 # UnaryOp
    | expr bop=(ASTERISK|SLASH|PERCENT) expr    # BinaryOp
    | expr bop=(PLUS|MINUS) expr                # BinaryOp
    | expr bop=(LE | GE | GT | LT) expr         # BinaryOp
    | expr bop=(EQ | NOT_EQ) expr               # BinaryOp
    | expr bop=OP_AND expr                      # BinaryOp
    | expr bop=OR expr                          # BinaryOp
    ;

invokeExpr
    : LPAREN namedOrUnnamedExprList? RPAREN
    ;

parenExpr
    : LPAREN expr RPAREN
    ;

namedExpr
    : fieldIdentifier ASSIGN expr
    | {quirksMode}? fieldIdentifier {notifyErrorListeners("Missing assignment");}
    | {quirksMode}? fieldIdentifier ASSIGN {notifyErrorListeners("Missing expression");}
    ;

exprList
    : expr (( COMMA | {notifyErrorListeners("Missing ','");} ) expr)*
    ;

namedOrUnnamedExprList
    : (expr | namedExpr) (( COMMA | {notifyErrorListeners("Missing ','");} ) (expr | namedExpr))*
    | {quirksMode}? namedExpr COMMA {notifyErrorListeners("Missing named expression");}
    ;

withNamedExpr
    : fieldIdentifier ASSIGN expr
    ;

withNamedExprList
    : withNamedExpr (( COMMA | {notifyErrorListeners("Missing ','");} ) withNamedExpr)*
    ;

structCopyNamedExprList
    : structCopyNamedExpr (( COMMA | {notifyErrorListeners("Missing ','");} ) structCopyNamedExpr)*
    ;

structCopyNamedExpr
    : structCopyFieldIdentifier ASSIGN expr
    ;

structCopyFieldIdentifier
    : IDENTIFIER | COPY
    ;

argumentNameIdentifier
    : IDENTIFIER
    ;

observers
    : (COMMA argumentNameIdentifier ASSIGN expr)
    ;

createExpr
    : protocolIdentifier namedOrUnnamedPartyList[true] (LPAREN namedOrUnnamedExprList? RPAREN)?
    ;

ifExpr
    : IF condition=expr consequent=expr (ELSE alternate=expr)?
    ;

matchExpr
    : MATCH LPAREN expr RPAREN LBRACE matchCase* RBRACE
    ;

matchCase
    : (matchCaseExpression | ELSE) RIGHT_ARROW expr
    ;

isExpr
    : IS typeExpr
    ;

fullyQualifiedEnumExpr
    : term DOT primaryTail
    ;

matchCaseExpression
    : isExpr
    | memberExpr
    | fullyQualifiedEnumExpr
    | {quirksMode}? expr {notifyErrorListeners("Unsupported match case");}
    ;

thisExpr
    : THIS
    ;

assignStmt
    : variableIdentifier ASSIGN expr SEMICOLON                    # VariableBinding
    | thisExpr bop=DOT thisMemberIdentifier ASSIGN expr SEMICOLON # PropertyBinding
    | variableIdentifier bop=DOT memberExpr ASSIGN expr SEMICOLON # MemberBinding
    ;

thisMemberIdentifier
    : IDENTIFIER
    ;

fieldIdentifier
    : IDENTIFIER | WITH
    ;

variableDecl
    : (optionallyTypedIdentifier[0, false] | typedIdentifier[0]) ASSIGN expr SEMICOLON
    ;

memberDecl
    : (memberOptionallyTypedIdentifier[q_private] | memberTypedIdentifier[q_private]) ASSIGN expr SEMICOLON
    ;

qualifier[int qual]
    : {0 != ($qual & q_private)}? PRIVATE
    | {0 != ($qual & q_var)}? VAR
    | {0 != ($qual & q_vararg)}? VARARG
    | {0 != ($qual & q_optional)}? OPTIONAL
    ;

constDecl
    : optionallyTypedIdentifier[0, true] ASSIGN constantLiteral SEMICOLON?
    ;

statement
    : constDecl
    | structDecl
    | protocolDecl
    | symbolDecl
    | functionDecl
    | notificationDecl
    | unionDecl
    | nplIdentifierDecl
    | enumDecl
    | topExprStmt
    | {quirksMode}? annotation+ {notifyErrorListeners("Annotation not allowed here");}
    ;

structIdentifier
    : IDENTIFIER
    ;

enumIdentifier
    : IDENTIFIER
    ;

enumVariantIdentifier
    : IDENTIFIER
    ;

enumVariantIdentifiers
    : enumVariantIdentifier (COMMA enumVariantIdentifier)*
    ;

enumDecl
    : docComment? annotation* ENUM enumIdentifier LBRACE enumVariantIdentifiers RBRACE SEMICOLON?
    ;

unionDecl
    : docComment? annotation* UNION unionIdentifier templateParameters? LBRACE typeExprList RBRACE SEMICOLON?
    ;

unionIdentifier
    : IDENTIFIER
    ;

nplIdentifierDecl
    : docComment? annotation* NPL_IDENTIFIER nplIdentifier SEMICOLON
    ;

nplIdentifier
    : IDENTIFIER
    ;

structDecl
    : docComment? annotation* STRUCT structIdentifier templateParameters? LBRACE typedIdentifiers[0]? RBRACE SEMICOLON?
    | docComment? annotation* STRUCT structIdentifier templateParameters? SEMICOLON
    ;

typeExprList
    : typeExpr (COMMA typeExpr)*
    ;

typeExpr
    : typeIdentifier typeParameters?                   # SimpleTypeExpr
    | outer=typeIdentifier DOT inner=typeIdentifier    # DerivedTypeExpr
    | LPAREN typeExprList? RPAREN RIGHT_ARROW typeExpr # FunctionTypeExpr
    ;

typeParameters
    : LT typeExprList GT
    ;

paramList[int qual]
    : LPAREN typedIdentifiers[qual]? RPAREN
    ;

typeIdentifier
    : IDENTIFIER
    ;

typedIdentifiers[int qual]
    : typedIdentifier[qual] (COMMA typedIdentifier[qual])*
    ;

memberTypedIdentifiers
    : LPAREN (memberTypedIdentifier[q_private | q_var] (COMMA memberTypedIdentifier[q_private | q_var])*)? RPAREN
    ;

memberTypedIdentifier[int qual]
    : typedIdentifier[qual]
    ;

memberOptionallyTypedIdentifier[int qual]
    : optionallyTypedIdentifier[qual, false]
    ;

optionallyTypedIdentifier[int qual, boolean isConst]
    : qualifier[qual]* varOrConst[isConst] variableIdentifier (COLON typeExpr)?
    ;

varOrConst[boolean isConst]
    : {$isConst}? CONST
    | {!$isConst}? VAR
    ;

typedIdentifier[int qual]
    : qualifier[qual]* variableIdentifier COLON typeExpr
    ;

protocolIdentifier
    : IDENTIFIER
    ;

protocolDecl
    : docComment? annotation* PROTOCOL partyList[false]
         protocolIdentifier memberTypedIdentifiers
         LBRACE requireStmt* (initDecl | stateDecl | actionDecl | memberDecl | functionDecl | {quirksMode}? annotation+ {notifyErrorListeners("Annotation not allowed here");})* RBRACE SEMICOLON?
    ;

symbolIdentifier
    : IDENTIFIER
    ;

symbolDecl
    : docComment? annotation* SYMBOL symbolIdentifier SEMICOLON?
    ;

party[boolean allowLiterals, boolean allowExternals]
    : {$allowExternals}? (mod=ASTERISK) IDENTIFIER
    | IDENTIFIER
    | {quirksMode || $allowLiterals}? partyLiteral
    ;

partyList[boolean allowLiterals]
    : LSQUARE (
        party[allowLiterals, false] ((COMMA | {notifyErrorListeners("Missing ','");}) party[allowLiterals, false] )*
        | {quirksMode}? {notifyErrorListeners("Party list must not be empty");}
    ) observers? RSQUARE
    ;

namedParty[boolean allowLiterals, boolean allowExternals]
    : {$allowExternals}? fieldIdentifier ASSIGN (mod=ASTERISK) IDENTIFIER
    | fieldIdentifier ASSIGN IDENTIFIER
    | {quirksMode || $allowLiterals}? fieldIdentifier ASSIGN partyLiteral
    | {quirksMode}? fieldIdentifier {notifyErrorListeners("Missing assignment");}
    | {quirksMode}? fieldIdentifier ASSIGN {notifyErrorListeners("Missing assignment value");}
    ;

namedOrUnnamedPartyList[boolean allowLiterals]
    : LSQUARE (
         (party[allowLiterals, false] | namedParty[allowLiterals, false])
         (
            (COMMA | {notifyErrorListeners("Missing ','");})
            (party[allowLiterals, false] | namedParty[allowLiterals, false])
         )*
         | {quirksMode}? {notifyErrorListeners("Party list must not be empty");}
    ) observers? RSQUARE
    ;

notificationDecl
    : docComment? annotation* NOTIFICATION notificationIdentifier paramList[0] RETURNS typeExpr SEMICOLON?
    ;

forStmt
    : FOR forStmtElemDecl forBody=block SEMICOLON?
    ;

forStmtElemDecl
    : LPAREN forElem=forStmtElemIdentifier IN forIterable=expr RPAREN
    ;

forStmtElemIdentifier
    : IDENTIFIER
    ;

functionIdentifier
    : IDENTIFIER | WITH
    ;

templateParameters
    : LT typeIdentifier (COMMA typeIdentifier)* GT
    ;

functionDecl
    : docComment? annotation* FUNCTION functionIdentifier paramList[0] (RETURNS returnTypeExpr=typeExpr)? RIGHT_ARROW expr SEMICOLON?
    | docComment? annotation* NATIVE FUNCTION templateParameters? (receiverTypeExpr=typeExpr DOT)? functionIdentifier paramList[q_vararg | q_optional] (RETURNS returnTypeExpr=typeExpr)? SEMICOLON?
    ;

initDecl
    : INIT block SEMICOLON?
    ;

actionDecl
    : obligationDecl | permissionDecl
    ;

actionStates
    : PIPE stateIdentifier (COMMA stateIdentifier)*
    ;

actionParams
    : LPAREN typedIdentifiers[0]? RPAREN
    ;

actionReturns
    : RETURNS typeExpr
    ;

actionIdentifier
    : IDENTIFIER
    ;

actionPartySpecifier
    : LSQUARE (
        party[false, true] ((sep=PIPE party[false, true] )* | (sep=AMPERSAND party[false, true] )*)
        | {quirksMode}? {notifyErrorListeners("Party list must not be empty");}
      )  RSQUARE;

obligationDecl
    : docComment? annotation* OBLIGATION actionHead (timeBeforeRestriction | {quirksMode}? {notifyErrorListeners("Missing deadline");}) actionReturns? actionStates? actionBody actionPunitive
    ;

permissionDecl
    : docComment? annotation* PERMISSION actionHead timeRestriction? actionReturns? actionStates? actionBody SEMICOLON?
    ;

actionHead
    : actionPartySpecifier actionIdentifier actionParams ///< partyList may only be filled with identifiers
    ;

actionBody
    : LBRACE updateStatement* RBRACE
    ;

actionPunitive
    : OTHERWISE becomeStmt
    ;

requireStmt
    : (GUARD | REQUIRE) LPAREN expr ( COMMA | {notifyErrorListeners("Missing ','");} ) ( TEXT_LITERAL | {quirksMode}? {notifyErrorListeners("Missing message");} ) RPAREN SEMICOLON
    | GUARD expr SEMICOLON
    ;

stateIdentifier
    : IDENTIFIER
    ;

stateDecl
    : docComment? (mod=(INITIAL | FINAL))? STATE stateIdentifier SEMICOLON?
    ;

timeIntervalRestriction
    : BETWEEN startTime=expr AND endTime=expr
    | AFTER startTime=expr BEFORE endTime=expr
    | BEFORE endTime=expr AFTER startTime=expr
    ;

timeBeforeRestriction
    : BEFORE endTime=expr
    ;

timeAfterRestriction
    : AFTER startTime=expr
    ;

timeRestriction
    : timeIntervalRestriction
    | timeBeforeRestriction
    | timeAfterRestriction
    ;

updateStatement
    : variableDecl
    | assignStmt
    | exprStmt
    | returnStmt
    | becomeStmt
    | notifyStmt
    | requireStmt
    | forStmt
    | {quirksMode}? identifier {notifyErrorListeners("Missing ';'");}
    | {quirksMode}? thisExpr DOT thisMemberIdentifier {notifyErrorListeners("Missing ';'");}
    ;

notificationIdentifier
    : IDENTIFIER
    ;

resumeIdentifier
    : IDENTIFIER
    ;

notifyStmt
    : NOTIFY notificationIdentifier LPAREN exprList? RPAREN (RESUME resumeIdentifier)? SEMICOLON
    ;

topExprStmt
    : expr (SEMICOLON | EOF)
    ;

exprStmt
    : expr SEMICOLON?
    ;

block
    : LBRACE updateStatement* RBRACE
    ;

returnStmt
    : RETURN expr? (SEMICOLON | {quirksMode}? {notifyErrorListeners("Missing ';'");})
    ;

becomeStmt
    : BECOME stateIdentifier SEMICOLON?
    ;
