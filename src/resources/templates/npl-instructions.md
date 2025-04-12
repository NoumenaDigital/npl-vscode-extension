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

## Common Pitfalls for AI Models

1. **Text, not String**: NPL uses `Text` type, not `String`. Always use `Text` for string values.
2. **No null values**: NPL does not have `null` or nullable types (no Kotlin-like `?` syntax). Use `Optional<T>`
   instead.
3. **Optional handling**: Access optional values with `getOrElse()`, `getOrFail()`, or `computeIfAbsent()`. Check if a
   value exists with `isPresent()`.
4. **Party limitations**: The `Party` type cannot be freely used in user-defined code.
5. **Always use semicolons**: ALWAYS include semicolons at the end of conditionls (if and if-else), statements,
   permissions, protocols, etc (they are typically required).
6. **Conditional clauses**: Always use if or if-else clauses for conditionals. There are NO ternary operators in NPL (no
   `?:` syntax). Always use full if-else statements.
7. **Initialization**: Initialization behavior should be defined inside the `init` block. Other behavior should be part
   of functions, permissions, or obligations.
8. **Imports**: NEVER import things from files you haven't seen. Define everything you need in the file you are
   creating.
9. **Otherwise clauses**: In obligations, the `otherwise` clause MUST ONLY contain a state transition
   (`otherwise become someState;`) and CANNOT contain any additional behavior or logic.
10. **End if statements with semicolons**: ALWAYS include semicolons after if statements, even when they have blocks:

```npl
if (amount > 100) {
  return "High value";
}; // Semicolon required here
```

11. **No Any type**: NPL does NOT have an `Any` type. Use specific types or union types for mixed-type scenarios:

```npl
union PaymentInfo {
  Number,
  Text
};
```

12. **Requires outside init blocks**: Place `require` statements at the protocol level after parameter declarations, NOT
    inside `init` blocks:

```npl
protocol[issuer, payee] Contract(var amount: Number) {
  require(amount > 0, "Amount must be positive"); // Correct placement

  init {
    // Init logic here, no requires
  };
};
```

## Protocol Syntax

### Protocol Declaration

```npl
/**
 * Represents a basic protocol structure between two parties.
 * The party1 is the first party involved in the protocol.
 * The party2 is the second party involved in the protocol.
 * @param initialValue An initial numeric value for the protocol.
 * @param textParameter A text parameter for the protocol.
 */
protocol[party1, party2] ProtocolName(
  var initialValue: Number,
  var textParameter: Text
) {
    init {
        // Behavior that runs on instantiation goes here
    };
    // Protocol body
};
```

### Protocol Instantiation

```npl
// Basic instantiation
var protocolInstance = ProtocolName[alice, bob](42, "example text");

// With named arguments
var namedInstance = ProtocolName[
  party1 = alice,
  party2 = bob
](
  initialValue = 42,
  textParameter = "example text"
);
```

Protocols annotated with `@api` can be instantiated from the API.

## Permissions

### Declaring Permissions

```npl
/**
 * Protocol demonstrating different permission structures between an issuer and recipient.
 */
protocol[issuer, recipient] Transfer() {
  /**
   * Allows the issuer to send money.
   * @param amount The amount of money to send.
   * @return true if the transfer was successful, false otherwise.
   */
  permission[issuer] sendMoney(amount: Number) returns Boolean {
    // Permission body
    return true;
  };

  /**
   * Allows either the issuer or recipient to check the balance.
   * @return The current balance.
   */
  permission[issuer | recipient] checkBalance() returns Number {
    // Permission body
    return 100;
  };
};
```

### Invoking Permissions

```npl
var transfer = Transfer[alice, bob]();

// Invoke permission as alice
var result = transfer.sendMoney[alice](50);

// Invoke permission as bob
var balance = transfer.checkBalance[bob]();
```

### Require Conditions

```npl
/**
 * Transfers a specified amount, requiring it to be positive and within balance.
 * @param amount The amount to transfer.
 */
permission[sender] transfer(amount: Number) {
  require(amount > 0, "Amount must be positive");

  require(balance >= amount, "Insufficient balance");

  // Rest of permission body
};
```

## States

### Declaring States

```npl
/**
 * Protocol demonstrating state management for a purchase process between a buyer and seller.
 */
protocol[buyer, seller] Purchase() {
  initial state created;
  state pending;
  state shipped;
  final state delivered;
  final state cancelled;

  // Protocol body
};
```

