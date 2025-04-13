# NPL Development v{{VERSION}}

When working with NPL (Noumena Protocol Language) files:

## Introduction

NPL (Noumena Protocol Language) is a domain-specific language for the Noumena Protocol. It has unique syntax for
defining protocol types and operations, strong typing, and a distinct approach to modeling permissions and state
transitions.

## Key Guidelines

1. All NPL files have the `.npl` extension
2. NPL is strongly typed - respect the type system when writing code
3. Follow existing code style in the project
4. Protocols, permissions, and states are fundamental concepts
5. Understand the party system for managing access and permissions
6. **Document Everything**: Use Javadoc-style comments (`/** ... */`) preceding all declarations (protocols, functions,
   permissions, obligations, structs, enums, etc.) to explain their purpose. Include `@param` and `@return` tags where
   applicable. Do NOT add Javadoc docstrings to variables or `init` blocks.
7. **No ternary operators**: Use if-else statements instead of `?:` syntax.
8. **Initialization**: Use `init` block for initialization behavior.
9. **No imports**: Define everything needed in the file being created.
10. **Otherwise clauses**: Only use for state transitions (`otherwise become someState;`).
11. **End if statements with semicolons**:
    ```npl
    if (amount > 0) { return true; }; // Semicolon required
    ```
12. **No Any type**: Use specific types or union types instead.
13. **Requires outside init**: Place `require` statements at protocol level, not in `init`.
14. **Use toText(), not toString()** for string conversion.
15. **No Javadoc on init**: Only add Javadoc to declarations, not init blocks.
16. **Only use for-in loops**:
    ```npl
    for (item in items) { process(item); }; // Correct
    ```
17. **Multiple parties in single permission**: Use `permission[buyer | seller]` not multiple declarations.
18. **Direct state names in match**:
    ```npl
    match(activeState().getOrFail()) {
      created -> "Created"
      processing -> "Processing"
    };
    ```
19. **Use length() for Text, not size()**: The Text type uses `length()` to get character count, not `size()`:

    ```npl
    // INCORRECT
    var nameCount = name.size();

    // CORRECT
    var nameCount = name.length();
    ```

20. **List.without() removes elements, not indices**: The `without()` method on List takes an element to remove, not an
    index:

    ```npl
    // INCORRECT - this tries to remove the element that equals the index number
    items = items.without(index);

    // CORRECT - first get the element at the index, then remove it
    var itemToRemove = items.get(index);
    items = items.without(itemToRemove);
    ```

21. **Invoke permissions with this. and party**: When invoking permissions within a protocol, use `this.` prefix and
    include the party in square brackets:

    ```npl
    // INCORRECT - calling permission like a function
    obligation[provider] processOrder() before deadline | placed {
        startProcessing();
    } otherwise become cancelled;

    // CORRECT - using this. and specifying the party
    obligation[provider] processOrder() before deadline | placed {
        this.startProcessing[provider]();
    } otherwise become cancelled;
    ```

22. **Always include package declaration**: Every NPL file must start with a package declaration:

    ```npl
    // REQUIRED at the beginning of every file
    package payments;

    protocol[buyer, seller] Payment() {
        // Protocol content
    };
    ```

23. **NEVER add docstrings to init blocks**: Init blocks should never have Javadoc docstrings:

    ```npl
    // INCORRECT
    protocol[owner] MyProtocol() {
        /**
         * Initialize protocol state.
         */
        init {
            // Initialization code
        };
    };

    // CORRECT
    protocol[owner] MyProtocol() {
        init {
            // Initialization code (no docstring)
        };
    };
    ```

24. **NO ternary operators**: NPL does not support ternary operations (`condition ? trueValue : falseValue`). Always use
    full if-else statements:

    ```npl
    // INCORRECT - ternary operator does not exist in NPL
    var status = isActive ? "active" : "inactive";

    // CORRECT - use if-else statements
    var status = "";
    if (isActive) {
        status = "active";
    } else {
        status = "inactive";
    };
    ```

25. **DateTime.isBefore/isAfter require inclusive parameter**: Always include the second Boolean parameter that
    indicates whether equality is considered:

    ```npl
    // INCORRECT - missing required inclusive parameter
    if (deadline.isBefore(now())) {
        // Handle late case
    };

    // CORRECT - with required inclusive parameter
    if (deadline.isBefore(now(), false)) {
        // Handle late case (strictly before)
    };

    // CORRECT - inclusive comparison
    if (deadline.isBefore(now(), true)) {
        // Handle late case (before or equal)
    };
    ```

