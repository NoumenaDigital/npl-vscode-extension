# NPL Development v5

NPL (NOUMENA Protocol Language) has unique syntax for defining protocol types and operations, strong typing, and a
distinct approach to modeling permissions and state transitions.

## Simple Example: Payment Protocol

```npl
package iou

/**
 * Struct to represent a timestamped amount
 * @param amount The amount of the payment
 * @param timestamp The time at which the payment was made
 */
struct TimestampedAmount {
    amount: Number,
    timestamp: DateTime
};

/**
 * Function to calculate the total of a list of timestamped amounts
 * @param entries The list of timestamped amounts
 * @return The total amount
 */
function total(entries: List<TimestampedAmount>) -> entries.map(function(p: TimestampedAmount) -> p.amount).sum();

/**
 * Simple IOU protocol
 * @param issuer The party issuing the IOU
 * @param payee The party receiving the IOU
 * @param forAmount The initial amount of the IOU
 */
@api
protocol[issuer, payee] Iou(var forAmount: Number) {
    require(forAmount > 0, "Initial amount must be strictly positive");

    initial state unpaid;
    final state paid;
    final state forgiven;

    private var payments = listOf<TimestampedAmount>();

    /**
     * Function to calculate the amount owed
     * @return The amount owed
     */
    function amountOwed() returns Number -> forAmount - total(payments);

    /**
     * Function to pay a certain amount towards the IOU, invoked by the issuer
     * @param amount The amount to pay
     */
    @api
    permission[issuer] pay(amount: Number) | unpaid {
        require(amount > 0, "Amount must be strictly positive");
        require(amount <= amountOwed(), "Amount may not exceed amount owed");

        var p = TimestampedAmount(amount = amount, timestamp = now());

        payments = payments.with(p);

        if (amountOwed() == 0) {
            become paid;
        };
    };

    /**
     * Function to forgive the IOU, invoked by the payee
     */
    @api
    permission[payee] forgive() | unpaid {
        become forgiven;
    };

    /**
     * Function to get the amount owed, invoked by either party
     * @return The amount owed
     */
    @api
    permission[issuer | payee] getAmountOwed() returns Number | unpaid {
        return amountOwed();
    };
}
```

Here are a couple of simple tests (should be placed in a DIFFERENT file, but part of the same package) for the above
example:

```npl
@test
function test_amount_owed_after_pay(test: Test) -> {
    var iou = Iou['issuer', 'payee'](100);
    iou.pay['issuer'](50);

    test.assertEquals(50, iou.getAmountOwed['issuer'](), "Amount owed should reflect payment");
};

@test
function test_pay_negative_amount(test: Test) -> {
    var iou = Iou['issuer', 'payee'](100);

    test.assertFails(function() -> iou.pay['issuer'](-10), "Paying negative amounts should fail");
};
```

Do NOT generate tests unless explicitly asked to.

## Common mistakes to avoid

These are critical errors to avoid when working with NPL:

- **Text, not String**: NPL uses `Text` type, not `String`.
- **No null values**: NPL doesn't have `null` or nullable types. Use `Optional<T>` instead.
- **Optional handling**: Access optional values with `getOrElse()`, `getOrFail()`, or `computeIfAbsent()`.
- **Party limitations**: NEVER store or persist values of the `Party` type in protocol-level variables, collections, or
  data structures.
- **Always use semicolons**: Semicolons are MANDATORY at the end of ALL statements. This includes:

  - Return statements inside blocks: `return value;`
  - Statement blocks inside control structures: `if (condition) { doSomething(); };`
  - Statements inside functions: `var x = 5;`

  ```npl
  // CORRECT - note semicolons after each return and after the entire if-else block
  var f = function() returns Text -> if (true) { return "foo"; } else { return "bar"; };

  // INCORRECT - missing semicolons after return statements and if-else block
  var f = function() returns Text -> if (true) { return "foo" } else { return "bar" }
  ```

- **No ternary operators**: Always use if-else statements instead of `?:` syntax.
- **Otherwise clauses**: In obligations, the `otherwise` clause MUST ONLY contain a state transition.
- **Method hallucinations**: Only use the standard library methods explicitly documented below.
- **No imports or mocks**: Define everything you need in the current file.
- **Keep implementations simple**: Prefer small applications with less than 200 lines of code.
- **Type definitions outside protocols**: Always define types (structs, enums, unions, etc.) at the top level of the
  file, NEVER inside protocols.
- **Struct field syntax**: Struct fields use commas, not semicolons, and don't use `var`:

  ```npl
  // INCORRECT
  struct Item {
    var id: Text;
    var price: Number;
  };

  // CORRECT
  struct Item {
    id: Text,
    price: Number
  };
  ```