### States as Guards

```npl
/**
 * Allows the buyer to cancel the order only when it's in 'created' or 'pending' state.
 */
// This permission can only be invoked when in created or pending states
permission[buyer] cancelOrder() | created, pending {
  // Permission body
};
```

### State Transitions

```npl
/**
 * Allows the seller to ship the order when it's in the 'pending' state,
 * transitioning the protocol to the 'shipped' state.
 */
permission[seller] shipOrder() | pending {
  // Permission logic

  // Transition to shipped state
  become shipped;
}
```

### Interacting with States

```npl
/**
 * A simple protocol with states to demonstrate state interaction.
 * The protocol has a single owner party.
 */
protocol[owner] StatefulProtocol() {
  initial state active;
  final state inactive;
}

// Using the protocol's States
var myProtocol = StatefulProtocol[alice]();

// Get all possible states
var allStates = StatefulProtocol.States.variants();

// Get the initial state
var initialState = myProtocol.initialState();

// Get all final states
var finalStates = myProtocol.finalStates();

// Get current active state
var currentState = myProtocol.activeState();
```

## Party System

Parties are entities that interact with protocols. They define permissions and control who can perform which actions.

### Entity and Access

Entity represents the identity of a party (immutable), while access represents the party's current access rights (can be
changed via API).

### Observers

Observers can view protocol instances but need explicit permissions.

```npl
/**
 * Protocol demonstrating how to manage observers.
 * The protocol has a single owner party who can manage observers.
 */
protocol[owner] Observable() {
  // All protocols have an implicit observers field
  // of type Map<Text, Party>

  /**
   * Allows the owner to add a new observer party.
   * The newObserver represents the party to be added as an observer.
   * @param name The name to associate with the new observer.
   */
  permission[*newObserver & owner] addObserver(name: Text) {
    observers = observers.with(name, newObserver);
  };

  /**
   * Allows the owner to remove an observer by name.
   * @param name The name of the observer to remove.
   */
  permission[owner] removeObserver(name: Text) {
    observers = observers.without(name);
  };
};
```

## Type System

### Basic Types

```npl
// Number
var amount = 100;
var price = 19.99;
var calculatedValue = amount * 0.2 + price;

// Text (not String!)
var firstName = "John";
var lastName = "Doe";
var fullName = firstName + " " + lastName;

// Boolean
var isValid = true;
var isComplete = false;
var combinedCheck = isValid && !isComplete;

// Date and Time
var today = localDateOf(2023, 5, 15);
var timestamp = dateTimeOf(
  2023, 5, 15, 14, 30,
  valueOfZoneId(ZoneId.EUROPE_ZURICH)
);

// Duration
var waitPeriod = days(3).plus(hours(12)).minus(minutes(30));

// Period
var loanTerm = months(6).plus(days(15));
```

### Optionals

NPL does not have `null`, but uses `Optional<T>` for values that might not be present. `Optional<T>` is a union type
between `Some<T>` and `None`.

```npl
/**
 * Examples of working with Optional values in NPL.
 */

// Present optional
var presentValue = optionalOf(42);

// Empty optional
var emptyValue = optionalOf<Number>();

// Accessing values
var valueOrDefault = presentValue.getOrElse(0);
var extractedValue = presentValue.getOrFail(); // Throws exception if empty

// Checking if present
var hasValue = presentValue.isPresent();

// Lazy computation for default value
var lazyValue = emptyValue.computeIfAbsent(function() -> {
  // Complex computation only executed if optional is empty
  return calculateDefaultValue();
});
```

### Collections

```npl
/**
 * Examples of working with collection types in NPL.
 */

// List (ordered, allows duplicates)
var numbers = listOf(1, 2, 3, 2, 4);
var firstItem = numbers.get(0);
var withNewItem = numbers.with(5);

// Set (unordered, no duplicates)
var uniqueNumbers = setOf(1, 2, 3, 4);
var hasThree = uniqueNumbers.contains(3);

// Map (key-value pairs)
var userScores = mapOf(
  Pair("alice", 95),
  Pair("bob", 87)
);
var aliceScore = userScores.get("alice").getOrElse(0);
```

### User-Defined Types

#### Structs

```npl
/**
 * Represents a person with name, age, and optional address.
 */
struct Person {
  name: Text,
  age: Number,
  address: Optional<Text>
};

// Creation
var person = Person(
  name = "Alice",
  age = 30,
  address = optionalOf("123 Main St")
);

// Copying with changes
var updatedPerson = person.copy(age = 31);
```