26. **Always initialize variables**: All variables must be initialized when declared. NPL does not support declaring a
    variable without initializing it:

    ```npl
    // INCORRECT - uninitialized variable
    var total;

    // CORRECT - initialize at declaration
    var total = 0;
    ```

27. **Never use undeclared variables**: All variables must be declared with `var` before use. You cannot assign to a
    variable that hasn't been declared:

    ```npl
    // INCORRECT - using variable before declaration
    total = 0;  // Error: total is not declared

    // CORRECT - declare then use
    var total = 0;
    total = total + 100;  // OK: total is already declared
    ```

28. **Don't use reserved keywords as variable names**: Never use NPL reserved keywords like `state`, `protocol`,
    `permission`, `final`, `var`, `init`, etc. as variable names:

    ```npl
    // INCORRECT - using reserved keywords as variable names
    var state = "active";  // Error: 'state' is a reserved keyword
    var final = true;      // Error: 'final' is a reserved keyword

    // CORRECT - use different variable names
    var myState = "active";
    var isFinal = true;
    ```

29. **No while loops**: NPL does not support while loops. Use for-in loops or list methods like map/filter instead:

    ```npl
    // INCORRECT - while loops don't exist in NPL
    var i = 0;
    while (i < 10) {
        // Do something
        i = i + 1;
    };

    // CORRECT - use for-in loop with a list
    for (i in listOfSize(10, function(idx) -> idx)) {
        // Do something with i
    };

    // CORRECT - use map for transformations
    var results = items.map(function(item) -> processItem(item));
    ```

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
// Basic instantiation (only possible if protocol is annotated with @api)
var instance = ProtocolName[alice, bob](42, "example");

// With named arguments
var namedInstance = ProtocolName[party1 = alice, party2 = bob](
  initialValue = 42, textParameter = "example"
);
```

## Permissions

```npl
@api  // Required for API instantiation
protocol[issuer, recipient] Transfer() {
  /**
   * Allows the issuer to send money.
   * @param amount Amount to send.
   * @return Success status.
   */
  permission[issuer] sendMoney(amount: Number) returns Boolean {
    return true;
  };

  /**
   * Allows either party to check balance.
   * @return Current balance.
   */
  permission[issuer | recipient] checkBalance() returns Number {
    return 100;
  };
};
```

### Require Conditions

```npl
permission[sender] transfer(amount: Number) {
  require(amount > 0, "Amount must be positive");
  require(balance >= amount, "Insufficient balance");
  // Permission body
};
```

## States

```npl
@api  // Required for API instantiation
protocol[buyer, seller] Purchase() {
  initial state created;
  state pending;
  state shipped;
  final state delivered;
  final state cancelled;
};
```

### States as Guards and Transitions

```npl
// Permission only valid in created or pending states
permission[buyer] cancelOrder() | created, pending {
  become cancelled;
};

