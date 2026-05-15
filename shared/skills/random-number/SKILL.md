---
name: random-number
description: Generate random numbers using bash. Supports ranges, multiple values, and seeded output.
disable-model-invocation: false
---

# Random Number Generation with bash

Use `$RANDOM` (0-32767) or `/dev/urandom` for random numbers.

## Single random number

```sh
echo $RANDOM
```

## Random number in a range (e.g. 1-100)

```sh
echo $(( RANDOM % 100 + 1 ))
```

## Multiple random numbers

```sh
for i in {1..5}; do echo $(( RANDOM % 100 + 1 )); done
```

## Cryptographically random integer (using /dev/urandom)

```sh
od -An -tu4 -N4 /dev/urandom | tr -d ' '
```