#### Enums

```npl
/**
 * Represents the possible statuses of a payment.
 */
enum PaymentStatus {
  Pending,
  Completed,
  Failed
};

// Usage
var status = PaymentStatus.Pending;

// Matching on enum values
var statusText = match(status) {
  PaymentStatus.Pending -> "Payment is pending"
  PaymentStatus.Completed -> "Payment completed"
  PaymentStatus.Failed -> "Payment failed"
};
```

#### Unions

```npl
/**
 * Represents a payment method which can be either a bank transfer ID (Text)
 * or a card number (Number).
 */
union PaymentMethod {
  Text,  // For bank transfer IDs
  Number // For card numbers
};

// Usage
var bankPayment = PaymentMethod("TX123456");
var cardPayment = PaymentMethod(4111111111111111);
```

#### Identifiers

```npl
/**
 * A unique identifier for transactions.
 */
identifier TransactionId;

// Creation
var txId = TransactionId();

// Usage
var transactionMap = mapOf(Pair(txId, "Completed"));
```

#### Symbols

```npl
/**
 * Represents the US Dollar currency symbol.
 */
symbol USD;

// Usage
var amount = USD(199.99);
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
}

// Match expressions
var result = match(paymentStatus) {
  PaymentStatus.Pending -> "Please wait"
  PaymentStatus.Completed -> "Thank you"
  PaymentStatus.Failed -> "Please try again"
};

// Match with default case
var simpleResult = match(paymentStatus) {
  PaymentStatus.Completed -> "Success"
  else -> "Not completed"
};
```

## Functions and Lambdas

```npl
/**
 * Calculates tax based on a given amount.
 * @param amount The amount to calculate tax for.
 * @return The calculated tax amount.
 */
function calculateTax(amount: Number) returns Number -> {
  return amount * 0.2;
};

/**
 * Adds a fixed fee to a given amount.
 * @param amount The amount to add the fee to.
 * @return The amount plus the fee.
 */
function addFee(amount: Number) returns Number -> amount + 10;

// Anonymous function (lambda)
var doubleValue = function(x: Number) -> x * 2;

// Using lambdas with collections
var doubledPrices = prices.map(doubleValue);
var expensiveItems = items.filter(function(item) -> item.price > 100);
```

## Logging

```npl
// Debug level logging
debug("Processing transaction");
debug(transactionData);

// Info level logging
info("Transaction completed");

// Error level logging
error("Failed to process payment");
error(paymentDetails);
```

## Testing

```npl
/**
 * Tests the payment processing logic of a hypothetical Payment protocol.
 * @param t The test context provided by the NPL testing framework.
 */
@test
function testPaymentProcessing(t: Test) {
  // Setup
  var payment = Payment[alice, bob](100);

  // Execute
  var result = payment.process[alice]();

  // Assert
  t.assertTrue(result);
  t.assertEquals(PaymentStatus.Completed, payment.status());
  t.assertFails(function() -> payment.refund[bob](200));
}
```

## Standard Library

NPL has a defined standard library with specific functions, operators, and types. **Never invent or assume the existence
of methods or functions that are not explicitly documented.**

### Available Types

1. **Basic Types**:

   - `Boolean` - true/false values
   - `Number` - numeric values (both integers and decimals)
   - `Text` - text strings (not String!)
   - `DateTime` - date and time with timezone
   - `LocalDate` - date without time component
   - `Duration` - amount of time (seconds, minutes, hours)
   - `Period` - calendar-based amount of time (days, months, years)
   - `Blob` - binary data
   - `Unit` - represents "no value" (similar to void)

2. **Collection Types**:

   - `List<T>` - ordered collection allowing duplicates
   - `Set<T>` - unordered collection without duplicates
   - `Map<K, V>` - key-value pairs

3. **Complex Types**:

   - `Optional<T>` - represents a value that may or may not be present
   - `Pair<A, B>` - a tuple of two values
   - `Party` - represents a participant in a protocol
   - `Test` - used in test functions

4. **User-Defined Types**:
   - `Enum` - fixed set of named values
   - `Struct` - composite data structure
   - `Union` - represents a value that could be one of several types
   - `Identifier` - unique identifier
   - `Symbol` - named constant value
   - `Protocol` - defines protocol behavior

### Standard Library Functions