- **Avoid reserved keywords**: Never use these reserved keywords as variable names, parameter names, or identifiers:
  `after`, `and`, `become`, `before`, `between`, `const`, `enum`, `else`, `final`, `for`, `function`, `guard`, `in`,
  `init`, `initial`, `if`, `is`, `match`, `native`, `notification`, `notify`, `identifier`, `obligation`, `optional`,
  `otherwise`, `package`, `permission`, `private`, `protocol`, `require`, `resume`, `return`, `returns`, `state`,
  `struct`, `symbol`, `this`, `union`, `use`, `var`, `vararg`, `with`, `copy`

  **CRITICAL WARNING:** Be especially careful not to use `state` or `symbol` as variable names. These are two of the
  most commonly misused reserved keywords. Other frequently misused keywords include `return`, `final`, and `initial`.
  Reserved keywords should only be used for their intended purpose (e.g., `state` for state declarations:
  `initial state unpaid;`; `symbol` for declaring new symbol types: `symbol chf;`).

- **No redundant getters**: Do NOT create permissions or functions that simply return a public protocol field (e.g.,
  `getAmount()`). All non-private top-level variables are already queryable via the API. Only introduce a separate
  accessor when additional logic is required.

- **Unwrap activeState() before comparing**: `activeState()` returns an `Optional<State>`. Use `getOrFail()` (or another
  optional-handling method) before comparison, and reference the state constant via the `States` enum:

  ```npl
  activeState().getOrFail() == States.stateName; // Correct
  ```

  Direct comparisons like `activeState() == stateName` are invalid.

- **Boolean operators**: Use `&&` and `||` for logical AND/OR. Keywords `and` and `or` are not valid in NPL.

- **Permission syntax order**: Always use this exact order in permission declarations:

  ```npl
  // CORRECT ORDER
  permission[party] foo(parameters) returns ReturnType | stateName { ... };

  // INCORRECT - state constraint after return type
  permission[party] foo(parameters) | stateName returns ReturnType { ... };
  ```

  The return type (`returns Type`) must always come before the state constraint (`| stateName`).

- **Always initialize variables**: ALL variables MUST be initialized when declared. Uninitialized variables are not
  allowed in NPL.

  ```npl
  // INCORRECT - uninitialized variable
  private var bookingTime: DateTime;

  // CORRECT - variable with initialization
  private var bookingTime: DateTime = now();
  ```

- **No comments before package declaration**: NOTHING should appear before the package statement. No comments, no
  docstrings, no whitespace. The package declaration must be the very first line of any NPL file.

  ```npl
  // INCORRECT - comment before package
  /** File documentation */
  package mypackage

  // CORRECT - package is first
  package mypackage
  ```

## Key Guidelines

- All NPL files have the `.npl` extension and must start with a package declaration.
- NPL is strongly typed - respect the type system when writing code.
- Follow existing code style in the project.
- Protocols, permissions, and states are fundamental concepts.
- All variables must be initialized when declared.
- **Document Everything**: Use Javadoc-style comments (`/** ... */`) for all declarations. Include `@param` and
  `@return` tags where applicable. Do NOT add Javadoc to variables or `init` blocks. Place docstrings directly above the
  element they document (protocols, functions, structs, etc.), never at the top of the file.
- **Initialization**: Use `init` block for initialization behavior.
- **End if statements with semicolons**:
  ```npl
  if (amount > 0) { return true; }; // Semicolon required
  ```
- **Use toText(), not toString()** for string conversion.
- **Only use for-in loops** - there are no while loops (or other kinds of loops) in NPL:
  ```npl
  for (item in items) { process(item); }; // Correct
  ```
- **Multiple parties in single permission**: Use `permission[buyer | seller]` not multiple declarations.
- **Use length() for Text, not size()**:
  ```npl
  var nameCount = name.length(); // Correct
  ```
- **List.without() removes elements, not indices**:
  ```npl
  var itemToRemove = items.get(index);
  items = items.without(itemToRemove); // Correct
  ```
- **Invoke permissions with this. and party**:
  ```npl
  this.startProcessing[provider](); // Correct
  ```
- **DateTime methods require inclusive parameter**:
  ```npl
  if (deadline.isBefore(now(), false)) { /* Strictly before */ };
  ```
- **Don't hallucinate methods**: Only use methods explicitly listed in this document's "Allowed Methods by Type"
  section.
- **Immutable collections**: `with()` and `without()` create new collections.
- **No advanced functional operations**: No streams, reduce, unless documented above.
- **No `Any` type**: Always use the most specific type for a variable.

## Folder Structure Guidelines

When organizing your NPL project, adhere to the following folder structure:

- **Entry Point**:

  - The project entry point is always a `migration.yml` file that defines migration changesets.
  - This file is often located at `*/src/main/migration.yml` and references the source directories.