// Transition to shipped state
permission[seller] shipOrder() | pending {
  become shipped;
};
```

## Protocol State Methods

1. **activeState() returns Optional**: Always unwrap with `getOrFail()` or `getOrElse()`:

   ```npl
   // CORRECT
   if (protocol.activeState().getOrFail() == MyProtocol.States.pending) {
     // Do something
   };
   ```

2. **Handling state checks safely**:
   ```npl
   // Using getOrElse or checking presence
   var state = protocol.activeState().getOrElse(MyProtocol.States.created);
   ```

## Standard Library

NPL has a defined standard library. **Never invent or assume the existence of methods that aren't documented.**

### Available Types

1. **Basic Types**: `Boolean`, `Number`, `Text`, `DateTime`, `LocalDate`, `Duration`, `Period`, `Blob`, `Unit`
2. **Collection Types**: `List<T>`, `Set<T>`, `Map<K, V>`
3. **Complex Types**: `Optional<T>`, `Pair<A, B>`, `Party`, `Test`
4. **User-Defined Types**: `Enum`, `Struct`, `Union`, `Identifier`, `Symbol`, `Protocol`

### Standard Library Functions

1. **Logging**: `debug()`, `info()`, `error()`
2. **Constructors**: `listOf()`, `setOf()`, `mapOf()`, `optionalOf()`, `dateTimeOf()`, `localDateOf()`
3. **Time and Duration**: `now()`, `millis()`, `seconds()`, `minutes()`, `hours()`, `days()`, `weeks()`, `months()`,
   `years()`

### Allowed Methods by Type

Use ONLY these methods - do not hallucinate or invent others:

1. **Collection Methods (all collections)**:

   - `allMatch()`, `anyMatch()`, `contains()`, `flatMap()`, `fold()`, `forEach()`, `isEmpty()`, `isNotEmpty()`
   - `map()`, `noneMatch()`, `size()`, `asList()`
   - Collections of `Number`: `sum()`

2. **List Methods**:

   - `filter()`, `findFirstOrNone()`, `firstOrNone()`, `get()`, `head()`, `indexOfOrNone()`, `lastOrNone()`, `plus()`
   - `reverse()`, `sort()`, `sortBy()`, `tail()`, `toSet()`, `with()`, `withAt()`, `without()`, `withoutAt()`
   - `withIndex()`, `zipOrFail()`, `takeFirst()`, `takeLast()`, `toMap()`

3. **Map Methods**:

   - `filter()`, `forEach()`, `getOrNone()`, `isEmpty()`, `isNotEmpty()`, `keys()`, `plus()`, `size()`
   - `mapValues()`, `values()`, `with()`, `without()`, `toList()`

4. **Set Methods**:

   - `filter()`, `plus()`, `toList()`, `with()`, `without()`, `takeFirst()`, `takeLast()`

5. **Text Methods**:

   - `plus()`, `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`, `length()`

6. **Number Methods**:

   - `isInteger()`, `roundTo()`, `negative()`, `plus()`, `minus()`, `multiplyBy()`, `divideBy()`, `remainder()`
   - `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`

7. **Boolean Methods**:

   - `not()`

8. **DateTime Methods**:

   - `day()`, `month()`, `year()`, `nano()`, `second()`, `minute()`, `hour()`, `zoneId()`
   - `firstDayOfYear()`, `lastDayOfYear()`, `firstDayOfMonth()`, `lastDayOfMonth()`, `startOfDay()`
   - `durationUntil()`, `isAfter()`, `isBefore()`, `isBetween()`, `withZoneSameLocal()`, `withZoneSameInstant()`
   - `plus()`, `minus()`, `toLocalDate()`, `dayOfWeek()`

9. **Duration Methods**:

   - `toSeconds()`, `plus()`, `minus()`, `multiplyBy()`

10. **LocalDate Methods**:

    - `day()`, `month()`, `year()`, `firstDayOfYear()`, `lastDayOfYear()`, `firstDayOfMonth()`, `lastDayOfMonth()`
    - `isAfter()`, `isBefore()`, `isBetween()`, `plus()`, `minus()`, `periodUntil()`, `atStartOfDay()`, `dayOfWeek()`

11. **Period Methods**:

    - `plus()`, `minus()`, `multiplyBy()`

12. **Optional Methods**:

    - `isPresent()`, `getOrElse()`, `getOrFail()`, `computeIfAbsent()`

13. **Party Methods**:

    - `sameEntityAs()`, `containsEntityValuesOf()`, `isRepresentableBy()`, `mayRepresent()`, `entity()`, `access()`

14. **Protocol Methods**:

    - `parties()`, `activeState()`, `initialState()`, `finalStates()`

15. **Blob Methods**:

    - `filename()`, `mimeType()`

16. **Symbol Methods**:

    - `toNumber()`, `unit()`, `plus()`, `minus()`, `multiplyBy()`, `divideBy()`, `remainder()`, `negative()`
    - `lessThan()`, `greaterThan()`, `lessThanOrEqual()`, `greaterThanOrEqual()`

17. **General Methods**:
    - All types: `toText()` - converts value to Text representation

### Important Guidelines

1. **Don't hallucinate methods**: Only use methods listed above.
2. **Immutable collections**: `with()` and `without()` create new collections.
3. **No advanced functional operations**: No streams, reduce, unless documented above.

## Type System

```npl
// Basic types
var amount = 100;
var name = "John";
var isValid = true;
var today = localDateOf(2023, 5, 15);

// Collections
var numbers = listOf(1, 2, 3);
var uniqueNumbers = setOf(1, 2, 3);
var userScores = mapOf(Pair("alice", 95), Pair("bob", 87));

// Optionals
var presentValue = optionalOf(42);
var emptyValue = optionalOf<Number>();
var value = presentValue.getOrElse(0);
```

## Control Flow

```npl
// If-else
if (amount > 100) {
  return "High value";
} else if (amount > 50) {
  return "Medium value";
} else {
  return "Low value";
};

// For loops
for (item in itemsList) {
  totalPrice = totalPrice + item.price;
};

// Match expressions
var result = match(paymentStatus) {
  Pending -> "Please wait"
  Completed -> "Thank you"
  Failed -> "Please try again"
};
```

## Functions

```npl
/**
 * Calculates tax for an amount.
 * @param amount The amount.
 * @return The tax amount.
 */
