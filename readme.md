# SAP CAP — Event Handlers（before / on / after）

CAP's Event Handler mechanism allows you to inject custom business logic at different stages of an OData request lifecycle.

---

## Execution Order

```
Incoming OData request
        ↓
  before()   →  validate, intercept, modify request data
        ↓
    on()     →  execute core business logic
        ↓
  after()    →  transform response data, trigger side effects
        ↓
Return OData response
```

---

## Comparison

| | `before` | `on` | `after` |
|---|---|---|---|
| When it runs | Before database operation | Replaces default handler | After database operation |
| Typical use | Validation, auth checks, modifying input | Custom actions, overriding CRUD | Appending computed fields, sending notifications |
| First argument | `req` (request) | `req` (request) | `data` (result) |
| Can abort request | ✅ via `req.error()` | ✅ via `req.error()` | ❌ request already completed |
| Default CRUD runs | ✅ continues | ❌ replaced | ✅ already ran |

---

## Basic Usage

```js
module.exports = class CatalogService extends cds.ApplicationService {
  async init() {
    const { Books, Orders } = this.entities

    // before: gatekeeper — validate and intercept
    this.before('CREATE', Orders, async req => {
      const { book_ID, amount } = req.data
      const book = await SELECT.one.from(Books).where({ ID: book_ID })
      if (!book)               return req.error(404, 'Book not found')
      if (book.stock == null)  return req.error(500, 'Stock data is invalid')
      if (book.stock < amount) return req.error(409, `Insufficient stock, available: ${book.stock}`)
    })

    // on: worker — handle custom action
    this.on('submitOrder', async req => {
      const { bookID, amount } = req.data
      const book = await SELECT.one.from(Books).where({ ID: bookID })
      if (!book)               return req.error(404, 'Book not found')
      if (book.stock == null)  return req.error(500, 'Stock data is invalid')
      if (book.stock < amount) return req.error(409, 'Insufficient stock')

      await UPDATE(Books).set({ stock: book.stock - amount }).where({ ID: bookID })
      await INSERT.into(Orders).entries({ book_ID: bookID, amount })

      return { message: `Order placed successfully for "${book.title}" x${amount}` }
    })

    // after: post-processor — enrich response data
    this.after('READ', Books, books => {
      if (!books) return
      const list = Array.isArray(books) ? books : [books]
      for (const book of list) {
        if (book.price != null) {
          book.discountPrice = +(book.price * 0.9).toFixed(2)
          book.discountLabel = `10% off: $${book.discountPrice}`
        }
      }
    })

    return super.init()
  }
}
```

---

## req Object — Common Properties

| Property | Description | Example |
|---|---|---|
| `req.data` | Request payload / action parameters | `{ book_ID: 1, amount: 2 }` |
| `req.params` | URL key parameters | `req.params[0].ID` |
| `req.user` | Current user | `req.user.is('admin')` |
| `req.method` | HTTP method | `'GET'` / `'POST'` |
| `req.event` | Event name | `'READ'` / `'submitOrder'` |
| `req.target` | Target entity metadata | `req.target.name` |
| `req.error(code, msg)` | Throw error and abort request | `req.error(409, 'Insufficient stock')` |
| `req.notify(msg)` | Send info message (non-blocking) | `req.notify('Logged successfully')` |

---

## Gotchas

**`return super.init()` must be the last line**
```js
async init() {
  this.before(...)
  this.on(...)
  this.after(...)
  return super.init()  // ✅ always last, always return
}
```

**`INSERT/UPDATE/SELECT` inside `on` bypasses all handlers**
```js
// Goes directly to the database layer — before/on/after are NOT triggered
await INSERT.into(Orders).entries({ ... })

// Use this.send() if you want handlers to be triggered
await this.send('CREATE', 'Orders', { ... })
```

**`before` is NOT triggered by custom actions**
```
POST /catalog/Orders       →  triggers before('CREATE', Orders)
POST /catalog/submitOrder  →  triggers on('submitOrder') only, before is NOT triggered
```

**`null` vs `undefined` comparison trap**
```js
undefined < 99  // false → validation silently passes ❌
null < 99       // true  → null is coerced to 0 ❌

// ✅ Always check explicitly first
if (book.stock == null)  return req.error(500, 'Stock data is invalid')
if (book.stock < amount) return req.error(409, 'Insufficient stock')
```

**DELETE returns 204, not 200**
```
204 No Content  →  deletion successful (OData standard, expected behaviour)
```

---

## Sample HTTP Requests

```http
# Triggers after('READ', Books) — response includes discountPrice
GET /odata/v4/catalog/Books

# Triggers before('CREATE', Orders) — stock validation
POST /odata/v4/catalog/Orders
Content-Type: application/json
{ "book_ID": 1, "amount": 99 }

# Triggers on('submitOrder')
POST /odata/v4/catalog/submitOrder
Content-Type: application/json
{ "bookID": 1, "amount": 2 }

# Triggers before('DELETE', Books)
DELETE /odata/v4/catalog/Books/1
```