- **Source Files**:

  - NPL source files are organized in versioned directories (e.g., `npl-1.0.0/`) as specified in the migration.yml file.
  - New NPL files and packages should be created within the appropriate versioned directory (e.g.,
    `src/main/npl-1.0.0/my_package/`).
  - Always create a new package (a new sub-directory) within the versioned directory when implementing new, distinct
    functionality.

- **Test Files**:

  - Test files should be placed in a separate `test` directory, usually found at `src/test/npl/`. The package structure
    within the `test` directory should mirror the structure of the source files they are testing. For example, tests for
    `src/main/npl-1.0.0/my_package/MyProtocol.npl` would be located in `src/test/npl/my_package/MyProtocolTests.npl`.

Don't generate tests unless explicitly asked to.

## Protocol Syntax

### Protocol Declaration

```npl
/**
 * Basic protocol structure.
 * @param initialValue Initial numeric value.
 * @param textParameter Text parameter.
 */
@api  // Required for API instantiation
protocol[party1, party2] ProtocolName(
  // The var keyword makes the variable accessible to the protocol body
  var initialValue: Number,
  var textParameter: Text
) {
    init {
        // Initialization
    };
    // Protocol body
};
```

### Protocol Instantiation

```npl
var instance = ProtocolName[alice, bob](42, "example");

// With named arguments
var namedInstance = ProtocolName[party1 = alice, party2 = bob](
  initialValue = 42, textParameter = "example"
);
```

## Permissions and States

```npl
@api
protocol[issuer, recipient] Transfer() {
  // States
  initial state created;
  state pending;
  final state completed;

  /**
   * Allows the issuer to send money.
   * @param amount Amount to send.
   * @return Success status.
   */
  permission[issuer] sendMoney(amount: Number) | created, pending returns Boolean {
    require(amount > 0, "Amount must be positive");
    become completed;
    return true;
  };

  /**
   * Obligation with deadline.
   */
  obligation[issuer] makePayment() before deadline | created {
    // Action logic
  } otherwise become expired; // ONLY state transition allowed in otherwise
};
```

## Standard Library and Type System

NPL has a defined standard library. **Never invent or assume the existence of methods that aren't documented.**

### Available Types

- **Basic Types**: `Boolean`, `Number`, `Text`, `DateTime`, `LocalDate`, `Duration`, `Period`, `Blob`, `Unit`
- **Collection Types**: `List<T>`, `Set<T>`, `Map<K, V>`
- **Complex Types**: `Optional<T>`, `Pair<A, B>`, `Party`, `Test`
- **User-Defined Types**: `Enum`, `Struct`, `Union`, `Identifier`, `Symbol`, `Protocol`

### Standard Library Functions

> **Note**: The functions listed below are top-level helpers, invoked _directly_ (e.g., `var t = now()`). They are
> **not** receiver methods—expressions such as `now().millis()` or `someDate.millis()` are invalid.

- **Logging**: `debug()`, `info()`, `error()`
- **Constructors**: `listOf()`, `setOf()`, `mapOf()`, `optionalOf()`, `dateTimeOf()`, `localDateOf()`
- **Time and Duration**: `now()`, `millis()`, `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`,
  `years()`

### Type Usage Examples

```npl
// Basic types
var amount = 100;
var name = "John";
var isValid = true;

// Collections
var numbers = listOf(1, 2, 3);
var uniqueNumbers = setOf(1, 2, 3);
var userScores = mapOf(Pair("alice", 95), Pair("bob", 87));

// Optionals
var presentValue = optionalOf(42);
var emptyValue = optionalOf<Number>();
var value = presentValue.getOrElse(0);

// Control Flow
if (amount > 100) {
  return "High value";
} else if (amount > 50) {
  return "Medium value";
} else {
  return "Low value";
};

// Match expressions
var result = match(paymentStatus) {
  Pending -> "Please wait"
  Completed -> "Thank you"
  Failed -> "Please try again"
};

// Functions
function calculateTax(amount: Number) returns Number -> {
  return amount * 0.2;
};
```

### Allowed Methods by Type

Use ONLY these methods - do not hallucinate or invent others:

- **Collection Methods (all collections)**:

  - `allMatch()`, `anyMatch()`, `contains()`, `flatMap()`, `fold()`, `forEach()`, `isEmpty()`, `isNotEmpty()`
  - `map()`, `noneMatch()`, `size()`, `asList()`
  - Collections of `Number`: `sum()`

- **List Methods**:

  - `filter()`, `findFirstOrNone()`, `firstOrNone()`, `get()`, `head()`, `indexOfOrNone()`, `lastOrNone()`, `plus()`
  - `reverse()`, `sort()`, `sortBy()`, `tail()`, `toSet()`, `with()`, `withAt()`, `without()`, `withoutAt()`
  - `withIndex()`, `zipOrFail()`, `takeFirst()`, `takeLast()`, `toMap()`