1. **Logging**:

   - `debug(value)` - logs a debug statement
   - `info(value)` - logs an info statement
   - `error(value)` - logs an error statement

2. **Constructors**:

   - `listOf<T>(value1, value2, ...)` - creates a List
   - `setOf<T>(value1, value2, ...)` - creates a Set
   - `mapOf<K, V>(Pair(key1, value1), ...)` - creates a Map
   - `optionalOf<T>()` - creates an empty Optional
   - `optionalOf<T>(value)` - creates an Optional with a value
   - `dateTimeOf(year, month, day, hour, minute, zoneId)` - creates DateTime
   - `localDateOf(year, month, day)` - creates LocalDate

3. **Time and Duration**:
   - `now()` - current DateTime (fixed for transaction)
   - `millis(value)` - creates Duration of milliseconds
   - `seconds(value)` - creates Duration of seconds
   - `minutes(value)` - creates Duration of minutes
   - `hours(value)` - creates Duration of hours
   - `days(value)` - creates Period of days
   - `weeks(value)` - creates Period of weeks
   - `months(value)` - creates Period of months
   - `years(value)` - creates Period of years
   - `valueOfZoneId(ZoneId.ZONE_NAME)` - converts ZoneId to Text

### Common Methods on Types

1. **List Methods**:

   - `list.get(index)` - gets element at index
   - `list.size()` - returns list size
   - `list.isEmpty()` - checks if list is empty
   - `list.with(value)` - returns new list with value added
   - `list.without(index)` - returns new list with element removed
   - `list.map(function)` - transforms each element
   - `list.filter(function)` - filters elements by predicate

2. **Map Methods**:

   - `map.get(key)` - returns Optional of value for key
   - `map.size()` - returns map size
   - `map.isEmpty()` - checks if map is empty
   - `map.with(key, value)` - returns new map with entry added
   - `map.without(key)` - returns new map with entry removed
   - `map.containsKey(key)` - checks if key exists

3. **Set Methods**:

   - `set.contains(value)` - checks if value exists
   - `set.size()` - returns set size
   - `set.isEmpty()` - checks if set is empty
   - `set.with(value)` - returns new set with value added
   - `set.without(value)` - returns new set with value removed

4. **Optional Methods**:

   - `optional.isPresent()` - checks if value exists
   - `optional.getOrElse(defaultValue)` - returns value or default
   - `optional.getOrFail()` - returns value or throws exception
   - `optional.computeIfAbsent(function)` - computes value if absent

5. **DateTime/Duration/Period Methods**:
   - `dateTime.plus(duration)` - adds duration
   - `dateTime.minus(duration)` - subtracts duration
   - `dateTime.isAfter(otherDateTime)` - compares timestamps
   - `dateTime.isBefore(otherDateTime)` - compares timestamps
   - `duration.plus(otherDuration)` - adds durations
   - `duration.minus(otherDuration)` - subtracts durations

### Important Guidelines

1. **Don't hallucinate methods**: Only use methods that are explicitly documented or that you've seen in the codebase
   examples.
2. **Check method existence**: If unsure about a method, check if it's used elsewhere in the code or mentioned in
   documentation.
3. **Common collections methods**: Collections typically support standard methods like `get()`, `contains()`, `with()`,
   `without()`, `map()`, `filter()`, but don't assume advanced or language-specific operations.
4. **Familiar naming patterns**: Method names follow Java-like conventions (e.g., `isPresent()`, `getOrElse()`) rather
   than Ruby, Python, or other language conventions.
5. **No implicit conversions**: NPL requires explicit type conversions; types don't automatically coerce to others.
6. **Immutable collections**: Collection operations like `with()` and `without()` create new collections rather than
   modifying the original.
7. **No streams or advanced functional operations**: Don't assume advanced operations like streams, flatMap, reduce,
   etc. unless explicitly documented.

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
```

## Common NPL Patterns

1. **State-driven permissions**: Using protocol states to control which permissions are available
2. **Input validation**: Using `require` statements to validate inputs with clear error messages
3. **Party-specific permissions**: Limiting permissions to specific parties
4. **Obligation pattern**: Using `before` clauses to create time-bound obligations. Obligations end with an
   `otherwise become somePenalState;` clause which must not contain any behavior or logic beyond the state transition.
5. **Helper functions**: Creating private functions for reusable logic

<!-- END NPL DEVELOPMENT SECTION -->