function calculateTax(amount: Number) returns Number -> {
  return amount * 0.2;
};

// Anonymous function (lambda)
var doubleValue = function(x: Number) -> x * 2;
```

## Full Example: IOU Protocol

Here's a complete example of an IOU (I Owe You) protocol with comments:

```npl
package iou;

// Helper struct to track payment amounts with timestamps
/**
 * Stores an amount paid along with the timestamp of the payment.
 */
struct TimestampedAmount {
    amount: Number,
    timestamp: DateTime
};

/**
 * Calculates the total sum of amounts from a list of timestamped payments.
 * @param payments A list of TimestampedAmount structs.
 * @return The total calculated amount.
 */
function total(payments: List<TimestampedAmount>) returns Number -> {
    var result = 0;
    for (payment in payments) {
        result = result + payment.amount;
    }
    return result;
};

/**
 * Represents an IOU (I Owe You) agreement between an issuer (debtor) and a payee (creditor).
 * Tracks the amount owed, payments made, and handles deadlines and late fees.
 * @param forAmount The initial amount of the debt.
 * @param paymentDeadline The date by which the full amount must be paid.
 * @param lateFee The fee applied if the payment is late.
 */
@api
protocol[issuer, payee] Iou(
    // Initial parameters with validation
    var forAmount: Number,
    var paymentDeadline: DateTime,
    var lateFee: Number
) {
    // Input validation with descriptive error messages
    require(forAmount > 0, "Initial amount must be strictly positive");
    require(
        paymentDeadline.isAfter(now() + months(1), false),
        "Payment deadline must be at least one month in the future"
    );
    require(lateFee > 0, "Late fee must be strictly positive");

    // State machine definition - protocol transitions through these states
    initial state unpaid;  // Starting state
    state default;         // When in late payment
    final state paid;      // Successfully paid off
    final state forgiven;  // Debt forgiven by payee

    // Private variable to track all payments made
    private var payments = listOf<TimestampedAmount>();

    /**
     * Calculates the remaining amount owed based on the initial amount and payments made.
     * @return The current amount still owed.
     */
    function amountOwed() returns Number -> {
        return forAmount - total(payments);
    };

    /**
     * Obligation for the issuer to pay a certain amount towards the debt before the deadline.
     * Can only be fulfilled if the protocol is in the 'unpaid' or 'default' state.
     * If the deadline passes without full payment, the state transitions to 'default'.
     * @param amount The amount being paid.
     */
    @api
    obligation[issuer] pay(amount: Number) before paymentDeadline | unpaid, default {
        require(amount > 0, "Amount must be strictly positive");
        require(amount <= amountOwed(), "Amount may not exceed amount owed");

        // Record the payment with current timestamp
        var p = TimestampedAmount(amount = amount, timestamp = now());
        payments = payments.with(p);

        // If fully paid, transition to paid state
        if (amountOwed() == 0) {
            become paid;
        };
    } otherwise become default;  // IMPORTANT: 'otherwise' clauses can ONLY use 'become' statements
                                // and cannot contain any additional behavior

    /**
     * Allows the payee to charge a late fee if the protocol is in the 'default' state.
     * Increases the owed amount by the late fee, sets a new deadline one month from now,
     * and transitions the state back to 'unpaid'.
     */
    @api
    permission[payee] chargeLatePaymentFee() | default {
        forAmount = forAmount + lateFee;
        paymentDeadline = now() + months(1);

        become unpaid;  // Reset to unpaid state with new deadline
    };

    /**
     * Allows the payee to forgive the remaining debt.
     * Transitions the protocol to the 'forgiven' final state.
     * Can only be invoked if the protocol is in the 'unpaid' or 'default' state.
     */
    @api
    permission[payee] forgive() | unpaid, default {
        become forgiven;
    };

    /**
     * Allows either party to check the current amount owed.
     * @return The current amount still owed.
     */
    @api
    permission[issuer | payee] getAmountOwed() returns Number {
        return amountOwed();
    };
};

## Common NPL Patterns

1. **State-driven permissions**: Using protocol states to control which permissions are available
2. **Input validation**: Using `require` statements to validate inputs with clear error messages
3. **Party-specific permissions**: Limiting permissions to specific parties
4. **Obligation pattern**: Using `before` clauses to create time-bound obligations. Obligations end with an
   `otherwise become somePenalState;` clause which must not contain any behavior or logic beyond the state transition.
5. **Helper functions**: Creating private functions for reusable logic

<!-- END NPL DEVELOPMENT SECTION -->
```