- **Map Methods**:

  - `filter()`, `forEach()`, `getOrNone()`, `isEmpty()`, `isNotEmpty()`, `keys()`, `plus()`, `size()`
  - `mapValues()`, `values()`, `with()`, `without()`, `toList()`

- **Set Methods**:

  - `filter()`, `plus()`, `toList()`, `with()`, `without()`, `takeFirst()`, `takeLast()`

- **Text Methods**:

  - `plus()`, `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`, `length()`

- **Number Methods**:

  - `isInteger()`, `roundTo()`, `negative()`, `plus()`, `minus()`, `multiplyBy()`, `divideBy()`, `remainder()`
  - `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`

- **Boolean Methods**:

  - `not()`

- **DateTime Methods**:

  - `day()`, `month()`, `year()`, `nano()`, `second()`, `minute()`, `hour()`, `zoneId()`
  - `firstDayOfYear()`, `lastDayOfYear()`, `firstDayOfMonth()`, `lastDayOfMonth()`, `startOfDay()`
  - `durationUntil()`, `isAfter()`, `isBefore()`, `isBetween()`, `withZoneSameLocal()`, `withZoneSameInstant()`
  - `plus()`, `minus()`, `toLocalDate()`, `dayOfWeek()`

- **Duration Methods**:

  - `toSeconds()`, `plus()`, `minus()`, `multiplyBy()`

- **LocalDate Methods**:

  - `day()`, `month()`, `year()`, `firstDayOfYear()`, `lastDayOfYear()`, `firstDayOfMonth()`, `lastDayOfMonth()`
  - `isAfter()`, `isBefore()`, `isBetween()`, `plus()`, `minus()`, `periodUntil()`, `atStartOfDay()`, `dayOfWeek()`

- **Period Methods**:

  - `plus()`, `minus()`, `multiplyBy()`

- **Optional Methods**:

  - `isPresent()`, `getOrElse()`, `getOrFail()`, `computeIfAbsent()`

- **Party Methods**:

  - `isRepresentableBy()`, `mayRepresent()`, `claims()`

- **Protocol Methods**:

  - `parties()`, `activeState()`, `initialState()`, `finalStates()`

- **Blob Methods**:

  - `filename()`, `mimeType()`

- **Symbol Methods**:

  - `toNumber()`, `unit()`, `plus()`, `minus()`, `multiplyBy()`, `divideBy()`, `remainder()`, `negative()`
  - `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`

- **General Methods**:
  - All types: `toText()` - converts value to Text representation

# NPL frontend generation

NPL frontend applications must adhere to the following principles and workflow:

## Project Initialization

- **If starting from scratch:**
  - Run the following command to scaffold a new frontend project:
    - `npx create-npl --tenant $TENANT --app $APP --name $DIR --package $PKG`
    - Replace `$TENANT`, `$APP`, `$DIR`, and `$PKG` with the appropriate values for your deployment. If these are
      unknown, prompt the user to provide them.
    - `$DIR` can be any suitable directory in the project; it does not need to be a special or fixed value.
- **If a frontend folder with a baseline already exists:**
  - Use the existing frontend folder as your starting point. Do not re-initialize or overwrite the baseline.

## OpenAPI Integration

- All backend API endpoints are defined in the OpenAPI specification. Do not invent or hallucinate endpoints.
- Only use the functions provided in the generated OpenAPI client (typically found in `generated/api.ts`).
- Ensure all API payloads and return types strictly match the OpenAPI specification.

## Minimal Use-Case Focus

- Implement only the most minimal use-case required for the application.
- Avoid adding unnecessary features, mock data, or extraneous UI elements.

## Party Representation

- Party objects identify users and must use the following structure: `{ "claims": { "key": ["value"] } }`
- For individuals, use the email key: `{ "claims": { "email": ["user@example.com"] } }`
- For groups, use the relevant identifying attribute as the key.
- Leave claims empty for parties accessible by all users.

## Frontend Development Rules

- Use React with TypeScript and functional components.
- Use React Hooks for state and effect management.
- Use React Hook Form for form handling.
- Implement proper TypeScript types and interfaces throughout.
- Implement error boundaries for robust error handling.
- Create reusable UI components and follow component composition best practices.
- Separate logic, presentation, and data concerns.
- Organize components in logical folders, separating utilities, types, and services.
- Use index files for clean imports and follow naming conventions (PascalCase for components, camelCase for functions).
- Implement responsive design and maintain consistent spacing and typography.

## Authorization

- Use OIDC (OpenID Connect) standard flow for authentication and authorization.

## Build and Deployment

- After implementing or updating the frontend, always run `npm run build` in the frontend folder to generate the
  production-ready `dist` directory for deployment.

<!-- END NPL DEVELOPMENT SECTION -->
